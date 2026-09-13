"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  analyticsConsentUpdate,
  ANALYTICS_CONSENT_EVENT,
  clearGoogleAnalyticsCookies,
  KORA_GA_MEASUREMENT_ID,
  isAnalyticsRuntimePath,
  isPublicAnalyticsPath,
  readAnalyticsConsent,
  safeAnalyticsPath,
  type AnalyticsConsent,
} from "@/lib/analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __koraGaInitialized?: boolean;
    __koraGaConfigured?: boolean;
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
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const production = process.env.NODE_ENV === "production";
  const publicPath = Boolean(pathname && production && isPublicAnalyticsPath(pathname));
  const analyticsPath = Boolean(pathname && production && isAnalyticsRuntimePath(pathname));
  const trackable = analyticsPath && consent === "granted";

  useEffect(() => {
    if (!analyticsPath) {
      return;
    }

    const syncConsent = window.setTimeout(() => setConsent(readAnalyticsConsent()), 0);
    const handleConsent = (event: Event) => {
      const nextConsent = (event as CustomEvent<AnalyticsConsent>).detail;
      if (nextConsent === "granted" || nextConsent === "denied") {
        setConsent(nextConsent);
      }
    };

    window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    return () => {
      window.clearTimeout(syncConsent);
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    };
  }, [analyticsPath]);

  useEffect(() => {
    if (consent !== "denied") return;
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", analyticsConsentUpdate("denied"));
    }
    clearGoogleAnalyticsCookies();
    handledPath.current = null;
  }, [consent]);

  useEffect(() => {
    if (!pathname) return;

    if (!publicPath || !trackable) {
      handledPath.current = null;
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
  }, [pathname, publicPath, trackable]);

  useEffect(() => {
    if (!trackable || typeof window.gtag !== "function") return;

    window.gtag("consent", "update", analyticsConsentUpdate("granted"));

    if (!window.__koraGaConfigured) {
      window.gtag("config", KORA_GA_MEASUREMENT_ID, { send_page_view: false });
      window.__koraGaConfigured = true;
    }
  }, [trackable]);

  if (!trackable) return null;

  return (
    <>
      <Script id="kora-ga4-init" strategy="afterInteractive">
        {`if (!window.__koraGaInitialized) {
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
window.gtag('js', new Date());
window.gtag('consent', 'default', {analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
window.__koraGaInitialized = true;
}
window.gtag('consent', 'update', {analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
if (!window.__koraGaConfigured) {
window.gtag('config', '${KORA_GA_MEASUREMENT_ID}', {send_page_view: false});
window.__koraGaConfigured = true;
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
