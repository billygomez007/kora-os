"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import AuthEntry from "@/components/auth/AuthEntry";

type Journey = "business" | "customer" | null;

export default function GetStartedPage() {
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

  return (
    <main className="kora-journey-page">
      <div className="kora-journey-glow kora-journey-glow-one" />
      <div className="kora-journey-glow kora-journey-glow-two" />

      <div className="kora-journey-shell">
        <header className="kora-journey-topbar">
          <Link href="/" className="auth-logo">
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
            Already use Kora? <Link href="/login">Sign in</Link>
          </div>
        </header>

        <section className="kora-journey-heading">
          <span>GET STARTED WITH KORA</span>
          <h1>How would you like to use Kora?</h1>
          <p>
            Choose the experience that fits you. You can use the same Kora
            account for both in the future.
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
              <span className="kora-journey-badge">FOR BUSINESS</span>
            </div>

            <div>
              <h2>Run my business</h2>
              <p>
                Manage appointments, staff, customers, payments, products,
                inventory and performance from one Kora workspace.
              </p>
            </div>

            <div className="kora-journey-features">
              <span>Appointments & queue</span>
              <span>Staff & customers</span>
              <span>Payments & receipts</span>
              <span>Products & inventory</span>
            </div>

            <div className="kora-journey-action">
              Continue as a business <span>→</span>
            </div>
          </button>

          <button
            type="button"
            className="kora-journey-card"
            onClick={() => setJourney("customer")}
          >
            <div className="kora-journey-card-top">
              <span className="kora-journey-number">02</span>
              <span className="kora-journey-badge">FOR CUSTOMERS</span>
            </div>

            <div>
              <h2>Book with businesses</h2>
              <p>
                Discover businesses using Kora, book services, join queues and
                keep your appointments in one place.
              </p>
            </div>

            <div className="kora-journey-features">
              <span>Discover businesses</span>
              <span>Book appointments</span>
              <span>Join queues</span>
              <span>Manage bookings</span>
            </div>

            <div className="kora-journey-action">
              Continue as a customer <span>→</span>
            </div>
          </button>
        </section>

        <p className="kora-journey-footnote">
          One secure Kora identity. Business and customer experiences stay
          connected to the same account.
        </p>
      </div>
    </main>
  );
}
