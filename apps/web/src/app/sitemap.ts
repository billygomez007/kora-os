import type { MetadataRoute } from "next";

const PRODUCTION_ORIGIN = "https://www.koraafric.com";

// Keep this list limited to public, indexable routes that exist in the App
// Router. Dynamic customer, invitation, QR and business-workspace URLs are
// intentionally excluded because they are not a stable public site map.
const PUBLIC_PATHS = [
  "/",
  "/about",
  "/mission",
  "/careers",
  "/contact",
  "/features",
  "/help",
  "/marketplace",
  "/pricing",
  "/privacy",
  "/resources",
] as const;

function localizedUrl(locale: "en" | "fr", path: (typeof PUBLIC_PATHS)[number]) {
  return `${PRODUCTION_ORIGIN}/${locale}${path === "/" ? "" : path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.flatMap((path) => {
    const englishUrl = localizedUrl("en", path);
    const frenchUrl = localizedUrl("fr", path);
    const isHomepage = path === "/";
    const isLegal = path === "/privacy";
    const isMarketplace = path === "/marketplace";

    return [
      {
        url: englishUrl,
        changeFrequency: isHomepage || isMarketplace ? "weekly" : isLegal ? "yearly" : "monthly",
        priority: isHomepage ? 1 : isMarketplace ? 0.8 : isLegal ? 0.4 : 0.7,
        alternates: {
          languages: {
            en: englishUrl,
            fr: frenchUrl,
            "x-default": englishUrl,
          },
        },
      },
      {
        url: frenchUrl,
        changeFrequency: isHomepage || isMarketplace ? "weekly" : isLegal ? "yearly" : "monthly",
        priority: isHomepage ? 1 : isMarketplace ? 0.8 : isLegal ? 0.4 : 0.7,
        alternates: {
          languages: {
            en: englishUrl,
            fr: frenchUrl,
            "x-default": englishUrl,
          },
        },
      },
    ];
  });
}
