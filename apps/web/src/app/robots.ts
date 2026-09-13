import type { MetadataRoute } from "next";

const PRODUCTION_ORIGIN = "https://www.koraafric.com";

const PRIVATE_ROUTE_PREFIXES = [
  "/app",
  "/en/app",
  "/fr/app",
  "/login",
  "/en/login",
  "/fr/login",
  "/verify",
  "/en/verify",
  "/fr/verify",
  "/get-started",
  "/en/get-started",
  "/fr/get-started",
  "/onboarding",
  "/en/onboarding",
  "/fr/onboarding",
  "/customer-onboarding",
  "/en/customer-onboarding",
  "/fr/customer-onboarding",
  "/access-unavailable",
  "/en/access-unavailable",
  "/fr/access-unavailable",
  "/invite/",
  "/en/invite/",
  "/fr/invite/",
  "/q/",
  "/en/q/",
  "/fr/q/",
  "/super-admin",
  "/en/super-admin",
  "/fr/super-admin",
  "/api/",
  "/_next/",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PRIVATE_ROUTE_PREFIXES],
    },
    sitemap: `${PRODUCTION_ORIGIN}/sitemap.xml`,
    host: PRODUCTION_ORIGIN,
  };
}
