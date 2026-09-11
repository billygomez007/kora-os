import { NextResponse, type NextRequest } from "next/server";
import {
  localeCookieName,
  localeFromCountry,
  resolveLocale,
} from "@/i18n/config";
import { localeInPathname, stripLocale } from "@/i18n/routing";

const COUNTRY_HEADERS = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "cloudfront-viewer-country",
] as const;

function countryHint(request: NextRequest): string | null {
  for (const header of COUNTRY_HEADERS) {
    const value = request.headers.get(header);
    if (value && localeFromCountry(value)) return value;
  }
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const explicitLocale = localeInPathname(pathname);

  if (!explicitLocale) {
    const locale = resolveLocale({
      savedLocale: request.cookies.get(localeCookieName)?.value,
      acceptLanguage: request.headers.get("accept-language"),
      country: countryHint(request),
    });
    const destination = request.nextUrl.clone();
    destination.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
    return NextResponse.redirect(destination);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-kora-locale", explicitLocale);
  requestHeaders.set("x-kora-pathname", stripLocale(pathname));
  const destination = request.nextUrl.clone();
  destination.pathname = stripLocale(pathname);

  return NextResponse.rewrite(destination, {
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
