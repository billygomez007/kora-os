import assert from "node:assert/strict";
import { test } from "node:test";
import { trialDaysRemaining } from "../src/lib/subscription/trial.ts";

test("returns whole days remaining, rounding up while time remains", () => {
  const now = new Date("2026-01-01T10:00:00.000Z");
  assert.equal(
    trialDaysRemaining("2026-01-31T09:59:59.000Z", now),
    30,
  );
  assert.equal(
    trialDaysRemaining("2025-12-31T10:00:00.000Z", now),
    0,
  );
});

test("returns null when the trial end is unavailable or invalid", () => {
  assert.equal(trialDaysRemaining(undefined), null);
  assert.equal(trialDaysRemaining("not-a-date"), null);
});
