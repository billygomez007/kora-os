import {
  clearKoraSession,
  getKoraSession,
  getKoraAccessToken,
  mirrorKoraSession,
  persistKoraSession,
  getAuthVersion,
  type KoraSession,
} from "../auth/session.ts";
import {
  getGeneration,
  isCurrentGeneration,
} from "../auth/store.ts";

const configuredApiBase = process.env.NEXT_PUBLIC_KORA_API_URL?.replace(/\/$/, "");
const API_BASE =
  configuredApiBase ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error(
      "NEXT_PUBLIC_KORA_API_URL is required outside local development",
    );
  }
  return API_BASE;
}

type ApiEnvelope<T> = {
  data: T;
  meta?: {
    requestId?: string;
    [key: string]: unknown;
  };
  page?: {
    nextCursor?: string | null;
    [key: string]: unknown;
  };
};

type ApiErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
  message?: string;
};

export class KoraApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "KoraApiError";
    this.status = status;
    this.body = body;
  }
}

export async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as ApiErrorEnvelope;

    if (typeof record.error?.message === "string") {
      return record.error.message;
    }

    if (typeof record.message === "string") {
      return record.message;
    }
  }

  return `Kora API request failed (${status})`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new KoraApiError(
      response.status,
      errorMessage(response.status, body),
      body,
    );
  }

  return body as T;
}

let refreshPromise: Promise<KoraSession> | null = null;

async function refreshKoraSession(
  expectedGeneration: number,
  expectedAuthVersion: number | null,
): Promise<KoraSession> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshGeneration = expectedGeneration;
    if (!isCurrentGeneration(refreshGeneration) || getAuthVersion() !== expectedAuthVersion) {
      throw new KoraApiError(0, "The Kora session changed while it was being refreshed.", null);
    }
    const currentSession = getKoraSession();

    if (!currentSession?.refreshToken) {
      if (!isCurrentGeneration(refreshGeneration) || getAuthVersion() !== expectedAuthVersion) {
        throw new KoraApiError(
          0,
          "The Kora session changed while it was being refreshed.",
          null,
        );
      }

      clearKoraSession();

      throw new KoraApiError(
        401,
        "Your Kora session has expired. Please sign in again.",
        null,
      );
    }

    let response: Response;

    try {
      response = await fetch(`${requireApiBase()}/v1/auth/refresh`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refreshToken: currentSession.refreshToken,
        }),
      });
    } catch (cause) {
      throw new KoraApiError(
        0,
        cause instanceof Error
          ? cause.message
          : "Kora could not refresh your session.",
        null,
      );
    }

    const body = await readResponseBody(response);

    if (!response.ok) {
      if (response.status === 401) {
        if (!isCurrentGeneration(refreshGeneration) || getAuthVersion() !== expectedAuthVersion) {
          throw new KoraApiError(
            0,
            "The Kora session changed while it was being refreshed.",
            null,
          );
        }

        clearKoraSession();
      }

      throw new KoraApiError(
        response.status,
        response.status === 401
          ? "Your Kora session has expired. Please sign in again."
          : errorMessage(response.status, body),
        body,
      );
    }

    const envelope = body as ApiEnvelope<KoraSession>;
    const nextSession = envelope?.data;

    if (
      !nextSession?.accessToken ||
      !nextSession?.refreshToken ||
      !nextSession?.session?.id
    ) {
      if (!isCurrentGeneration(refreshGeneration) || getAuthVersion() !== expectedAuthVersion) {
        throw new KoraApiError(
          0,
          "The Kora session changed while it was being refreshed.",
          null,
        );
      }

      clearKoraSession();

      throw new KoraApiError(
        401,
        "Kora could not renew your session. Please sign in again.",
        body,
      );
    }

    if (!isCurrentGeneration(refreshGeneration) || getAuthVersion() !== expectedAuthVersion) {
      throw new KoraApiError(
        0,
        "The Kora session changed while it was being refreshed.",
        null,
      );
    }

    mirrorKoraSession(nextSession, refreshGeneration);
    persistKoraSession(nextSession);

    return nextSession;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function authenticatedFetch(
  path: string,
  init: RequestInit,
  accessToken: string,
): Promise<Response> {
  const headers = new Headers(init.headers);

  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${requireApiBase()}/v1${path}`, {
    ...init,
    headers,
  });
}

export async function koraApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const accessToken = getKoraAccessToken();
  const requestGeneration = getGeneration();
  const requestAuthVersion = getAuthVersion();

  if (!accessToken) {
    throw new KoraApiError(
      401,
      "Your Kora session is missing. Please sign in again.",
      null,
    );
  }

  let response = await authenticatedFetch(
    path,
    init,
    accessToken,
  );

  if (response.status !== 401) {
    return parseResponse<T>(response);
  }

  if (!isCurrentGeneration(requestGeneration) || getAuthVersion() !== requestAuthVersion) {
    throw new KoraApiError(0, "The Kora session changed while this request was in flight.", null);
  }

  const refreshedSession = await refreshKoraSession(requestGeneration, requestAuthVersion);
  const generationAfterRefresh = requestGeneration;
  if (!isCurrentGeneration(generationAfterRefresh) || getAuthVersion() !== requestAuthVersion) {
    throw new KoraApiError(0, "The Kora session changed while this request was in flight.", null);
  }

  response = await authenticatedFetch(
    path,
    init,
    refreshedSession.accessToken,
  );

  if (response.status === 401) {
    if (!isCurrentGeneration(generationAfterRefresh) || getAuthVersion() !== requestAuthVersion) {
      throw new KoraApiError(
        0,
        "The Kora session changed while it was being refreshed.",
        null,
      );
    }

    clearKoraSession();

    const body = await readResponseBody(response);

    throw new KoraApiError(
      401,
      "Your Kora session has expired. Please sign in again.",
      body,
    );
  }

  return parseResponse<T>(response);
}

export async function koraData<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const envelope = await koraApi<ApiEnvelope<T>>(path, init);
  return envelope.data;
}

export async function koraEnvelope<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  return koraApi<ApiEnvelope<T>>(path, init);
}

export async function logoutKoraSession(): Promise<void> {
  const accessToken = getKoraAccessToken();
  const logoutGeneration = getGeneration();
  const logoutAuthVersion = getAuthVersion();

  try {
    if (accessToken) {
      await authenticatedFetch(
        "/auth/logout",
        { method: "POST" },
        accessToken,
      );
    }
  } finally {
    if (isCurrentGeneration(logoutGeneration) && getAuthVersion() === logoutAuthVersion) {
      clearKoraSession();
    }
  }
}
