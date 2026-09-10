import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CompanyPageLayout from "@/components/marketing/CompanyPageLayout";
import ContactEnquiryForm from "@/components/marketing/ContactEnquiryForm";

const supportKeys = ["business", "partnerships", "support"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CompanyPages.contact.meta");
  return { title: t("title"), description: t("description") };
}

export default async function ContactPage() {
  const t = await getTranslations("CompanyPages.contact");
  return (
    <CompanyPageLayout>
      <header className="company-hero shell"><span>{t("eyebrow")}</span><h1>{t("headline")}</h1><p>{t("intro")}</p></header>
      <section className="contact-layout shell" aria-labelledby="contact-form-title">
        <div className="contact-form-wrap">
          <span className="company-section-label">{t("formEyebrow")}</span>
          <h2 id="contact-form-title">{t("formTitle")}</h2>
          <ContactEnquiryForm />
        </div>
        <aside className="contact-details" aria-label={t("details.label")}>
          <span>{t("details.eyebrow")}</span>
          <strong>Kora OS</strong>
          <div className="contact-detail-list">
            <div><span>{t("details.general")}</span><a href="mailto:hello@koraafric.com">hello@koraafric.com</a></div>
            <div><span>{t("details.information")}</span><a href="mailto:info@koraafric.com">info@koraafric.com</a></div>
            <div><span>{t("details.phone")}</span><a href="tel:0302952240">0302952240</a></div>
            <div><span>{t("details.locationLabel")}</span><p>{t("details.location")}</p></div>
            <div><span>{t("details.website")}</span><a href="https://koraafric.com">koraafric.com</a></div>
          </div>
        </aside>
      </section>
      <section className="contact-paths" aria-labelledby="contact-paths-title">
        <div className="shell">
          <div className="company-section-heading"><span>{t("paths.eyebrow")}</span><h2 id="contact-paths-title">{t("paths.title")}</h2></div>
          <div className="contact-path-grid">
            {supportKeys.map((key) => <article key={key}><h3>{t(`paths.items.${key}.title`)}</h3><p>{t(`paths.items.${key}.body`)}</p></article>)}
          </div>
        </div>
      </section>
    </CompanyPageLayout>
  );
}
