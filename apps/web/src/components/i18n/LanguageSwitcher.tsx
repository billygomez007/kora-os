"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { localeCookieName, type Locale } from "@/i18n/config";
import { localizePathname } from "@/i18n/routing";

function persistLocalePreference(locale: Locale): void {
  document.cookie = `${localeCookieName}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("Common");

  function select(nextLocale: Locale) {
    if (nextLocale === locale) return;
    persistLocalePreference(nextLocale);
    const search = searchParams.toString();
    router.push(`${localizePathname(pathname, nextLocale)}${search ? `?${search}` : ""}`);
  }

  return (
    <div className="language-switcher" role="group" aria-label={t("language")}>
      {(["en", "fr"] as const).map((item) => (
        <button
          key={item}
          type="button"
          className={locale === item ? "is-active" : ""}
          aria-pressed={locale === item}
          title={item === "en" ? t("english") : t("french")}
          onClick={() => select(item)}
        >
          {compact ? item.toUpperCase() : item === "en" ? "EN" : "FR"}
        </button>
      ))}
    </div>
  );
}
