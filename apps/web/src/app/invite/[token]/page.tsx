"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getKoraSession,
} from "@/lib/auth/session";
import {
  errorMessage,
  readResponseBody,
} from "@/lib/api/kora-api";

interface InvitationDetails {
  organizationName: string;
  roleName: string;
  branchName: string | null;
  status: string;
  expiresAt: string;
  isExpired: boolean;
}

interface ApiEnvelope<T> {
  data?: T;
}

export default function StaffInvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";
  const apiBase = process.env.NEXT_PUBLIC_KORA_API_URL;

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "accepting" | "accepted" | "error"
  >("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadInvitation() {
      if (!apiBase || !token) {
        setStatus("error");
        setMessage("This invitation link is not valid.");
        return;
      }

      try {
        const response = await fetch(
          `${apiBase}/v1/staff-invitations/${encodeURIComponent(token)}`,
          {
            headers: { Accept: "application/json" },
          },
        );

        const body = await readResponseBody(response);

        if (!response.ok) {
          if (!cancelled) {
            setStatus("error");
            setMessage(
              response.status === 404
                ? "This invitation is invalid, expired, revoked, or no longer available."
                : errorMessage(response.status, body),
            );
          }
          return;
        }

        const details = (body as ApiEnvelope<InvitationDetails> | null)?.data;

        if (!details) {
          if (!cancelled) {
            setStatus("error");
            setMessage("Kora could not read this invitation.");
          }
          return;
        }

        if (!cancelled) {
          setInvitation(details);

          if (details.isExpired) {
            setStatus("error");
            setMessage("This invitation has expired. Ask the business to send a new invitation.");
          } else {
            setStatus("ready");
          }
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Kora could not load this invitation. Check your connection and try again.");
        }
      }
    }

    void loadInvitation();

    return () => {
      cancelled = true;
    };
  }, [apiBase, token]);

  async function acceptInvitation() {
    if (!apiBase || !token || !invitation) return;

    const session = getKoraSession();

    if (!session?.accessToken) {
      router.push(
        `/login?invitation=${encodeURIComponent(token)}`,
      );
      return;
    }

    setStatus("accepting");
    setMessage("");

    try {
      const response = await fetch(
        `${apiBase}/v1/staff-invitations/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
        },
      );

      const body = await readResponseBody(response);

      if (response.status === 401) {
        router.push(`/login?invitation=${encodeURIComponent(token)}`);
        return;
      }

      if (!response.ok) {
        setStatus("error");
        setMessage(
          response.status === 403
            ? "Sign in with the same email address that received this invitation."
            : errorMessage(response.status, body),
        );
        return;
      }

      const accepted = (
        body as ApiEnvelope<{
          organizationId?: string;
          membership?: { organizationId?: string };
        }> | null
      )?.data;

      const organizationId =
        accepted?.organizationId ?? accepted?.membership?.organizationId;

      if (organizationId) {
        localStorage.setItem("kora.active.organizationId", organizationId);
      }

      setStatus("accepted");
      setMessage(
        `You have joined ${invitation.organizationName}. Opening your workspace…`,
      );

      window.setTimeout(() => {
        router.replace("/app");
      }, 900);
    } catch {
      setStatus("error");
      setMessage("Kora could not accept the invitation. Check your connection and try again.");
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      <section className="auth-card invite-card">
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

        {status === "loading" ? (
          <div className="auth-heading">
            <span>STAFF INVITATION</span>
            <h1>Opening your invitation…</h1>
            <p>Kora is securely checking this invitation.</p>
          </div>
        ) : invitation ? (
          <>
            <div className="auth-heading">
              <span>YOU&apos;RE INVITED</span>
              <h1>Join {invitation.organizationName} on Kora.</h1>
              <p>
                Accept this invitation to join the business workspace and start
                working with your team.
              </p>
            </div>

            <div className="invite-summary">
              <div>
                <span>Business</span>
                <strong>{invitation.organizationName}</strong>
              </div>

              <div>
                <span>Your role</span>
                <strong>{invitation.roleName}</strong>
              </div>

              {invitation.branchName && (
                <div>
                  <span>Branch</span>
                  <strong>{invitation.branchName}</strong>
                </div>
              )}
            </div>

            {message && (
              <div
                className={
                  status === "accepted" ? "invite-success" : "auth-error"
                }
              >
                {message}
              </div>
            )}

            {status !== "accepted" && (
              <button
                type="button"
                className="auth-primary-button"
                disabled={status === "accepting" || invitation.isExpired}
                onClick={() => void acceptInvitation()}
              >
                {status === "accepting"
                  ? "Joining workspace..."
                  : getKoraSession()?.accessToken
                    ? `Accept and join ${invitation.organizationName}`
                    : "Sign in to accept invitation"}
              </button>
            )}

            {!getKoraSession()?.accessToken && status !== "accepted" && (
              <p className="invite-security-note">
                Use the same email address that received this invitation.
                Kora will verify it securely before you can join.
              </p>
            )}
          </>
        ) : (
          <div className="auth-heading">
            <span>STAFF INVITATION</span>
            <h1>We couldn&apos;t open this invitation.</h1>
            <p>{message || "The invitation is no longer available."}</p>

            <Link href="/login" className="auth-primary-link">
              Go to Kora sign in
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
