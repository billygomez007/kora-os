"use client";

import { useEffect, useRef } from "react";
import {
  ANALYTICS_CONSENT_EVENT,
  readAnalyticsConsent,
  trackPricingView,
  type AnalyticsConsent,
} from "@/lib/analytics";

/**
 * Tracks the pricing page only after consent and after the existing GA4
 * script has become available. It emits once per mounted pricing page view.
 */
export default function PricingViewTracker() {
  const tracked = useRef(false);

  useEffect(() => {
    let retryTimer: number | undefined;
    let attempts = 0;

    const attempt = () => {
      if (tracked.current || readAnalyticsConsent() !== "granted") return;

      if (trackPricingView()) {
        tracked.current = true;
        return;
      }

      if (attempts < 20) {
        attempts += 1;
        retryTimer = window.setTimeout(attempt, 250);
      }
    };

    const handleConsent = (event: Event) => {
      const consent = (event as CustomEvent<AnalyticsConsent>).detail;
      if (consent === "granted") {
        attempts = 0;
        attempt();
      }
    };

    window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    attempt();

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    };
  }, []);

  return null;
}
