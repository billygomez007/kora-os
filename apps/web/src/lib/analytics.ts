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

export function safeAnalyticsPath(pathname: string): string {
  return pathname.split("?", 1)[0] || "/";
}
