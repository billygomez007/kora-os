"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import AuthEntry from "@/components/auth/AuthEntry";

type Journey = "business" | "customer" | null;

export default function GetStartedPage() {
  const locale = useLocale();
  const t = useTranslations("Auth");
  const [journey, setJourney] = useState<Journey>(null);

  if (journey) {
    return (
      <AuthEntry
        mode="signup"
        journey={journey}
        onBack={() => setJourney(null)}
      />
    );
  }

  const localize = (path: string) => `/${locale}${path}`;

  return (
    <main className="kora-journey-page">
      <div className="kora-journey-glow kora-journey-glow-one" />
      <div className="kora-journey-glow kora-journey-glow-two" />

      <div className="kora-journey-shell">
        <header className="kora-journey-topbar">
          <Link href={localize("/")} className="auth-logo">
            <Image
              src="/brand/kora-app-icon.png"
              alt="Kora OS"
              width={44}
              height={44}
              priority
            />
            <strong>Kora OS</strong>
          </Link>

          <div className="kora-journey-signin">
            {t("alreadyUse")} <Link href={localize("/login")}>{t("signIn")}</Link>
          </div>
        </header>

        <section className="kora-journey-heading">
          <span>{t("getStarted")}</span>
          <h1>{t("journeyTitle")}</h1>
          <p>
            {t("journeyBody")}
          </p>
        </section>

        <section className="kora-journey-grid">
          <button
            type="button"
            className="kora-journey-card kora-journey-card-featured"
            onClick={() => setJourney("business")}
          >
            <div className="kora-journey-card-top">
              <span className="kora-journey-number">01</span>
              <span className="kora-journey-badge">{t("forBusiness")}</span>
            </div>

            <div>
              <h2>{t("runBusiness")}</h2>
              <p>{t("runBusinessBody")}</p>
            </div>

            <div className="kora-journey-features">
              <span>{t("appointmentsQueue")}</span>
              <span>{t("staffCustomers")}</span>
              <span>{t("paymentsReceipts")}</span>
              <span>{t("productsInventory")}</span>
            </div>

            <div className="kora-journey-action">
              {t("continueBusiness")} <span>→</span>
            </div>
          </button>

          <button
            type="button"
            className="kora-journey-card"
            onClick={() => setJourney("customer")}
          >
            <div className="kora-journey-card-top">
              <span className="kora-journey-number">02</span>
              <span className="kora-journey-badge">{t("forCustomers")}</span>
            </div>

            <div>
              <h2>{t("bookWithBusinesses")}</h2>
              <p>{t("bookWithBusinessesBody")}</p>
            </div>

            <div className="kora-journey-features">
              <span>{t("discoverBusinesses")}</span>
              <span>{t("bookAppointments")}</span>
              <span>{t("joinQueues")}</span>
              <span>{t("manageBookings")}</span>
            </div>

            <div className="kora-journey-action">
              {t("continueCustomer")} <span>→</span>
            </div>
          </button>
        </section>

        <p className="kora-journey-footnote">
          {t("journeyFootnote")}
        </p>
      </div>
    </main>
  );
}
