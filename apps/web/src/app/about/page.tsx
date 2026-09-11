import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CompanyPageLayout from "@/components/marketing/CompanyPageLayout";

const connectedKeys = ["staff", "customers", "services", "products", "appointments", "walkIns", "payments", "performance"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CompanyPages.about.meta");
  return { title: t("title"), description: t("description") };
}

export default async function AboutPage() {
  const t = await getTranslations("CompanyPages.about");
  return (
    <CompanyPageLayout>
      <header className="company-hero shell">
        <span>{t("eyebrow")}</span><h1>{t("headline")}</h1><p>{t("intro")}</p>
      </header>
      <section className="company-story shell" aria-labelledby="about-story-title">
        <div><span className="company-section-label">{t("storyEyebrow")}</span><h2 id="about-story-title">{t("storyTitle")}</h2></div>
        <div className="company-prose">
          <p>{t("operations")}</p><p>{t("fragmentation")}</p><p>{t("serviceBusinesses")}</p><p>{t("productBusinesses")}</p><p>{t("marketplace")}</p><p>{t("scale")}</p>
        </div>
      </section>
      <section className="company-connected" aria-labelledby="connected-title">
        <div className="shell">
          <div className="company-section-heading"><span>{t("connected.eyebrow")}</span><h2 id="connected-title">{t("connected.title")}</h2><p>{t("connected.body")}</p></div>
          <div className="company-connected-grid">
            {connectedKeys.map((key, index) => <article key={key}><span>{String(index + 1).padStart(2, "0")}</span><strong>{t(`connected.items.${key}`)}</strong></article>)}
          </div>
        </div>
      </section>
      <section className="company-closing shell">
        <p>{t("closing.lineOne")}<br />{t("closing.lineTwo")}<br /><strong>Kora.</strong></p>
        <small>{t("attribution")}</small>
      </section>
    </CompanyPageLayout>
  );
}
