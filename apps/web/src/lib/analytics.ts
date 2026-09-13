export const KORA_GA_MEASUREMENT_ID = "G-C58FM02YE0";

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
