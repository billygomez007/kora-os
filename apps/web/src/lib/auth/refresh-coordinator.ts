import {
  broadcastAuthSignal,
  startAuthChannel,
  type AuthInvalidationMessage,
} from "./channel.ts";
import {
  getGeneration,
  isCurrentGeneration,
  setAuthenticated,
} from "./store.ts";

export const BROWSER_REFRESH_LOCK_NAME = "kora-auth-refresh";

const DEFAULT_WAIT_TIMEOUT_MS = 5_000;

export interface BrowserAccessTokenRecovery {
  user: {
    id: string;
    email: string | null;
    displayName: string;
  };
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  session: {
    id: string;
    expiresAt: string;
  };
}

export class BrowserAccessTokenRecoveryError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BrowserAccessTokenRecoveryError";
    this.status = status;
  }
}

export class StaleAuthGenerationError extends Error {
  constructor() {
    super("The Kora session changed while authentication was in flight.");
    this.name = "StaleAuthGenerationError";
  }
}

export class RefreshCoordinationUnavailableError extends Error {
  constructor() {
    super("Coordinated browser refresh is unavailable in this browser.");
    this.name = "RefreshCoordinationUnavailableError";
  }
}

export interface CoordinationOptions<T> {
  generation?: number;
  rotate: () => Promise<T>;
  recover: () => Promise<T>;
  waitTimeoutMs?: number;
}

interface RefreshWaiter {
  afterVersion: number;
  resolve: (completed: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

let latestRefreshVersion = 0;
let localVersion = 0;
let channelUnsubscribe: (() => void) | null = null;
let inFlight: Promise<unknown> | null = null;
const waiters = new Set<RefreshWaiter>();

/**
 * Coordinate a future cookie-first refresh without changing the current B1
 * body-token path. A tab that does not acquire the Web Lock never rotates a
 * refresh cookie; it waits for a lifecycle signal and recovers its own
 * access token instead. This remains safe if the signal is delayed or lost:
 * the waiter still calls the non-rotating recovery callback after timeout.
 */
export function coordinateBrowserRefresh<T>(
  options: CoordinationOptions<T>,
): Promise<T> {
  if (inFlight) return inFlight as Promise<T>;

  ensureRefreshChannel();
  const generation = options.generation ?? getGeneration();
  const startingVersion = latestRefreshVersion;

  const run = runCoordinatedRefresh({
    ...options,
    generation,
    startingVersion,
  });
  inFlight = run;

  void run.then(
    () => {
      if (inFlight === run) inFlight = null;
    },
    () => {
      if (inFlight === run) inFlight = null;
    },
  );

  return run;
}

/**
 * Dormant browser-cookie recovery client. It is intentionally not imported by
 * the current B1 API client or bootstrap path. Successful results are
 * committed only to the in-memory auth store and are rejected if logout or a
 * newer auth transition advanced the generation while the request was away.
 */
export async function recoverBrowserAccessToken(
  options: {
    apiBase?: string;
    expectedGeneration?: number;
  } = {},
): Promise<BrowserAccessTokenRecovery> {
  const generation = options.expectedGeneration ?? getGeneration();
  const apiBase = options.apiBase ?? configuredApiBase();

  let response: Response;
  try {
    response = await fetch(`${apiBase}/v1/auth/browser-access-token`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Kora-Client": "web",
      },
      body: "{}",
    });
  } catch (cause) {
    throw new BrowserAccessTokenRecoveryError(
      0,
      cause instanceof Error
        ? cause.message
        : "Kora could not recover your browser session.",
    );
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new BrowserAccessTokenRecoveryError(
      response.status,
      response.status === 401
        ? "Your Kora session has expired. Please sign in again."
        : "Kora could not recover your browser session.",
    );
  }

  const result = parseRecoveryResponse(payload);
  if (!isCurrentGeneration(generation)) {
    throw new StaleAuthGenerationError();
  }

  if (
    !setAuthenticated(
      {
        accessToken: result.accessToken,
        accessTokenExpiry:
          Date.now() + result.accessTokenExpiresInSeconds * 1000,
        user: result.user,
        sessionId: result.session.id,
        sessionExpiresAt: result.session.expiresAt,
      },
      generation,
    )
  ) {
    throw new StaleAuthGenerationError();
  }

  return result;
}

export function resetRefreshCoordinatorForTests(): void {
  channelUnsubscribe?.();
  channelUnsubscribe = null;
  latestRefreshVersion = 0;
  localVersion = 0;
  inFlight = null;

  for (const waiter of waiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(false);
  }
  waiters.clear();
}

async function runCoordinatedRefresh<T>(options: {
  generation: number;
  startingVersion: number;
  rotate: () => Promise<T>;
  recover: () => Promise<T>;
  waitTimeoutMs?: number;
}): Promise<T> {
  const locks = getLockManager();
  if (!locks) {
    // BroadcastChannel is not a mutex. In browsers without Web Locks the
    // foundation never performs a rotating refresh; B2B can keep those
    // browsers on compatibility auth or require controlled reauthentication.
    try {
      return await options.recover();
    } catch (error) {
      if (
        error instanceof BrowserAccessTokenRecoveryError &&
        error.status === 401
      ) {
        throw new RefreshCoordinationUnavailableError();
      }
      throw error;
    }
  }

  let leader = false;
  const result = await locks.request(
    BROWSER_REFRESH_LOCK_NAME,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return undefined;

      leader = true;
      const version = nextRefreshVersion();
      broadcastAuthSignal("refresh-start", {
        generation: options.generation,
        version,
        status: "started",
      });

      try {
        const value = await options.rotate();
        if (!isCurrentGeneration(options.generation)) {
          throw new StaleAuthGenerationError();
        }
        broadcastAuthSignal("refresh-complete", {
          generation: options.generation,
          version,
          status: "completed",
        });
        return value;
      } catch (error) {
        broadcastAuthSignal("refresh-failed", {
          generation: options.generation,
          version,
          status: "failed",
        });
        throw error;
      }
    },
  );

  if (leader) return result as T;

  await waitForRefreshSignal(
    options.startingVersion,
    options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
  );
  if (!isCurrentGeneration(options.generation)) {
    throw new StaleAuthGenerationError();
  }

  return options.recover();
}

function ensureRefreshChannel(): void {
  if (channelUnsubscribe || typeof window === "undefined") return;
  channelUnsubscribe = startAuthChannel(handleRefreshSignal);
}

function handleRefreshSignal(message: AuthInvalidationMessage): void {
  if (
    (message.type !== "refresh-complete" &&
      message.type !== "refresh-failed") ||
    message.version === undefined
  ) {
    return;
  }

  latestRefreshVersion = Math.max(latestRefreshVersion, message.version);
  for (const waiter of waiters) {
    if (message.version <= waiter.afterVersion) continue;
    clearTimeout(waiter.timer);
    waiter.resolve(true);
    waiters.delete(waiter);
  }
}

function waitForRefreshSignal(
  afterVersion: number,
  timeoutMs: number,
): Promise<boolean> {
  if (latestRefreshVersion > afterVersion) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(waiter);
      resolve(false);
    }, timeoutMs);
    const waiter: RefreshWaiter = { afterVersion, resolve, timer };
    waiters.add(waiter);
  });
}

function nextRefreshVersion(): number {
  localVersion = Math.max(localVersion + 1, Date.now());
  latestRefreshVersion = Math.max(latestRefreshVersion, localVersion);
  return localVersion;
}

function getLockManager(): LockManager | null {
  if (typeof navigator === "undefined" || !navigator.locks) return null;
  return navigator.locks;
}

function configuredApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_KORA_API_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new BrowserAccessTokenRecoveryError(
    0,
    "NEXT_PUBLIC_KORA_API_URL is required outside local development",
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseRecoveryResponse(value: unknown): BrowserAccessTokenRecovery {
  const data =
    value && typeof value === "object" && "data" in value
      ? (value as { data?: unknown }).data
      : undefined;

  if (!data || typeof data !== "object") {
    throw new BrowserAccessTokenRecoveryError(
      502,
      "Kora returned an invalid browser recovery response.",
    );
  }

  const record = data as Record<string, unknown>;
  if ("refreshToken" in record) {
    throw new BrowserAccessTokenRecoveryError(
      502,
      "Kora returned an unsafe browser recovery response.",
    );
  }

  const user = record.user;
  const session = record.session;
  if (
    !user ||
    typeof user !== "object" ||
    !session ||
    typeof session !== "object" ||
    typeof record.accessToken !== "string" ||
    !record.accessToken ||
    typeof record.accessTokenExpiresInSeconds !== "number" ||
    !Number.isFinite(record.accessTokenExpiresInSeconds) ||
    record.accessTokenExpiresInSeconds <= 0 ||
    typeof (user as Record<string, unknown>).id !== "string" ||
    typeof (user as Record<string, unknown>).displayName !== "string" ||
    ((user as Record<string, unknown>).email !== null &&
      typeof (user as Record<string, unknown>).email !== "string") ||
    typeof (session as Record<string, unknown>).id !== "string" ||
    typeof (session as Record<string, unknown>).expiresAt !== "string"
  ) {
    throw new BrowserAccessTokenRecoveryError(
      502,
      "Kora returned an invalid browser recovery response.",
    );
  }

  return {
    accessToken: record.accessToken,
    accessTokenExpiresInSeconds: record.accessTokenExpiresInSeconds,
    user: {
      id: (user as Record<string, unknown>).id as string,
      email: (user as Record<string, unknown>).email as string | null,
      displayName: (user as Record<string, unknown>).displayName as string,
    },
    session: {
      id: (session as Record<string, unknown>).id as string,
      expiresAt: (session as Record<string, unknown>).expiresAt as string,
    },
  };
}
