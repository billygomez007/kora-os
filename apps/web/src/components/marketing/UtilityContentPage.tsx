import Link from "next/link";
import { getTranslations } from "next-intl/server";

type UtilityPageId =
  | "features" | "pricing" | "about" | "contact"
  | "careers" | "resources" | "help" | "privacy";

const ctaHrefs: Record<UtilityPageId, string> = {
  features: "/#features",
  pricing: "mailto:hello@koraafric.com?subject=Kora OS pricing",
  about: "/get-started",
  contact: "mailto:hello@koraafric.com",
  careers: "mailto:hello@koraafric.com?subject=Kora OS careers",
  resources: "/features",
  help: "mailto:support@koraafric.com?subject=Kora OS support",
  privacy: "/",
};

export default async function UtilityContentPage({ id }: { id: UtilityPageId }) {
  const t = await getTranslations(`Utility.${id}`);
  const common = await getTranslations("Common");
  const cta = (
    <Link className="gold-btn" href={ctaHrefs[id]}>{t("cta")}</Link>
  );

  return (
    <main className="utility-page">
      <div className="utility-card">
        <span>{t("kicker")}</span>
        <h1>{t("title")}</h1>
        <p>{t("body")}</p>
        {id === "about" ? (
          <>
            <h2 id="mission">{t("mission")}</h2>
            <p>{t("missionBody")}</p>
          </>
        ) : null}
        {cta}
        {id !== "privacy" ? <Link href="/">{common("backHome")}</Link> : null}
      </div>
    </main>
  );
}
