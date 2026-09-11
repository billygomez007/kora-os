import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CompanyPageLayout from "@/components/marketing/CompanyPageLayout";

const principleKeys = ["simplify", "visibility", "connections", "growth"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CompanyPages.mission.meta");
  return { title: t("title"), description: t("description") };
}

export default async function MissionPage() {
  const t = await getTranslations("CompanyPages.mission");
  return (
    <CompanyPageLayout>
      <header className="company-hero shell"><span>{t("eyebrow")}</span><h1>{t("headline")}</h1><p>{t("intro")}</p></header>
      <section className="company-story shell" aria-labelledby="mission-story-title">
        <div><span className="company-section-label">{t("beliefEyebrow")}</span><h2 id="mission-story-title">{t("beliefTitle")}</h2></div>
        <div className="company-prose"><p>{t("belief")}</p><p>{t("narrative")}</p></div>
      </section>
      <section className="company-principles" aria-labelledby="principles-title">
        <div className="shell">
          <div className="company-section-heading"><span>{t("principles.eyebrow")}</span><h2 id="principles-title">{t("principles.title")}</h2></div>
          <div className="company-principle-grid">
            {principleKeys.map((key, index) => <article key={key}><span>{String(index + 1).padStart(2, "0")}</span><h3>{t(`principles.items.${key}.title`)}</h3><p>{t(`principles.items.${key}.body`)}</p></article>)}
          </div>
        </div>
      </section>
      <section className="company-vision shell"><span>{t("vision.eyebrow")}</span><h2>{t("vision.title")}</h2><p>{t("vision.body")}</p></section>
    </CompanyPageLayout>
  );
}
