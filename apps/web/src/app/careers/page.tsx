import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import CompanyPageLayout from "@/components/marketing/CompanyPageLayout";
import { type Locale } from "@/i18n/config";
import { localizePathname } from "@/i18n/routing";

const valueKeys = ["curious", "responsible", "collaborative", "practical"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CompanyPages.careers.meta");
  return { title: t("title"), description: t("description") };
}

export default async function CareersPage() {
  const t = await getTranslations("CompanyPages.careers");
  const locale = (await getLocale()) as Locale;
  return (
    <CompanyPageLayout>
      <header className="company-hero shell"><span>{t("eyebrow")}</span><h1>{t("headline")}</h1><p>{t("intro")}</p></header>
      <section className="company-story shell" aria-labelledby="careers-story-title">
        <div><span className="company-section-label">{t("workEyebrow")}</span><h2 id="careers-story-title">{t("workTitle")}</h2></div>
        <div className="company-prose"><p>{t("platform")}</p><p>{t("people")}</p></div>
      </section>
      <section className="company-values" aria-labelledby="values-title">
        <div className="shell">
          <div className="company-section-heading"><span>{t("values.eyebrow")}</span><h2 id="values-title">{t("values.title")}</h2></div>
          <div className="company-value-grid">{valueKeys.map((key) => <article key={key}><h3>{t(`values.items.${key}.title`)}</h3><p>{t(`values.items.${key}.body`)}</p></article>)}</div>
        </div>
      </section>
      <section className="company-openings shell" aria-labelledby="openings-title">
        <div><span>{t("openings.eyebrow")}</span><h2 id="openings-title">{t("openings.title")}</h2><p>{t("openings.body")}</p><a className="gold-btn" href={`${localizePathname("/contact", locale)}?type=careers`}>{t("openings.cta")}</a></div>
        <small>{t("attribution")}</small>
      </section>
    </CompanyPageLayout>
  );
}
