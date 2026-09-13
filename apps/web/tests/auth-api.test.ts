import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  KoraApiError,
  koraApi,
} from "../src/lib/api/kora-api.ts";
import { getKoraAccessToken } from "../src/lib/auth/session.ts";
import { resetAuthChannelForTests } from "../src/lib/auth/channel.ts";
import {
  clearAuthenticated,
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
