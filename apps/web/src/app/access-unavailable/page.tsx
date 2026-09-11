"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { logoutKoraSession } from "@/lib/api/kora-api";

const KNOWN_REASONS = [
  "inactive_membership",
  "blocked_subscription",
  "api_error",
] as const;
type Reason = (typeof KNOWN_REASONS)[number] | "unknown";

function readReason(value: string | null): Reason {
  return (KNOWN_REASONS as readonly string[]).includes(value ?? "")
    ? (value as Reason)
    : "unknown";
}

function AccessUnavailableContent() {
  const locale = useLocale();
  const t = useTranslations("AccessStatus");
  const reason = readReason(useSearchParams().get("reason"));
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logoutKoraSession();
    } finally {
      window.location.replace(`/${locale}/login`);
    }
  }

  const copy = {
    inactive_membership: { title: t("inactiveTitle"), body: t("inactiveBody") },
    blocked_subscription: { title: t("blockedTitle"), body: t("blockedBody") },
    api_error: { title: t("errorTitle"), body: t("errorBody") },
    unknown: { title: t("genericTitle"), body: t("genericBody") },
  }[reason];

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      <section className="auth-card">
        <Link href={`/${locale}`} className="auth-logo">
          <Image
            src="/brand/kora-app-icon.png"
            alt="Kora OS"
            width={44}
            height={44}
            priority
          />
          <strong>Kora OS</strong>
        </Link>

        <div className="auth-heading">
          <span>{t("kicker")}</span>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
        </div>

        {reason === "api_error" && (
          <Link href={`/${locale}/app`} className="auth-primary-button">
            {t("retry")}
          </Link>
        )}

        <button
          type="button"
          className="auth-back-button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
        >
          {signingOut ? t("signingOut") : t("signOut")}
        </button>
      </section>
    </main>
  );
}

export default function AccessUnavailablePage() {
  return (
    <Suspense fallback={null}>
      <AccessUnavailableContent />
    </Suspense>
  );
}
