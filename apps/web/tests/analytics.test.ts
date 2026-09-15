import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_DEFAULT,
  KORA_GA_MEASUREMENT_ID,
  analyticsConsentUpdate,
  clearGoogleAnalyticsCookies,
  isPublicAnalyticsPath,
  isAnalyticsRuntimePath,
  parseAnalyticsConsent,
  safeAnalyticsPath,
  setAnalyticsConsent,
  trackBeginCheckout,
  trackEvent,
  trackLogin,
  trackPricingView,
  trackPurchase,
  trackSignUp,
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

test("allows consented event runtime on auth boundaries without treating them as public page views", () => {
  assert.equal(isAnalyticsRuntimePath("/en/login"), true);
  assert.equal(isAnalyticsRuntimePath("/fr/verify"), true);
  assert.equal(isAnalyticsRuntimePath("/en/onboarding"), true);
  assert.equal(isAnalyticsRuntimePath("/en/app"), false);
  assert.equal(isPublicAnalyticsPath("/en/verify"), false);
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

test("event tracking is consent-gated and does not send without gtag", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: unknown[][] = [];

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "KORA_ANALYTICS_CONSENT=granted" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { gtag: (...args: unknown[]) => calls.push(args) },
  });

  try {
    assert.equal(trackSignUp("organization-event"), true);
    assert.equal(trackLogin(), true);
    assert.equal(trackPricingView(), true);
    assert.deepEqual(calls.map(([type, name]) => [type, name]), [
      ["event", "sign_up"],
      ["event", "login"],
      ["event", "view_pricing"],
    ]);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("event tracking remains disabled when consent is denied", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: unknown[][] = [];

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "KORA_ANALYTICS_CONSENT=denied" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { gtag: (...args: unknown[]) => calls.push(args) },
  });

  try {
    assert.equal(trackEvent("login"), false);
    assert.deepEqual(calls, []);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("sign_up is deduplicated by the created organization without sending its ID", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: unknown[][] = [];

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "KORA_ANALYTICS_CONSENT=granted" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { gtag: (...args: unknown[]) => calls.push(args) },
  });

  try {
    assert.equal(trackSignUp("organization-001"), true);
    assert.equal(trackSignUp("organization-001"), false);
    assert.equal(trackSignUp("organization-002"), true);
    assert.deepEqual(calls, [
      ["event", "sign_up", { method: "email_otp" }],
      ["event", "sign_up", { method: "email_otp" }],
    ]);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("a throwing gtag implementation cannot block the calling flow", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "KORA_ANALYTICS_CONSENT=granted" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { gtag: () => { throw new Error("blocked analytics"); } },
  });

  try {
    assert.equal(trackLogin(), false);
    assert.equal(trackSignUp("organization-throw"), false);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("purchase tracking requires a transaction and suppresses duplicate transaction IDs", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: unknown[][] = [];

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "KORA_ANALYTICS_CONSENT=granted" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { gtag: (...args: unknown[]) => calls.push(args) },
  });

  try {
    assert.equal(trackPurchase({ transactionId: "" }), false);
    assert.equal(trackPurchase({ transactionId: "subscription-001", currency: "GHS", value: 120 }), true);
    assert.equal(trackPurchase({ transactionId: "subscription-001", currency: "GHS", value: 120 }), false);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ["event", "purchase", {
      transaction_id: "subscription-001",
      currency: "GHS",
      value: 120,
    }]);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

// SEC-03 regression: GA4's gtag.js auto-attaches page_location/page_referrer
// from document.location/document.referrer to every hit — including
// explicit event() calls — independently of automatic page_view being
// disabled. /verify and /onboarding can carry email, challenge/OTP, and
// invitation-token query parameters, so trackEvent must always override
// both fields itself rather than ever depending on that default.
test("REGRESSION: trackLogin from a verify URL with sensitive query params never lets gtag attach the raw location or referrer", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: unknown[][] = [];

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "KORA_ANALYTICS_CONSENT=granted" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      gtag: (...args: unknown[]) => calls.push(args),
      location: {
        origin: "https://www.koraafric.com",
        pathname: "/en/verify",
        href: "https://www.koraafric.com/en/verify?email=user@example.com&challengeId=abc123&invitation=secret-token",
      },
    },
  });

  try {
    assert.equal(trackLogin(), true);
    const [, , params] = calls[0] as [string, string, Record<string, unknown>];

    assert.equal(params.page_location, "https://www.koraafric.com/en/verify");
    assert.equal(params.page_referrer, "");
    assert.doesNotMatch(String(params.page_location), /email|challengeId|invitation|secret-token/);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("REGRESSION: trackSignUp from an onboarding URL with an invitation token never leaks it via page_location", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: unknown[][] = [];

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "KORA_ANALYTICS_CONSENT=granted" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      gtag: (...args: unknown[]) => calls.push(args),
      location: {
        origin: "https://www.koraafric.com",
        pathname: "/en/onboarding",
        href: "https://www.koraafric.com/en/onboarding?invitation=secret-token",
      },
    },
  });

  try {
    assert.equal(trackSignUp("organization-verify-test"), true);
    const [, , params] = calls[0] as [string, string, Record<string, unknown>];

    assert.equal(params.page_location, "https://www.koraafric.com/en/onboarding");
    assert.equal(params.page_referrer, "");
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("REGRESSION: a caller-supplied page_location/page_referrer can never override the sanitized values", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: unknown[][] = [];

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "KORA_ANALYTICS_CONSENT=granted" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      gtag: (...args: unknown[]) => calls.push(args),
      location: {
        origin: "https://www.koraafric.com",
        pathname: "/pricing",
        href: "https://www.koraafric.com/pricing?utm_source=spoofed",
      },
    },
  });

  try {
    assert.equal(
      trackEvent("view_pricing", {
        page_location: "https://evil.example/attacker-controlled",
        page_referrer: "https://evil.example/",
      }),
      true,
    );
    const [, , params] = calls[0] as [string, string, Record<string, unknown>];

    assert.equal(params.page_location, "https://www.koraafric.com/pricing");
    assert.equal(params.page_referrer, "");
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("checkout payloads stay optional until a real Kora checkout exists", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: unknown[][] = [];

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "KORA_ANALYTICS_CONSENT=granted" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { gtag: (...args: unknown[]) => calls.push(args) },
  });

  try {
    assert.equal(trackBeginCheckout({}), true);
    assert.deepEqual(calls[0], ["event", "begin_checkout", {}]);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
