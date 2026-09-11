import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-kora",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Metadata");
  const pathname = (await headers()).get("x-kora-pathname") || "/";
  const suffix = pathname === "/" ? "" : pathname;
  const canonical = `/${locale}${suffix}`;
  return {
    metadataBase: new URL("https://koraafric.com"),
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical,
      languages: {
        en: `/en${suffix}`,
        fr: `/fr${suffix}`,
        "x-default": `/en${suffix}`,
      },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      locale: locale === "fr" ? "fr_FR" : "en_GH",
      alternateLocale: locale === "fr" ? ["en_GH"] : ["fr_FR"],
      siteName: "Kora OS",
      type: "website",
      url: canonical,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html data-scroll-behavior="smooth" lang={locale} className={manrope.variable}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
