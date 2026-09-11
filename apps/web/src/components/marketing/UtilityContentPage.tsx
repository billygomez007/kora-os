import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import MarketingFooter from "./MarketingFooter";
import MarketingHeader from "./MarketingHeader";
import PricingPlanGrid from "./PricingPlanGrid";
import { PUBLIC_PRICING } from "@/lib/pricing";

type UtilityPageId = "features" | "pricing" | "resources" | "help" | "privacy";

const ctaHrefs: Record<UtilityPageId, string> = {
  features: "/get-started",
  pricing: "mailto:hello@koraafric.com?subject=Kora OS pricing",
  resources: "/help",
  help: "mailto:info@koraafric.com?subject=Kora OS support",
  privacy: "/",
};
const featureGroups = ["operations", "customers", "team", "commerce", "reporting", "structure"] as const;
const featureItems = {
  operations: ["dashboard", "appointments", "queue", "customers"],
  customers: ["records", "bookings", "discovery", "storefront"],
  team: ["directory", "invitations", "permissions", "availability"],
  commerce: ["services", "products", "inventory", "transactions", "payments", "cash"],
  reporting: ["verified", "performance", "commissions", "reconciliation"],
  structure: ["organizations", "branches", "roles", "marketplace"],
} as const;
const pricingPlans = ["starter", "business", "pro", "enterprise"] as const;
const resourceCategories = ["gettingStarted", "operations", "team", "customers", "commerce", "reports", "marketplace", "security"] as const;
const helpCategories = ["gettingStarted", "appointments", "team", "customers", "services", "products", "payments", "reports", "marketplace", "security"] as const;
const privacySections = ["information", "business", "customer", "commerce", "sessions", "use", "retention", "rights", "security", "contact"] as const;

function localizePath(locale: string, path: string) {
  return path.startsWith("/") ? `/${locale}${path}` : path;
}

export default async function UtilityContentPage({ id }: { id: UtilityPageId }) {
  const locale = await getLocale();
  const t = await getTranslations(id === "pricing" ? "Pricing" : `Utility.${id}`);
  const common = await getTranslations("Common");

  return (
    <main className="public-content-page">
      <div className="public-content-nav"><MarketingHeader /></div>
      <header className="public-content-hero shell">
        <span>{t("kicker")}</span><h1>{t("title")}</h1><p>{t("body")}</p>
        <div className="public-content-actions">
          <Link className="gold-btn" href={localizePath(locale, ctaHrefs[id])}>{t("cta")}</Link>
          {id === "features" ? <Link className="outline-btn" href={localizePath(locale, "/marketplace")}>{t("secondaryCta")}</Link> : null}
          {id !== "privacy" ? <Link className="public-content-back" href={`/${locale}`}>{common("backHome")}</Link> : null}
        </div>
      </header>

      {id === "features" ? (
        <>
          <section className="public-content-intro shell"><p>{t("intro")}</p></section>
          {featureGroups.map((group) => <section className="public-content-section shell" key={group}>
            <div className="public-content-heading"><span>{t(`groups.${group}.kicker`)}</span><h2>{t(`groups.${group}.title`)}</h2><p>{t(`groups.${group}.body`)}</p></div>
            <div className="public-content-feature-grid">{featureItems[group].map((item, index) => <article key={item}><span className="public-content-index">{String(index + 1).padStart(2, "0")}</span><h3>{t(`groups.${group}.items.${item}.title`)}</h3><p>{t(`groups.${group}.items.${item}.body`)}</p></article>)}</div>
          </section>)}
          <section className="public-content-bridge"><div className="shell"><span>{t("bridge.kicker")}</span><h2>{t("bridge.title")}</h2><p>{t("bridge.body")}</p></div></section>
        </>
      ) : null}

      {id === "pricing" ? (
        <>
          <section className="public-content-intro shell"><p>{t("intro")}</p></section>
          <section className="public-content-section shell"><div className="public-content-heading"><span>{t("plansKicker")}</span><h2>{t("plansTitle")}</h2><p>{t("plansBody")}</p></div><PricingPlanGrid
            plans={pricingPlans.map((plan) => ({
              code: plan,
              label: t(`plans.${plan}.label`),
              name: t(`plans.${plan}.name`),
              body: t(`plans.${plan}.body`),
              cta: t(`plans.${plan}.cta`),
              href: localizePath(locale, plan === "enterprise" ? "/contact" : "/get-started"),
              monthlyAmountMinor: PUBLIC_PRICING[plan].monthlyAmountMinor,
              annualAmountMinor: PUBLIC_PRICING[plan].annualAmountMinor,
              annualBeforeAmountMinor: PUBLIC_PRICING[plan].monthlyAmountMinor === null ? null : PUBLIC_PRICING[plan].monthlyAmountMinor * 12,
              items: ["branches", "staff", "reports", "support"].map((item) => t(`plans.${plan}.items.${item}`)),
            }))}
            monthlyLabel={t("monthly")}
            annualLabel={t("annual")}
            saveAnnualLabel={t("saveAnnual")}
            perMonthLabel={t("perMonth")}
            perYearLabel={t("perYear")}
            customLabel={t("custom")}
            toggleLabel={t("billingToggle")}
            pricingNote={t("pricingNote")}
          /></section>
          <section className="public-content-faq shell"><div><span>{t("faqKicker")}</span><h2>{t("faqTitle")}</h2></div><div>{(["price", "limits", "change", "enterprise"] as const).map((item) => <details key={item}><summary>{t(`faq.${item}.question`)}</summary><p>{t(`faq.${item}.answer`)}</p></details>)}</div></section>
        </>
      ) : null}

      {id === "resources" ? <section className="public-content-section shell"><div className="public-content-heading"><span>{t("libraryKicker")}</span><h2>{t("libraryTitle")}</h2><p>{t("libraryBody")}</p></div><div className="public-content-category-grid">{resourceCategories.map((category, index) => <article key={category}><span className="public-content-index">{String(index + 1).padStart(2, "0")}</span><h3>{t(`categories.${category}.title`)}</h3><p>{t(`categories.${category}.body`)}</p><Link href={localizePath(locale, t(`categories.${category}.href`))}>{t("explore")}</Link></article>)}</div><div className="public-content-note"><strong>{t("noteTitle")}</strong><p>{t("noteBody")}</p></div></section> : null}

      {id === "help" ? <><section className="public-content-section shell"><div className="public-content-heading"><span>{t("centreKicker")}</span><h2>{t("centreTitle")}</h2><p>{t("centreBody")}</p></div><div className="public-content-category-grid">{helpCategories.map((category, index) => <article key={category}><span className="public-content-index">{String(index + 1).padStart(2, "0")}</span><h3>{t(`categories.${category}.title`)}</h3><p>{t(`categories.${category}.body`)}</p></article>)}</div></section><section className="public-content-contact-strip"><div className="shell"><div><span>{t("contactKicker")}</span><h2>{t("contactTitle")}</h2><p>{t("contactBody")}</p></div><div className="public-contact-links"><a href="mailto:hello@koraafric.com"><span>{t("general")}</span>hello@koraafric.com</a><a href="mailto:info@koraafric.com"><span>{t("information")}</span>info@koraafric.com</a><a href="tel:0302952240"><span>{t("phone")}</span>0302952240</a><span><span>{t("location")}</span>Accra, Ghana</span></div></div></section></> : null}

      {id === "privacy" ? <section className="public-content-legal shell"><div className="public-content-heading"><span>{t("legalKicker")}</span><h2>{t("legalTitle")}</h2><p>{t("legalIntro")}</p></div><div className="public-content-legal-grid">{privacySections.map((section) => <article key={section}><h3>{t(`sections.${section}.title`)}</h3><p>{t(`sections.${section}.body`)}</p></article>)}</div><p className="public-content-last-updated">{t("lastUpdated")}</p></section> : null}

      <MarketingFooter />
    </main>
  );
}
