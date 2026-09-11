"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { errorMessage, readResponseBody } from "@/lib/api/kora-api";

type AuthMode = "signin" | "signup";
type SignupJourney = "business" | "customer";

interface OtpRequestResponse {
  data?: {
    challengeId?: string;
    expiresAt?: string;
  };
}

export default function AuthEntry({
  mode,
  journey,
  onBack,
}: {
  mode: AuthMode;
  journey?: SignupJourney;
  onBack?: () => void;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Auth");

  const [email, setEmail] = useState("");

  function invitationTokenFromUrl(): string {
    if (typeof window === "undefined") return "";

    return (
      new URLSearchParams(window.location.search)
        .get("invitation")
        ?.trim() ?? ""
    );
  }

  function invitedEmailFromUrl(): string {
    if (typeof window === "undefined") return "";

    return (
      new URLSearchParams(window.location.search)
        .get("email")
        ?.trim()
        .toLowerCase() ?? ""
    );
  }
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail =
      email.trim().toLowerCase() || invitedEmailFromUrl();
    const invitationToken = invitationTokenFromUrl();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setStatus("error");
      setMessage(t("invalidEmail"));
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_KORA_API_URL;

    if (!apiBase) {
      setStatus("error");
      setMessage(t("apiUnavailable"));
      return;
    }

    setStatus("loading");
    setMessage("");

    let response: Response;

    try {
      response = await fetch(`${apiBase}/v1/auth/email-otp/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: normalizedEmail,
        }),
      });
    } catch {
      setStatus("error");
      setMessage(t("networkError"));
      return;
    }

    const payload = await readResponseBody(response);

    if (!response.ok) {
      setStatus("error");
      setMessage(errorMessage(response.status, payload));
      return;
    }

    const challengeId = (payload as OtpRequestResponse | null)?.data
      ?.challengeId;

    if (!challengeId) {
      setStatus("error");
      setMessage(t("unexpected"));
      return;
    }

    const params = new URLSearchParams({
      challengeId,
      email: normalizedEmail,
      mode,
    });

    if (mode === "signup" && journey) {
      params.set("journey", journey);
    }

    if (invitationToken) {
      params.set("invitation", invitationToken);
    }

    router.push(`/${locale}/verify?${params.toString()}`);
  }

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
          <span>
            {mode === "signin" ? t("welcomeBack") : t("getStarted")}
          </span>

          <h1>
            {mode === "signin"
              ? t("signInTitle")
              : journey === "customer"
                ? t("customerTitle")
                : t("businessTitle")}
          </h1>

          <p>
            {mode === "signin"
              ? t("signInBody")
              : journey === "customer"
                ? t("customerBody")
                : t("businessBody")}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">{t("email")}</label>

          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={status === "loading"}
            required
          />

          {status === "error" && (
            <div className="auth-error">{message}</div>
          )}

          <button
            type="submit"
            className="auth-primary-button"
            disabled={status === "loading"}
          >
            {status === "loading"
              ? t("sending")
              : t("continueEmail")}
          </button>
        </form>

        {mode === "signup" && onBack && (
          <button
            type="button"
            className="auth-back-button"
            onClick={onBack}
            disabled={status === "loading"}
          >
            {t("chooseDifferent")}
          </button>
        )}

        <div className="auth-switch">
          {mode === "signin" ? (
            <>
              {t("newToKora")} {" "}
              <Link
                href={
                  invitationTokenFromUrl()
                    ? `/${locale}/get-started?invitation=${encodeURIComponent(invitationTokenFromUrl())}&email=${encodeURIComponent(email.trim().toLowerCase() || invitedEmailFromUrl())}`
                    : `/${locale}/get-started`
                }
              >
                {t("createAccount")}
              </Link>
            </>
          ) : (
            <>
              {t("alreadyUse")} {" "}
              <Link
                href={
                  invitationTokenFromUrl()
                    ? `/${locale}/login?invitation=${encodeURIComponent(invitationTokenFromUrl())}&email=${encodeURIComponent(email.trim().toLowerCase() || invitedEmailFromUrl())}`
                    : `/${locale}/login`
                }
              >
                {t("signIn")}
              </Link>
            </>
          )}
        </div>

        <div className="auth-security">
          <span>●</span>
          {t("secure")}
        </div>
      </section>
    </main>
  );
}
