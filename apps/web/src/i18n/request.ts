import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";
import { defaultLocale, isLocale } from "./config";

export default getRequestConfig(async () => {
  const requestHeaders = await headers();
  const requestedLocale = requestHeaders.get("x-kora-locale");
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    formats: {
      dateTime: {
        short: { year: "numeric", month: "short", day: "numeric" },
        dateTime: {
          year: "numeric", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit",
        },
      },
      number: {
        compact: { notation: "compact", maximumFractionDigits: 1 },
      },
    },
  };
});
