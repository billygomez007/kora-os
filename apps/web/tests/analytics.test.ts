import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_DEFAULT,
  KORA_GA_MEASUREMENT_ID,
  analyticsConsentUpdate,
  clearGoogleAnalyticsCookies,
  isPublicAnalyticsPath,
  parseAnalyticsConsent,
  safeAnalyticsPath,
  setAnalyticsConsent,
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

test("uses a first-party consent cookie and denies analytics by default", () => {
  assert.equal(ANALYTICS_CONSENT_COOKIE, "KORA_ANALYTICS_CONSENT");
  assert.deepEqual(ANALYTICS_CONSENT_DEFAULT, {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  assert.equal(parseAnalyticsConsent("session=abc"), null);
  assert.equal(parseAnalyticsConsent("KORA_ANALYTICS_CONSENT=granted"), "granted");
  assert.equal(parseAnalyticsConsent("KORA_ANALYTICS_CONSENT=denied"), "denied");
});

test("accepting or declining changes analytics storage only", () => {
  assert.deepEqual(analyticsConsentUpdate("granted"), {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  assert.deepEqual(analyticsConsentUpdate("denied"), ANALYTICS_CONSENT_DEFAULT);
});

test("consent preference persists and can be changed without auth storage", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const writes: string[] = [];
  const events: Event[] = [];

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { protocol: "https:" },
      dispatchEvent: (event: Event) => {
        events.push(event);
        return true;
      },
    },
  });
  Object.defineProperty(globalThis.document, "cookie", {
    configurable: true,
    get: () => writes.at(-1) ?? "",
    set: (value: string) => writes.push(value),
  });

  try {
    setAnalyticsConsent("granted");
    assert.match(writes[0], /^KORA_ANALYTICS_CONSENT=granted;/);
    assert.match(writes[0], /Max-Age=31536000/);
    assert.match(writes[0], /Secure/);
    assert.equal((events[0] as CustomEvent).detail, "granted");

    setAnalyticsConsent("denied");
    assert.match(writes[1], /^KORA_ANALYTICS_CONSENT=denied;/);
    assert.equal((events[1] as CustomEvent).detail, "denied");
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("declining analytics clears GA cookies but leaves unrelated cookies alone", () => {
  const originalDocument = globalThis.document;
  const writes: string[] = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "_ga=abc; _ga_G-C58FM02YE0=xyz; KORA_LOCALE=fr" },
  });
  Object.defineProperty(globalThis.document, "cookie", {
    configurable: true,
    get: () => "_ga=abc; _ga_G-C58FM02YE0=xyz; KORA_LOCALE=fr",
    set: (value: string) => writes.push(value),
  });

  try {
    clearGoogleAnalyticsCookies();
    assert.deepEqual(writes, [
      "_ga=; Path=/; Max-Age=0; SameSite=Lax",
      "_ga_G-C58FM02YE0=; Path=/; Max-Age=0; SameSite=Lax",
    ]);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});
