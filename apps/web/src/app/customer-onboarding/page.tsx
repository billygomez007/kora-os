"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { koraData } from "@/lib/api/kora-api";

interface CustomerProfile {
  id: string;
  displayName: string;
  email: string | null;
  phoneE164: string | null;
  city: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  locationConsentedAt: string | null;
}

function messageFromError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Kora could not save your profile. Please try again.";
}

export default function CustomerOnboardingPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const profile =
          await koraData<CustomerProfile>("/me/customer-profile");

        if (cancelled) {
          return;
        }

        setDisplayName(profile.displayName ?? "");
        setPhoneE164(profile.phoneE164 ?? "");
        setCity(profile.city ?? "");
        setArea(profile.area ?? "");
        setEmail(profile.email ?? "");
      } catch (error) {
        if (!cancelled) {
          setMessage(messageFromError(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const name = displayName.trim();
    const phone = phoneE164.trim();
    const customerCity = city.trim();
    const customerArea = area.trim();

    if (!name) {
      setMessage("Enter your name to continue.");
      return;
    }

    if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) {
      setMessage(
        "Enter your phone number with the country code, for example +233241234567.",
      );
      return;
    }

    setSaving(true);

    try {
      await koraData<CustomerProfile>("/me/customer-profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: name,
          phoneE164: phone || undefined,
          city: customerCity || undefined,
          area: customerArea || undefined,
        }),
      });

      router.replace("/marketplace");
    } catch (error) {
      setMessage(messageFromError(error));
      setSaving(false);
    }
  }

  return (
    <main className="customer-onboarding-page">
      <div className="customer-onboarding-glow customer-onboarding-glow-one" />
      <div className="customer-onboarding-glow customer-onboarding-glow-two" />

      <div className="customer-onboarding-shell">
        <header className="customer-onboarding-brand">
          <Image
            src="/brand/kora-app-icon.png"
            alt="Kora OS"
            width={46}
            height={46}
            priority
          />
          <strong>Kora OS</strong>
        </header>

        <section className="customer-onboarding-layout">
          <div className="customer-onboarding-intro">
            <span className="customer-onboarding-eyebrow">
              YOUR KORA EXPERIENCE
            </span>

            <h1>
              Your next appointment is closer than you think.
            </h1>

            <p>
              Tell Kora a little about you so we can make discovering and
              booking great businesses easier.
            </p>

            <div className="customer-onboarding-benefits">
              <div>
                <span>01</span>
                <p>
                  <strong>Discover</strong>
                  Find businesses and services that fit what you need.
                </p>
              </div>

              <div>
                <span>02</span>
                <p>
                  <strong>Book</strong>
                  Reserve appointments and manage your schedule in one place.
                </p>
              </div>

              <div>
                <span>03</span>
                <p>
                  <strong>Return</strong>
                  Keep your Kora profile, favourites and bookings connected.
                </p>
              </div>
            </div>
          </div>

          <section className="customer-onboarding-card">
            <div className="customer-onboarding-card-heading">
              <span>WELCOME TO KORA</span>
              <h2>Set up your profile</h2>
              <p>
                A few details now will make booking much faster later.
              </p>
            </div>

            {loading ? (
              <div className="customer-onboarding-loading">
                Preparing your Kora profile…
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {email && (
                  <div className="customer-onboarding-email">
                    <span>Verified email</span>
                    <strong>{email}</strong>
                  </div>
                )}

                <label className="customer-onboarding-field">
                  <span>Full name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Your full name"
                    autoComplete="name"
                    maxLength={160}
                    required
                  />
                </label>

                <label className="customer-onboarding-field">
                  <span>Phone number</span>
                  <input
                    type="tel"
                    value={phoneE164}
                    onChange={(event) => setPhoneE164(event.target.value)}
                    placeholder="+233 24 123 4567"
                    autoComplete="tel"
                  />
                  <small>
                    Include your country code, for example +233241234567.
                  </small>
                </label>

                <div className="customer-onboarding-row">
                  <label className="customer-onboarding-field">
                    <span>City</span>
                    <input
                      type="text"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      placeholder="Accra"
                      autoComplete="address-level2"
                      maxLength={120}
                    />
                  </label>

                  <label className="customer-onboarding-field">
                    <span>Area</span>
                    <input
                      type="text"
                      value={area}
                      onChange={(event) => setArea(event.target.value)}
                      placeholder="East Legon"
                      maxLength={120}
                    />
                  </label>
                </div>

                {message && (
                  <div className="customer-onboarding-error" role="alert">
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  className="customer-onboarding-submit"
                  disabled={saving}
                >
                  {saving ? "Setting up Kora…" : "Continue to Kora"}
                  {!saving && <span>→</span>}
                </button>

                <p className="customer-onboarding-privacy">
                  Your verified email comes from your secure Kora account.
                  Precise location is never required here.
                </p>
              </form>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
