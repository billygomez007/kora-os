import assert from "node:assert/strict";
import test from "node:test";
import {
  KORA_GA_MEASUREMENT_ID,
  isPublicAnalyticsPath,
  safeAnalyticsPath,
} from "../src/lib/analytics.ts";

test("uses the approved public GA4 measurement ID", () => {
  assert.equal(KORA_GA_MEASUREMENT_ID, "G-C58FM02YE0");
});

test("tracks localized public marketing routes only", () => {
  assert.equal(isPublicAnalyticsPath("/en"), true);
  assert.equal(isPublicAnalyticsPath("/fr/about"), true);
  assert.equal(isPublicAnalyticsPath("/en/marketplace/sample-business"), true);
  assert.equal(isPublicAnalyticsPath("/en/app"), false);
  assert.equal(isPublicAnalyticsPath("/fr/invite/secret-token"), false);
  assert.equal(isPublicAnalyticsPath("/en/verify?token=secret"), false);
});

test("removes query strings before a page location is sent", () => {
  assert.equal(safeAnalyticsPath("/fr/pricing?email=private@example.com"), "/fr/pricing");
  assert.equal(safeAnalyticsPath("/en"), "/en");
});
