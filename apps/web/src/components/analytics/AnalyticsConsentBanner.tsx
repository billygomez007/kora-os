"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_PREFERENCES_EVENT,
  clearGoogleAnalyticsCookies,
  isPublicAnalyticsPath,
  readAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics";

export default function AnalyticsConsentBanner() {
  const pathname = usePathname();
  const t = useTranslations("AnalyticsConsent");
  const production = process.env.NODE_ENV === "production";
  const eligible = Boolean(pathname && production && isPublicAnalyticsPath(pathname));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!eligible) {
      return;
    }

    const syncVisibility = window.setTimeout(() => setVisible(readAnalyticsConsent() === null), 0);
    const handlePreferences = () => setVisible(true);
    const handleConsent = (event: Event) => {
      const consent = (event as CustomEvent<AnalyticsConsent>).detail;
      if (consent === "granted" || consent === "denied") setVisible(false);
    };

    window.addEventListener(ANALYTICS_PREFERENCES_EVENT, handlePreferences);
    window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    return () => {
      window.clearTimeout(syncVisibility);
      window.removeEventListener(ANALYTICS_PREFERENCES_EVENT, handlePreferences);
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    };
  }, [eligible]);

  if (!eligible || !visible) return null;

  const choose = (consent: AnalyticsConsent) => {
    if (consent === "denied") clearGoogleAnalyticsCookies();
    setAnalyticsConsent(consent);
  };

  const locale = pathname?.startsWith("/fr") ? "fr" : "en";
  const privacyHref = `/${locale}/privacy`;

  return (
    <section className="analytics-consent-banner" role="region" aria-label={t("ariaLabel")}>
      <div className="analytics-consent-copy">
        <h2>{t("title")}</h2>
        <p>{t("body")}</p>
        <a href={privacyHref}>{t("learnMore")}</a>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" className="analytics-consent-decline" onClick={() => choose("denied")}>
          {t("decline")}
        </button>
        <button type="button" className="gold-btn analytics-consent-accept" onClick={() => choose("granted")}>
          {t("accept")}
        </button>
      </div>
    </section>
  );
}
