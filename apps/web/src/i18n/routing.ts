import { isLocale, type Locale } from "./config.ts";

export function localeInPathname(pathname: string): Locale | null {
  const segment = pathname.split("/")[1];
  return isLocale(segment) ? segment : null;
}

export function stripLocale(pathname: string): string {
  const locale = localeInPathname(pathname);
  if (!locale) return pathname || "/";
  const stripped = pathname.slice(locale.length + 1);
  return stripped || "/";
}

export function localizePathname(pathname: string, locale: Locale): string {
  const base = stripLocale(pathname);
  return base === "/" ? `/${locale}` : `/${locale}${base}`;
}
