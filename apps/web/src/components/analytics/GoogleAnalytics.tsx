"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  KORA_GA_MEASUREMENT_ID,
  isPublicAnalyticsPath,
  safeAnalyticsPath,
} from "@/lib/analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __koraGaInitialized?: boolean;
  }
}

/**
 * Production-only GA4 installation for public marketing routes. Automatic
 * config page views are disabled so this component owns exactly one page_view
 * per client-side pathname transition and never forwards query strings.
 */
export default function GoogleAnalytics() {
  const pathname = usePathname();
  const handledPath = useRef<string | null>(null);
  const production = process.env.NODE_ENV === "production";
  const trackable = Boolean(pathname && production && isPublicAnalyticsPath(pathname));

  useEffect(() => {
    if (!pathname) return;

    if (!trackable) {
      handledPath.current = pathname;
      return;
    }

    if (handledPath.current === pathname) return;
    handledPath.current = pathname;

    const pagePath = safeAnalyticsPath(pathname);
    let attempts = 0;
    let retryTimer: number | undefined;

    const sendPageView = () => {
      if (typeof window.gtag !== "function") {
        if (attempts < 20) {
          attempts += 1;
          retryTimer = window.setTimeout(sendPageView, 250);
        }
        return;
      }

      window.gtag("event", "page_view", {
        page_path: pagePath,
        page_location: `${window.location.origin}${pagePath}`,
        page_title: document.title,
      });
    };

    sendPageView();
    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [pathname, trackable]);

  if (!trackable) return null;

  return (
    <>
      <Script id="kora-ga4-init" strategy="afterInteractive">
        {`if (!window.__koraGaInitialized) {
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
window.gtag('js', new Date());
window.gtag('config', '${KORA_GA_MEASUREMENT_ID}', {send_page_view: false});
window.__koraGaInitialized = true;
}`}
      </Script>
      <Script
        id="kora-ga4-script"
        src={`https://www.googletagmanager.com/gtag/js?id=${KORA_GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
    </>
  );
}
