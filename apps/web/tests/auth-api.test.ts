import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  KoraApiError,
  koraApi,
  logoutKoraSession,
} from "../src/lib/api/kora-api.ts";
import { getKoraAccessToken } from "../src/lib/auth/session.ts";
import { resetAuthChannelForTests } from "../src/lib/auth/channel.ts";
import {
  clearAuthenticated,
  getSnapshot,
  resetForTests,
  setAuthenticated,
} from "../src/lib/auth/store.ts";

const legacySession = {
  user: { id: "user-1", email: "user@example.com", displayName: "User" },
  accessToken: "old-access-token",
  accessTokenExpiresInSeconds: 900,
  refreshToken: "old-refresh-token",
  session: { id: "session-1", expiresAt: "2030-01-01T00:00:00.000Z" },
};

const refreshedSession = {
  ...legacySession,
  accessToken: "new-access-token",
  refreshToken: "new-refresh-token",
};

let storage = new Map<string, string>();

function installWindow(): void {
  storage = new Map([["kora.auth.session", JSON.stringify(legacySession)]]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      crypto: undefined,
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      addEventListener() {},
      removeEventListener() {},
    },
  });
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: undefined,
  });
}

beforeEach(() => {
  resetForTests();
  resetAuthChannelForTests();
  installWindow();
});

test("memory access token is preferred over legacy storage", async () => {
  setAuthenticated({ accessToken: "memory-access-token" });
  const headers: Headers[] = [];

  globalThis.fetch = async (_input, init) => {
    headers.push(new Headers(init?.headers));
    return Response.json({ data: { ok: true } });
  };

  await koraApi("/test");
  assert.equal(headers[0]?.get("Authorization"), "Bearer memory-access-token");
});

test("legacy access token hydrates memory before the first API request", async () => {
  const headers: Headers[] = [];

  globalThis.fetch = async (_input, init) => {
    headers.push(new Headers(init?.headers));
    return Response.json({ data: { ok: true } });
  };

  await koraApi("/test");
  assert.equal(headers[0]?.get("Authorization"), "Bearer old-access-token");
});

test("explicit logout does not rehydrate a legacy token", () => {
  clearAuthenticated();
  assert.equal(storage.get("kora.auth.session") !== null, true);
  assert.equal(getKoraAccessToken(), null);
});

test("successful legacy refresh mirrors memory and preserves body storage", async () => {
  const requests: Array<{ url: string; body?: string }> = [];

  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: init?.body?.toString() });

    if (requests.length === 1) {
      return Response.json({ error: { message: "expired" } }, { status: 401 });
    }

    if (String(input).endsWith("/v1/auth/refresh")) {
      return Response.json({ data: refreshedSession });
    }

    return Response.json({ data: { ok: true } });
  };

  await koraApi("/test");
  assert.equal(JSON.parse(storage.get("kora.auth.session") ?? "{}").accessToken, "new-access-token");
  assert.equal(requests[1]?.body, JSON.stringify({ refreshToken: "old-refresh-token" }));
});

test("network and server failures do not falsely clear known auth", async () => {
  setAuthenticated({ accessToken: "memory-access-token" });
  globalThis.fetch = async () =>
    Response.json({ error: { message: "temporary" } }, { status: 503 });

  await assert.rejects(() => koraApi("/test"), KoraApiError);
  assert.equal(storage.has("kora.auth.session"), true);
});

test("REGRESSION: delayed logout A cannot clear login B", async () => {
  let resolveLogout: ((response: Response) => void) | undefined;
  globalThis.fetch = async () => new Promise<Response>((resolve) => {
    resolveLogout = resolve;
  });

  setAuthenticated({ accessToken: "session-a" });
  const logout = logoutKoraSession();
  await new Promise((resolve) => setTimeout(resolve, 0));
  setAuthenticated({ accessToken: "session-b" });

  resolveLogout?.(Response.json({ data: { ok: true } }));
  await logout;

  assert.equal(getSnapshot().accessToken, "session-b");
  assert.equal(getSnapshot().state, "AUTHENTICATED");
});

test("REGRESSION: initial 401 A cannot refresh or retry as login B", async () => {
  let resolveInitial: ((response: Response) => void) | undefined;
  let refreshCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/v1/auth/refresh")) {
      refreshCalls += 1;
      return Response.json({ data: refreshedSession });
    }
    return new Promise<Response>((resolve) => { resolveInitial = resolve; });
  };

  setAuthenticated({ accessToken: "session-a" });
  const request = koraApi("/test");
  await new Promise((resolve) => setTimeout(resolve, 0));
  setAuthenticated({ accessToken: "session-b" });
  resolveInitial?.(Response.json({ error: { message: "expired" } }, { status: 401 }));

  await assert.rejects(request, (error: unknown) => error instanceof KoraApiError && error.status === 0);
  assert.equal(refreshCalls, 0);
  assert.equal(getSnapshot().accessToken, "session-b");
});

test("stale refresh results cannot restore auth after generation changes", async () => {
  let resolveRefresh: ((response: Response) => void) | undefined;
  let refreshStartedResolve: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    refreshStartedResolve = resolve;
  });

  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/v1/auth/refresh")) {
      refreshStartedResolve?.();
      return new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
    }

    return Response.json({ error: { message: "expired" } }, { status: 401 });
  };

  const request = koraApi("/test");
  await refreshStarted;
  clearAuthenticated();
  assert.ok(resolveRefresh);
  resolveRefresh(Response.json({ data: refreshedSession }));

  await assert.rejects(
    request,
    (error: unknown) =>
      error instanceof KoraApiError && error.status === 0,
  );
  assert.equal(storage.get("kora.auth.session"), JSON.stringify(legacySession));
});

// SEC-03 regression: a request that started refreshing before a *newer*
// login completed must never destroy that newer login when its own,
// now-obsolete refresh attempt finally settles (success, 401, or a delayed
// retry). Only the generation active when the attempt began matters.

test("REGRESSION: a stale refresh-endpoint 401 cannot erase a newer login that completed while it was in flight", async () => {
  let resolveRefreshFetch: ((response: Response) => void) | undefined;
  let refreshStartedResolve: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    refreshStartedResolve = resolve;
  });

  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/v1/auth/refresh")) {
      refreshStartedResolve?.();
      return new Promise<Response>((resolve) => {
        resolveRefreshFetch = resolve;
      });
    }

    return Response.json({ error: { message: "expired" } }, { status: 401 });
  };

  const request = koraApi("/test");
  await refreshStarted;

  // A newer, independent login completes while the stale refresh request is
  // still awaiting a response.
  setAuthenticated({ accessToken: "newer-login-token" });

  assert.ok(resolveRefreshFetch);
  resolveRefreshFetch(
    Response.json({ error: { message: "expired" } }, { status: 401 }),
  );

  await assert.rejects(
    request,
    (error: unknown) => error instanceof KoraApiError && error.status === 0,
  );

  assert.equal(getSnapshot().accessToken, "newer-login-token");
});

test("REGRESSION: a stale refresh-endpoint success cannot replace a newer login's session", async () => {
  let resolveRefresh: ((response: Response) => void) | undefined;
  let refreshStartedResolve: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    refreshStartedResolve = resolve;
  });

  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/v1/auth/refresh")) {
      refreshStartedResolve?.();
      return new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
    }

    return Response.json({ error: { message: "expired" } }, { status: 401 });
  };

  const request = koraApi("/test");
  await refreshStarted;

  setAuthenticated({ accessToken: "newer-login-token" });

  assert.ok(resolveRefresh);
  resolveRefresh(Response.json({ data: refreshedSession }));

  await assert.rejects(
    request,
    (error: unknown) => error instanceof KoraApiError && error.status === 0,
  );

  assert.equal(getSnapshot().accessToken, "newer-login-token");
  assert.notEqual(
    JSON.parse(storage.get("kora.auth.session") ?? "{}").accessToken,
    refreshedSession.accessToken,
  );
});

test("REGRESSION: a delayed retry response cannot mutate a newer auth state after refresh already completed", async () => {
  let callCount = 0;
  let resolveRetry: ((response: Response) => void) | undefined;

  globalThis.fetch = async (input) => {
    callCount += 1;

    if (String(input).endsWith("/v1/auth/refresh")) {
      return Response.json({ data: refreshedSession });
    }

    if (callCount === 1) {
      return Response.json({ error: { message: "expired" } }, { status: 401 });
    }

    return new Promise<Response>((resolve) => {
      resolveRetry = resolve;
    });
  };

  const request = koraApi("/test");

  // Let the initial 401, the refresh round-trip, and the retry's fetch call
  // all run; only the retry's response is deliberately left pending.
  await new Promise((resolve) => setTimeout(resolve, 0));

  setAuthenticated({ accessToken: "newer-login-token" });

  assert.ok(resolveRetry);
  resolveRetry(Response.json({ error: { message: "expired" } }, { status: 401 }));

  await assert.rejects(
    request,
    (error: unknown) => error instanceof KoraApiError && error.status === 0,
  );

  assert.equal(getSnapshot().accessToken, "newer-login-token");
});
