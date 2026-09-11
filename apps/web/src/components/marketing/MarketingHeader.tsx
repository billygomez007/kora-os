"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { type Locale } from "@/i18n/config";
import { localizePathname } from "@/i18n/routing";
import { Logo } from "./Logo";

export default function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("MarketingHeader");
  const common = useTranslations("Common");
  const locale = useLocale() as Locale;
  const home = localizePathname("/", locale);
  const navLinks = [
    [`${home}#features`, t("features")],
    [`${home}#businesses`, t("businesses")],
    [`${home}#customers`, t("customers")],
    [`${home}#pricing`, t("pricing")],
    [`${home}#resources`, t("resources")],
  ];

  return (
    <header className="nav shell">
      <Logo />

      <nav>
        {navLinks.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>

      <div className="nav-actions">
        <LanguageSwitcher compact />
        <a href={localizePathname("/login", locale)}>{common("signIn")}</a>
        <a className="gold-btn small-btn" href={localizePathname("/get-started", locale)}>
          {common("getStarted")}
        </a>
      </div>

      <button
        type="button"
        className="nav-menu-toggle"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? t("closeMenu") : t("openMenu")}
        onClick={() => setOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>

      {open ? (
        <div
          id="mobile-nav-panel"
          className="mobile-nav-panel"
          role="dialog"
          aria-label={t("siteNavigation")}
        >
          <nav>
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setOpen(false)}>
                {label}
              </a>
            ))}
          </nav>

          <div className="mobile-nav-actions">
            <LanguageSwitcher compact />
            <a href={localizePathname("/login", locale)} onClick={() => setOpen(false)}>
              {common("signIn")}
            </a>
            <a
              className="gold-btn"
              href={localizePathname("/get-started", locale)}
              onClick={() => setOpen(false)}
            >
              {common("getStarted")}
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
