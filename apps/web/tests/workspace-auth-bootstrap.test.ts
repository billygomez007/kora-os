import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceAuthGate } from "../src/lib/auth/workspace-gate.ts";

test("UNKNOWN keeps the workspace on the branded loader", () => {
  assert.equal(
    workspaceAuthGate({ state: "UNKNOWN", accessToken: null }),
    "loading",
  );
});

test("UNKNOWN does not authorize protected workspace content", () => {
  assert.notEqual(
    workspaceAuthGate({ state: "UNKNOWN", accessToken: null }),
    "resolve",
  );
});

test("UNAUTHENTICATED keeps the existing login redirect behavior", () => {
  assert.equal(
    workspaceAuthGate({ state: "UNAUTHENTICATED", accessToken: null }),
    "redirect_login",
  );
});

test("RETRYABLE_ERROR without a token is non-destructive and retryable", () => {
  assert.equal(
    workspaceAuthGate({ state: "RETRYABLE_ERROR", accessToken: null }),
    "retry",
  );
});

test("AUTHENTICATED continues existing workspace resolution", () => {
  assert.equal(
    workspaceAuthGate({ state: "AUTHENTICATED", accessToken: "access-token" }),
    "resolve",
  );
});
