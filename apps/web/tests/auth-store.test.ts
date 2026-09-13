import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  clearAuthenticated,
  commitAuthenticated,
  getGeneration,
  getServerSnapshot,
  getSnapshot,
  resetForTests,
  setAuthenticated,
  setRetryableError,
  setUnauthenticated,
  subscribe,
} from "../src/lib/auth/store.ts";

beforeEach(() => {
  resetForTests();
});

test("server and client begin with a stable UNKNOWN snapshot", () => {
  assert.equal(getSnapshot().state, "UNKNOWN");
  assert.equal(getServerSnapshot().state, "UNKNOWN");
  assert.equal(getServerSnapshot(), getServerSnapshot());
});

test("setAuthenticated stores only the in-memory access state", () => {
  setAuthenticated({
    accessToken: "access-token",
    accessTokenExpiry: 123,
    user: { id: "user-1", email: "user@example.com", displayName: "User" },
    sessionId: "session-1",
    sessionExpiresAt: "2030-01-01T00:00:00.000Z",
  });

  const snapshot = getSnapshot();
  assert.equal(snapshot.state, "AUTHENTICATED");
  assert.equal(snapshot.accessToken, "access-token");
  assert.equal(snapshot.accessTokenExpiry, 123);
  assert.equal(snapshot.user?.email, "user@example.com");
  assert.equal(snapshot.sessionId, "session-1");
  assert.equal(snapshot.generation, 1);
  assert.equal("refreshToken" in snapshot, false);
});

test("subscriptions fire for state changes and generation advances", () => {
  let notifications = 0;
  const unsubscribe = subscribe(() => {
    notifications += 1;
  });

  setAuthenticated({ accessToken: "access-token" });
  clearAuthenticated();
  unsubscribe();
  setUnauthenticated();

  assert.equal(notifications, 2);
  assert.equal(getGeneration(), 3);
});

test("retryable errors preserve known auth without forcing logout", () => {
  setAuthenticated({ accessToken: "access-token" });
  const generation = getGeneration();

  assert.equal(
    setRetryableError({ code: "BOOTSTRAP_FAILED" }, generation),
    true,
  );
  assert.equal(getSnapshot().state, "RETRYABLE_ERROR");
  assert.equal(getSnapshot().accessToken, "access-token");
});

test("stale generation commits are rejected", () => {
  setAuthenticated({ accessToken: "first-token" });
  const generation = getGeneration();
  clearAuthenticated();

  assert.equal(
    commitAuthenticated({ accessToken: "stale-token" }, generation),
    false,
  );
  assert.equal(getSnapshot().state, "UNAUTHENTICATED");
  assert.equal(getSnapshot().accessToken, null);
});
