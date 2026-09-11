import { getLocale, getTranslations } from "next-intl/server";
import { type Locale } from "@/i18n/config";
import { localizePathname } from "@/i18n/routing";
import { Logo } from "./Logo";

export default async function MarketingFooter() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("Home");
  const header = await getTranslations("MarketingHeader");
  const href = (pathname: string) => localizePathname(pathname, locale);

  return (
    <footer id="resources">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <Logo />
          <p>{t("footerBody")}</p>
          <strong>koraafric.com</strong>
        </div>

        <div>
          <strong>{t("product")}</strong>
          <a href={`${href("/")}#features`}>{header("features")}</a>
          <a href={`${href("/")}#businesses`}>{header("businesses")}</a>
          <a href={`${href("/")}#customers`}>{header("customers")}</a>
          <a href={`${href("/")}#pricing`}>{header("pricing")}</a>
        </div>

        <div>
          <strong>{t("company")}</strong>
          <a href={href("/about")}>{t("about")}</a>
          <a href={href("/mission")}>{t("mission")}</a>
          <a href={href("/careers")}>{t("careers")}</a>
          <a href={href("/contact")}>{t("contact")}</a>
        </div>

        <div>
          <strong>{t("support")}</strong>
          <a href={href("/help")}>{t("help")}</a>
          <a href={href("/resources")}>{t("guides")}</a>
          <a href={`${href("/contact")}?type=support`}>{t("contactSupport")}</a>
          <a href={href("/privacy")}>{t("privacy")}</a>
        </div>

        <div className="footer-real">
          {t("footer.developedBy")}
          <br />
          {t("footer.builtFor")}
        </div>
      </div>
    </footer>
  );
}
