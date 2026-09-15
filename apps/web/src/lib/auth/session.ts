import { broadcastAuthSignal } from "./channel.ts";
import {
  commitAuthenticated,
  clearAuthenticated,
  getSnapshot,
  isCurrentGeneration,
  setAuthenticated,
  type AuthenticatedStateInput,
} from "./store.ts";

export interface KoraAuthUser {
  id: string;
  email: string | null;
  displayName: string;
}

export interface KoraSession {
  user: KoraAuthUser;
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  refreshToken: string;
  session: {
    id: string;
    expiresAt: string;
  };
}

const SESSION_KEY = "kora.auth.session";
const AUTH_VERSION_KEY = "kora.auth.version";

function nextAuthVersion(): number {
  const storage = getLegacyStorage();
  let previous = 0;
  try { previous = Number(storage?.getItem(AUTH_VERSION_KEY) ?? 0); } catch { /* best effort */ }
  const next = Math.max(Number.isSafeInteger(previous) ? previous + 1 : 0, Date.now());
  try { storage?.setItem(AUTH_VERSION_KEY, String(next)); } catch { /* best effort */ }
  return next;
}

export function getAuthVersion(): number | null {
  try {
    const value = Number(getLegacyStorage()?.getItem(AUTH_VERSION_KEY));
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch { return null; }
}

function getLegacyStorage(): Storage | null {
  try {
    if (typeof window !== "undefined") return window.localStorage;
    if (typeof globalThis.localStorage !== "undefined") {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export type LegacySessionRead =
  | { kind: "missing"; session: null }
  | { kind: "valid"; session: KoraSession }
  | { kind: "malformed"; session: null }
  | { kind: "unavailable"; session: null };

function sessionInput(session: KoraSession): AuthenticatedStateInput {
  const accessTokenExpiry =
    typeof session.accessTokenExpiresInSeconds === "number" &&
    Number.isFinite(session.accessTokenExpiresInSeconds)
      ? Date.now() + session.accessTokenExpiresInSeconds * 1000
      : null;

  const user =
    session.user && typeof session.user === "object"
      ? {
          id: typeof session.user.id === "string" ? session.user.id : "",
          email:
            typeof session.user.email === "string" || session.user.email === null
              ? session.user.email
              : null,
          displayName:
            typeof session.user.displayName === "string"
              ? session.user.displayName
              : "",
        }
      : null;

  return {
    accessToken: session.accessToken,
    accessTokenExpiry,
    user,
    sessionId:
      session.session && typeof session.session.id === "string"
        ? session.session.id
        : null,
    sessionExpiresAt:
      session.session && typeof session.session.expiresAt === "string"
        ? session.session.expiresAt
        : null,
  };
}

function isLegacySession(value: unknown): value is KoraSession {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).accessToken === "string" &&
      Boolean((value as Record<string, unknown>).accessToken),
  );
}

export function readLegacyKoraSession(): LegacySessionRead {
  const storage = getLegacyStorage();
  if (!storage) {
    return {
      kind:
        typeof window !== "undefined" ||
        typeof globalThis.localStorage !== "undefined"
          ? "unavailable"
          : "missing",
      session: null,
    };
  }

  let raw: string | null;
  try {
    raw = storage.getItem(SESSION_KEY);
  } catch {
    return { kind: "unavailable", session: null };
  }

  if (!raw) return { kind: "missing", session: null };

  try {
    const parsed: unknown = JSON.parse(raw);
    return isLegacySession(parsed)
      ? { kind: "valid", session: parsed }
      : { kind: "malformed", session: null };
  } catch {
    return { kind: "malformed", session: null };
  }
}

export function persistKoraSession(session: KoraSession): void {
  const storage = getLegacyStorage();
  if (!storage) return;
  storage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Persist a newly verified legacy session and mirror only non-refresh-token
 * state into memory. An expected generation makes login commits stale-safe.
 */
export function saveKoraSession(
  session: KoraSession,
  expectedGeneration?: number,
): boolean {
  const input = sessionInput(session);
  const committed =
    expectedGeneration === undefined
      ? setAuthenticated(input)
      : commitAuthenticated(input, expectedGeneration);

  if (!committed) return false;

  nextAuthVersion();
  persistKoraSession(session);
  return true;
}

/** Mirror a legacy refresh result without advancing the auth generation. */
export function mirrorKoraSession(
  session: KoraSession,
  expectedGeneration?: number,
): boolean {
  return setAuthenticated(sessionInput(session), expectedGeneration);
}

export function getKoraSession(): KoraSession | null {
  const result = readLegacyKoraSession();
  return result.kind === "valid" ? result.session : null;
}

/**
 * Access-token reads are memory-first. A legacy read is used only until the
 * store has been hydrated, preserving the current body-refresh contract.
 */
export function getKoraAccessToken(): string | null {
  const current = getSnapshot();
  if (current.accessToken) return current.accessToken;
  if (current.state !== "UNKNOWN") return null;

  const legacy = readLegacyKoraSession();
  if (legacy.kind !== "valid") return null;

  if (isCurrentGeneration(current.generation)) {
    mirrorKoraSession(legacy.session, current.generation);
  }

  return legacy.session.accessToken;
}

export function removeLegacyKoraSession(): void {
  const storage = getLegacyStorage();
  if (!storage) return;
  try {
    storage.removeItem(SESSION_KEY);
  } catch {
    // Clearing auth state in memory remains authoritative when storage fails.
  }
}

export function clearKoraSession(): void {
  const authVersion = getAuthVersion();
  clearAuthenticated();
  removeLegacyKoraSession();
  broadcastAuthSignal("logout", {
    generation: getSnapshot().generation,
    authVersion: authVersion ?? undefined,
  });
}
