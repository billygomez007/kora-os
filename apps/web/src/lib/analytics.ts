export const KORA_GA_MEASUREMENT_ID = "G-C58FM02YE0";
export const ANALYTICS_CONSENT_COOKIE = "KORA_ANALYTICS_CONSENT";
export const ANALYTICS_CONSENT_MAX_AGE = 60 * 60 * 24 * 365;
export const ANALYTICS_CONSENT_EVENT = "kora:analytics-consent";
export const ANALYTICS_PREFERENCES_EVENT = "kora:analytics-preferences";

export type AnalyticsConsent = "granted" | "denied";

export const ANALYTICS_CONSENT_DEFAULT = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;

type AnalyticsScalar = string | number | boolean;
export type AnalyticsItem = Readonly<Record<string, AnalyticsScalar>>;
export type AnalyticsEventParams = Readonly<Record<string, AnalyticsScalar | readonly AnalyticsItem[]>>;

export type AnalyticsEventName =
  | "sign_up"
  | "generate_lead"
  | "begin_checkout"
  | "purchase"
  | "login"
  | "view_pricing";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function analyticsConsentUpdate(consent: AnalyticsConsent) {
  return {
    ...ANALYTICS_CONSENT_DEFAULT,
    analytics_storage: consent,
  } as const;
}

export function parseAnalyticsConsent(cookieHeader: string): AnalyticsConsent | null {
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ANALYTICS_CONSENT_COOKIE}=`));

  const value = entry?.slice(ANALYTICS_CONSENT_COOKIE.length + 1);
  return value === "granted" || value === "denied" ? value : null;
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof document === "undefined") return null;
  return parseAnalyticsConsent(document.cookie);
}

export function setAnalyticsConsent(consent: AnalyticsConsent): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${consent}; Path=/; Max-Age=${ANALYTICS_CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent<AnalyticsConsent>(ANALYTICS_CONSENT_EVENT, { detail: consent }));
}

export function requestAnalyticsPreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ANALYTICS_PREFERENCES_EVENT));
}

export function clearGoogleAnalyticsCookies(): void {
  if (typeof document === "undefined") return;
  const cookieNames = document.cookie
    .split(";")
    .map((part) => part.trim().split("=", 1)[0])
    .filter((name) => /^_ga(?:_|$)/.test(name));

  for (const name of cookieNames) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

/**
 * Send a consent-gated GA4 event through the existing direct gtag integration.
 * Event payloads intentionally accept only scalar values and safe item data;
 * callers must never pass identity, contact, authentication, or payment data.
 */
export function trackEvent(
  name: AnalyticsEventName,
  params: AnalyticsEventParams = {},
): boolean {
  if (typeof window === "undefined" || readAnalyticsConsent() !== "granted") {
    return false;
  }

  if (typeof window.gtag !== "function") return false;

  try {
    window.gtag("event", name, params);
    return true;
  } catch {
    // Analytics must never block authentication or onboarding.
    return false;
  }
}

const trackedSignUpKeys = new Set<string>();

function signUpWasTracked(key: string): boolean {
  if (trackedSignUpKeys.has(key)) return true;

  try {
    if (window.sessionStorage?.getItem(key) === "1") {
      trackedSignUpKeys.add(key);
      return true;
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return false;
}

function rememberSignUp(key: string): void {
  trackedSignUpKeys.add(key);

  try {
    window.sessionStorage?.setItem(key, "1");
  } catch {
    // The in-memory guard still protects retries in this page lifecycle.
  }
}

export function trackSignUp(organizationId: string): boolean {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) return false;

  const key = `kora.analytics.signup.${encodeURIComponent(normalizedOrganizationId)}`;
  if (signUpWasTracked(key)) return false;

  if (!trackEvent("sign_up", { method: "email_otp" })) return false;
  rememberSignUp(key);
  return true;
}

export function trackLead(): boolean {
  return trackEvent("generate_lead");
}

export function trackBeginCheckout(input: {
  currency?: string;
  value?: number;
  items?: readonly AnalyticsItem[];
} = {}): boolean {
  const params: AnalyticsEventParams = {
    ...(input.currency ? { currency: input.currency } : {}),
    ...(typeof input.value === "number" ? { value: input.value } : {}),
    ...(input.items ? { items: input.items } : {}),
  };

  return trackEvent("begin_checkout", params);
}

const trackedPurchaseKeys = new Set<string>();

function purchaseWasTracked(key: string): boolean {
  if (trackedPurchaseKeys.has(key)) return true;

  try {
    if (window.sessionStorage?.getItem(key) === "1") {
      trackedPurchaseKeys.add(key);
      return true;
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return false;
}

function rememberPurchase(key: string): void {
  trackedPurchaseKeys.add(key);

  try {
    window.sessionStorage?.setItem(key, "1");
  } catch {
    // The in-memory guard still protects retries in this page lifecycle.
  }
}

export function trackPurchase(input: {
  transactionId: string;
  currency?: string;
  value?: number;
  items?: readonly AnalyticsItem[];
}): boolean {
  const transactionId = input.transactionId.trim();
  if (!transactionId) return false;

  const key = `kora.analytics.purchase.${encodeURIComponent(transactionId)}`;
  if (purchaseWasTracked(key)) return false;

  const params: AnalyticsEventParams = {
    transaction_id: transactionId,
    ...(input.currency ? { currency: input.currency } : {}),
    ...(typeof input.value === "number" ? { value: input.value } : {}),
    ...(input.items ? { items: input.items } : {}),
  };

  if (!trackEvent("purchase", params)) return false;
  rememberPurchase(key);
  return true;
}

export function trackLogin(): boolean {
  return trackEvent("login", { method: "email_otp" });
}

export function trackPricingView(): boolean {
  return trackEvent("view_pricing");
}

const PUBLIC_ANALYTICS_PATHS = new Set([
  "/",
  "/about",
  "/careers",
  "/contact",
  "/features",
  "/get-started",
  "/help",
  "/mission",
  "/pricing",
  "/privacy",
  "/resources",
  "/marketplace",
]);

/**
 * Keep analytics page locations limited to public marketing routes. Locale
 * prefixes are part of the measured path so English/French navigation is
 * distinguishable, while query strings are intentionally never included.
 */
export function isPublicAnalyticsPath(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\/(?:en|fr)(?=\/|$)/, "") || "/";
  return (
    PUBLIC_ANALYTICS_PATHS.has(withoutLocale) ||
    withoutLocale.startsWith("/marketplace/")
  );
}

/**
 * Auth/onboarding routes can host explicit post-success events, but they must
 * never generate page views. They are eligible only when the visitor already
 * has an accepted analytics preference; the consent banner remains public-site
 * only.
 */
const EVENT_ANALYTICS_PATHS = new Set(["/login", "/verify", "/onboarding"]);

export function isAnalyticsRuntimePath(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\/(?:en|fr)(?=\/|$)/, "") || "/";
  return isPublicAnalyticsPath(pathname) || EVENT_ANALYTICS_PATHS.has(withoutLocale);
}

export function safeAnalyticsPath(pathname: string): string {
  return pathname.split("?", 1)[0] || "/";
}
