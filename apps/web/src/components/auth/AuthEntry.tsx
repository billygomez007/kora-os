"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage, readResponseBody } from "@/lib/api/kora-api";

type AuthMode = "signin" | "signup";

interface OtpRequestResponse {
  data?: {
    challengeId?: string;
    expiresAt?: string;
  };
}

export default function AuthEntry({ mode }: { mode: AuthMode }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setStatus("error");
      setMessage("Enter a valid email address.");
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_KORA_API_URL;

    if (!apiBase) {
      setStatus("error");
      setMessage("Kora web authentication is not connected to the API.");
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
      setMessage(
        "Kora could not reach the API. Check your connection and try again.",
      );
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
      setMessage(
        "Kora sent an unexpected response. Please try again.",
      );
      return;
    }

    const params = new URLSearchParams({
      challengeId,
      email: normalizedEmail,
      mode,
    });

    router.push(`/verify?${params.toString()}`);
  }

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      <section className="auth-card">
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

        <div className="auth-heading">
          <span>
            {mode === "signin" ? "WELCOME BACK" : "GET STARTED WITH KORA"}
          </span>

          <h1>
            {mode === "signin"
              ? "Sign in to your Kora workspace."
              : "Start running your business with Kora."}
          </h1>

          <p>
            {mode === "signin"
              ? "Enter your email and we’ll send you a secure verification code. No password required."
              : "Create your Kora account with your email. We’ll send you a secure verification code to continue."}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>

          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@business.com"
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
              ? "Sending code..."
              : "Continue with email"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "signin" ? (
            <>
              New to Kora?{" "}
              <Link href="/get-started">Create an account</Link>
            </>
          ) : (
            <>
              Already use Kora? <Link href="/login">Sign in</Link>
            </>
          )}
        </div>

        <div className="auth-security">
          <span>●</span>
          Secure passwordless authentication
        </div>
      </section>
    </main>
  );
}
