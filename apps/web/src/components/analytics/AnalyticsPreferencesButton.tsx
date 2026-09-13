"use client";

import { useTranslations } from "next-intl";
import { requestAnalyticsPreferences } from "@/lib/analytics";

export default function AnalyticsPreferencesButton() {
  const t = useTranslations("AnalyticsConsent");

  return (
    <button type="button" className="analytics-preferences-link" onClick={requestAnalyticsPreferences}>
      {t("preferences")}
    </button>
  );
}
