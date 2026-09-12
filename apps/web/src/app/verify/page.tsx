"use client";

import { FormEvent, Suspense, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  saveKoraSession,
  type KoraSession,
} from "@/lib/auth/session";
import { errorMessage, readResponseBody } from "@/lib/api/kora-api";
import { resolveWorkspaceEntry } from "@/lib/workspace/entry";
import { workspaceEntryRedirectPathForJourney } from "@/lib/workspace/routing";
import { createSingleFlightGuard } from "@/lib/utils/single-flight";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("Auth");
  const localize = (path: string) => `/${locale}${path}`;

  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const challengeId = searchParams.get("challengeId") ?? "";
  const mode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const journey =
    searchParams.get("journey") === "customer" ? "customer" : "business";
  const invitationToken = searchParams.get("invitation")?.trim() ?? "";

  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const verifyGuard = useRef(createSingleFlightGuard());

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (verifyGuard.current.isInFlight) return;
    await verifyGuard.current.run(() => submitVerify());
  }

  async function submitVerify() {
    if (!challengeId) {
      setStatus("error");
      setMessage(t("verificationExpired"));
      return;
    }

    if (code.length < 4 || code.length > 10) {
      setStatus("error");
      setMessage(t("verificationCodeRequired"));
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
      response = await fetch(`${apiBase}/v1/auth/email-otp/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          challengeId,
          code,
          deviceLabel: "Kora Web",
        }),
      });
    } catch {
      setStatus("error");
      setMessage(
        t("networkError"),
      );
      return;
    }

    const payload = await readResponseBody(response);

    if (!response.ok) {
      setStatus("error");
      setMessage(errorMessage(response.status, payload));
      return;
    }

    const session = (payload as { data?: KoraSession } | null)?.data;

    if (!session?.accessToken) {
      setStatus("error");
      setMessage(t("unexpected"));
      return;
    }

    saveKoraSession(session);

    if (invitationToken) {
      router.replace(localize(`/invite/${encodeURIComponent(invitationToken)}`));
      return;
    }

    // Both sign-in and sign-up must resolve the account's current workspace
    // state before choosing a destination. Signup mode is not evidence that
    // this is a new account: an existing owner may have entered through
    // `/get-started`.
    const entry = await resolveWorkspaceEntry();
    const redirectPath = workspaceEntryRedirectPathForJourney(
      entry.state,
      mode === "signup" ? journey : "business",
    );
    router.replace(localize(redirectPath ?? "/app"));
  }

  if (!email || !challengeId) {
    return (
      <main className="auth-page">
        <section className="auth-card">
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

          <div className="auth-heading">
            <span>{t("verifyEmail")}</span>
            <h1>{t("requestNewCodeTitle")}</h1>
            <p>
              {t("missingVerificationData")}
            </p>
          </div>

          <Link
            href={mode === "signup" ? localize("/get-started") : localize("/login")}
            className="auth-primary-link"
          >
            {t("requestNewCode")}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card verify-card">
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

        <div className="auth-heading">
          <span>{t("verifyEmail")}</span>
          <h1>{t("enterVerificationCode")}</h1>
          <p>
            {t("codeSentTo", { email })}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleVerify}>
          <label htmlFor="code">{t("verificationCode")}</label>

          <input
            id="code"
            className="otp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            placeholder="000000"
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 10))
            }
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
              ? t("verifying")
              : t("verifyContinue")}
          </button>
        </form>

        <Link
          href={mode === "signup" ? localize("/get-started") : localize("/login")}
          className="auth-back-link"
        >
          {t("differentEmail")}
        </Link>
      </section>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-page">
          <section className="auth-card">
            <div className="auth-heading">
              <span>KORA OS</span>
              <h1>Loading verification...</h1>
            </div>
          </section>
        </main>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
