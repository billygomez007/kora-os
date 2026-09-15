import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  bootstrapAuth,
  handleCrossTabInvalidation,
  resetBootstrapForTests,
} from "../src/lib/auth/bootstrap.ts";
import {
  resetAuthChannelForTests,
} from "../src/lib/auth/channel.ts";
import {
  getKoraAccessToken,
  readLegacyKoraSession,
} from "../src/lib/auth/session.ts";
import {
  commitAuthenticated,
  getGeneration,
  getSnapshot,
  resetForTests,
  setAuthenticated,
} from "../src/lib/auth/store.ts";

const session = {
  user: { id: "user-1", email: "user@example.com", displayName: "User" },
  accessToken: "access-token",
  accessTokenExpiresInSeconds: 900,
  refreshToken: "refresh-token",
  session: { id: "session-1", expiresAt: "2030-01-01T00:00:00.000Z" },
};

let storage = new Map<string, string>();
let storageUnavailable = false;

function installWindow(): void {
  storage = new Map();
  storageUnavailable = false;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      crypto: undefined,
      localStorage: {
        getItem(key: string) {
          if (storageUnavailable) throw new Error("storage unavailable");
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          if (storageUnavailable) throw new Error("storage unavailable");
          storage.set(key, value);
        },
        removeItem(key: string) {
          storage.delete(key);
        },
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
  resetBootstrapForTests();
  resetAuthChannelForTests();
  installWindow();
});

test("valid legacy session hydrates memory without changing stored JSON", async () => {
  const raw = JSON.stringify(session);
  storage.set("kora.auth.session", raw);

  await bootstrapAuth();

  assert.equal(getSnapshot().state, "AUTHENTICATED");
  assert.equal(getKoraAccessToken(), "access-token");
  assert.equal(getSnapshot().accessToken, "access-token");
  assert.equal("refreshToken" in getSnapshot(), false);
  assert.equal(storage.get("kora.auth.session"), raw);
});

test("missing and malformed legacy sessions become unauthenticated without deletion", async () => {
  await bootstrapAuth();
  assert.equal(getSnapshot().state, "UNAUTHENTICATED");

  resetForTests();
  resetBootstrapForTests();
  const malformed = "{not-json";
  storage.set("kora.auth.session", malformed);
  await bootstrapAuth();

  assert.equal(getSnapshot().state, "UNAUTHENTICATED");
  assert.equal(storage.get("kora.auth.session"), malformed);
  assert.equal(readLegacyKoraSession().kind, "malformed");
});

test("storage failures are retryable rather than confirmed logout", async () => {
  storageUnavailable = true;

  await bootstrapAuth();

  assert.equal(getSnapshot().state, "RETRYABLE_ERROR");
  assert.equal(getSnapshot().operationalState, "OFFLINE");
});

test("cross-tab invalidation clears memory and rejects stale work", () => {
  setAuthenticated({ accessToken: "access-token" });
  const staleGeneration = getGeneration();

  handleCrossTabInvalidation({ type: "logout", source: "peer-tab", authVersion: 1 });

  assert.equal(getSnapshot().state, "UNAUTHENTICATED");
  assert.equal(getSnapshot().accessToken, null);
  assert.equal(
    commitAuthenticated({ accessToken: "stale-token" }, staleGeneration),
    false,
  );
});

// SEC-03 regression: refresh-start/refresh-complete/refresh-failed are
// coordination lifecycle signals, not invalidation signals. They must never
// reach the shared cross-tab handler's destructive path, or every other tab
// gets logged out while one tab is merely refreshing.
for (const type of ["refresh-start", "refresh-complete", "refresh-failed"] as const) {
  test(`REGRESSION: ${type} does not clear a valid peer tab's authenticated session`, () => {
    setAuthenticated({ accessToken: "access-token" });
    const generationBeforeSignal = getGeneration();

    handleCrossTabInvalidation({ type, source: "peer-tab", generation: 0, version: 1 });

    assert.equal(getSnapshot().state, "AUTHENTICATED");
    assert.equal(getSnapshot().accessToken, "access-token");
    assert.equal(getGeneration(), generationBeforeSignal);
  });
}

test("genuine invalidation types (logout, session-invalidated, auth-generation-changed) all clear a peer tab", () => {
  for (const type of [
    "logout",
    "session-invalidated",
    "auth-generation-changed",
  ] as const) {
    setAuthenticated({ accessToken: "access-token" });

    handleCrossTabInvalidation({ type, source: "peer-tab", authVersion: 1 });

    assert.equal(getSnapshot().state, "UNAUTHENTICATED", `expected ${type} to clear peer auth`);
  }
});

test("stale cross-tab invalidation cannot clear a newer localStorage session", () => {
  storage.set("kora.auth.version", "20");
  setAuthenticated({ accessToken: "newer-token" });

  handleCrossTabInvalidation({
    type: "logout",
    source: "old-tab",
    authVersion: 19,
  });

  assert.equal(getSnapshot().accessToken, "newer-token");
  assert.equal(getSnapshot().state, "AUTHENTICATED");
});
