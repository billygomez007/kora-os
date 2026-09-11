# Kora OS Email OTP Production Setup — Resend and koraafric.com

Kora OS is passwordless: every sign-in is a one-time code sent by email
(docs/SECURITY.md section 6). This guide connects that existing flow to
a real production email provider, [Resend](https://resend.com), for the
official domain:

- Official domain: `koraafric.com`
- Verified sending domain: `koraafric.com`
- Sender identity: `Kora OS <login@koraafric.com>`
- Production API: `api.koraafric.com`
- Production web application: `koraafric.com`

**Resend is an email-delivery provider only.** It sends the message;
it never becomes part of Kora's identity or authorization model. The
code, its expiry, its one-time consumption, rate limiting, and every
other security property described in docs/SECURITY.md section 6 are
unchanged — see "What this stage did not change" below.

This document has four kinds of steps, clearly labelled, because they
happen in different places and some cannot be done yet:

- 🤖 **Done in this repository** — already complete; nothing further to do.
- 🌐 **Resend dashboard** — the user does this at resend.com.
- 🧭 **DNS dashboard** — the user does this wherever `koraafric.com`'s DNS
  is managed.
- 🚀 **Requires production hosting** — configure the existing Railway API
  service with the variables below.

Nothing in this list requires pasting a real Resend API key into Claude
Code, a chat message, a commit, or any file in this repository.

## 1. What this stage prepared 🤖

The backend's email delivery goes through provider-neutral sender ports.
Production uses a small HTTPS adapter for Resend's `/emails` endpoint;
development may continue using the local Mailpit SMTP adapter. OTP and
staff invitation messages share the same Resend transport, while keeping
their existing templates and security behavior.

Resend HTTPS behavior:

- `RESEND_API_KEY` is read server-side and sent only as a Bearer token.
- `OTP_FROM_EMAIL` and `INVITATION_FROM_EMAIL` are passed as the verified
  sender identities.
- Requests use HTTPS with a bounded timeout and no response body logging.
- SMTP remains available for local Mailpit and backward compatibility.

Genuine gaps closed (small, tested changes — see the code and test
files for detail, and the final report for exact commits):

- The email content was rewritten (plain text and a new HTML
  alternative) to be Kora-branded and match the required content: the
  Kora OS name, the code, a message that it signs the user into Kora
  OS, a warning not to share it, a note that it's safe to ignore if
  unexpected, and no marketing content, fake support link, or password
  language. No external image or stylesheet is needed to read it, and
  there is no tracking pixel or link of any kind.
- The expiry wording ("This code expires in N minutes") is now built
  from the exact same `OTP_EXPIRY_MINUTES` configuration value that
  controls actual OTP validity, passed through explicitly rather than
  reconstructed — the email can never claim a different expiry period
  than the one the server actually enforces.
- The legacy SMTP adapter retains explicit connection, greeting, and socket
  timeouts for local development.
  bounded timeouts, so a slow or unreachable mail server can never leave
  a sign-in request hanging.
- Resend requests use an explicit bounded timeout, so a slow or unreachable
  provider cannot leave a sign-in request hanging.
- `.env.example` (repository root) now documents the Resend
  configuration as a commented-out production example, with a real
  placeholder-shaped (never real) API key value, alongside the existing
  working local Mailpit defaults, which are unchanged.

## 2. What this stage did not change

Every security property in docs/SECURITY.md section 6 is exactly as it
was: generic anti-enumeration responses, cryptographically random codes,
the HMAC-SHA256 digest keyed by the required `OTP_PEPPER`, expiry,
attempt-limit lockout, email/IP rate limiting, the resend cooldown,
old-challenge invalidation, atomic one-time consumption, rotating
refresh tokens, session revocation, audit events, verified-email
behavior, and workspace routing. Resend changes only how the message
reaches the recipient's inbox.

Production still fails closed exactly as before if email delivery is
unconfigured or fails: `EmailOtpSender` throws, the request returns the
same generic `503 EMAIL_DELIVERY_UNAVAILABLE`, and the challenge is
invalidated rather than left active and guessable
(`apps/api/test/email-otp-delivery-failure.e2e-spec.ts`).

## 3. Create or sign into Resend 🌐

1. Go to resend.com and create an account (or sign in) using a real
   Kora-controlled email address — not a shared or personal one.
2. Enable two-factor authentication on the Resend account itself. It
   will hold the ability to send email as `koraafric.com`.

## 4. Confirm `koraafric.com` as a verified sending domain 🌐

1. In the Resend dashboard, confirm that the existing `koraafric.com`
   domain shows **Verified**. Do not substitute an unverified subdomain.
2. If Resend displays DNS records, they must be applied exactly as shown (typically SPF via a `TXT`
   record, one or more DKIM `CNAME` or `TXT` records, and a `TXT` record
   for domain verification). **Copy these exact values from the
   dashboard.** Nobody — including Claude Code — should invent, guess,
   or reuse example DKIM/SPF/verification values from any other domain
   or provider; Resend generates domain-specific keys, and copying the
   wrong ones will silently fail to authenticate mail.

## 5. Add those exact DNS records at the domain's DNS provider 🧭

1. Open the DNS management dashboard for whichever provider hosts
   `koraafric.com`'s DNS (registrar or a separate DNS host — Cloudflare,
   Route 53, etc.).
2. Add each record Resend displayed, exactly as shown, scoped to
   `koraafric.com` (follow Resend's own field-by-field instructions for
   your specific DNS provider).
3. Do not add MX records for `koraafric.com` unless Resend's setup
   instructions specifically call for one — a sending-only authentication
   subdomain does not need to receive mail. If Resend's instructions do
   show an MX record, add exactly that one, exactly as shown.
4. Leave existing records for `koraafric.com`, `app.koraafric.com`, and
   `api.koraafric.com` untouched — this stage only concerns the verified
   `koraafric.com` sending domain.

## 6. Wait for Resend to report the domain as verified 🌐

DNS propagation can take anywhere from a few minutes to (rarely) 48
hours. Refresh the domain's status in the Resend dashboard until it
shows **Verified** — do not proceed to live sending before this, and do
not assume verification succeeded without the dashboard confirming it.

## 7. Create a sending-only Resend API key 🌐

1. In Resend, create a new API key scoped to **sending only** (not full
   account access), ideally restricted to the `koraafric.com`
   domain if Resend's key-scoping supports per-domain restriction.
2. Name it clearly, e.g. `kora-os-production-auth-send`.
3. Copy the key **once** — Resend shows it only at creation time. Do not
   paste it into a chat message, a commit, a `.env` file that gets
   committed, or any log. It goes directly into the next step.

## 8. Store the API key in the hosting provider's secret manager 🚀

This step requires the production hosting environment to exist, which
this stage does not create (see "Stop boundary" below).

Store the Resend API key as `RESEND_API_KEY` in the provider's secret
manager — never in a
committed file, a Docker image layer, or a CI log. Inject it into the
running process as an environment variable at deploy time.

## 9. Configure the Resend HTTPS environment variables 🚀

Once hosted, set these environment variables on the production API
process (see `.env.example` for the full annotated block):

```text
EMAIL_DELIVERY_MODE=resend
RESEND_API_KEY=<the Resend API key, from the secret manager>
OTP_FROM_EMAIL="Kora OS <login@koraafric.com>"
INVITATION_FROM_EMAIL="Kora OS Invitations <invite@koraafric.com>"
KORA_WEB_URL=https://koraafric.com
```

Leaving `EMAIL_DELIVERY_MODE` unset in any environment (including
production) is always valid — the API starts, but every OTP request
fails closed with the same `503` rather than pretending to send
(`apps/api/src/modules/auth/email-otp/unconfigured-email-otp-sender.ts`).
Setting a value other than `smtp` or `resend` fails startup validation immediately.

## 10. Sender identity 🚀

`OTP_FROM_EMAIL="Kora OS <login@koraafric.com>"` is the authentication
sender shown above, and `INVITATION_FROM_EMAIL` is the invitation sender.
Do not send authentication
email from any other address once this is live, including the bare
`koraafric.com` apex or a personal/shared inbox.

## 11. Disable open and click tracking for authentication email 🌐

In the Resend dashboard, for the `koraafric.com` domain (or at the
account level if Resend does not offer per-domain tracking controls),
turn **off** open tracking and click tracking. An authentication email
contains no links to click and no reason to be pixel-tracked; tracking
adds no value here and needlessly expands what a compromised or
subpoenaed provider account could reveal about sign-in patterns.

## 12. Test delivery to Gmail, Outlook, and iCloud 🚀

**Blocked in this stage** — see "Live delivery boundary" below. Once
hosted with real credentials, request a real OTP against a Gmail,
Outlook, and iCloud address you control, and confirm:

- The email arrives in the inbox, not spam, at each provider.
- The subject, sender name, and body render as expected.
- No image or link is broken (there are none by design).

Never record a real OTP code from this test in a commit, log, ticket,
or screenshot — treat it exactly like a password.

## 13. Confirm SPF, DKIM, and DMARC pass by inspecting headers 🚀

For a real test message received at a provider you control, view the
message's original/raw source (Gmail: "Show original"; Outlook: "View
message source"; iCloud: via an IMAP client or the raw `.eml`) and
confirm:

- `Authentication-Results` shows `spf=pass`, `dkim=pass`.
- If a DMARC policy is already published for `koraafric.com`, confirm
  `dmarc=pass` too.

## 14. DMARC rollout 🧭

If `koraafric.com` does not yet publish a DMARC record, start
permissive:

```text
_dmarc.koraafric.com  TXT  "v=DMARC1; p=none; rua=mailto:<an address you control>"
```

`p=none` only monitors and reports — it never blocks mail. After
confirming every legitimate sender for the domain (Resend included)
passes alignment in the aggregate reports for a reasonable period, move
the policy toward `p=quarantine` and eventually `p=reject`. Do this
gradually and only after confirming no legitimate mail flow would be
rejected — a policy tightened too early can silently block real mail
from other legitimate senders on the domain.

## 15. If the API key is ever exposed 🌐

Revoke it immediately in the Resend dashboard and issue a new one. Then
update the secret in the hosting provider's secret manager (step 8) and
redeploy. Treat any real API key that reached a chat log, a committed
file, a public repository, a CI log, or a support ticket as compromised
the moment it is seen there, regardless of whether misuse is confirmed.

## 16. Monitor delivery 🚀 / 🌐

Once live, watch the Resend dashboard's activity/events view for
failed, delayed, bounced, and complained messages for
`koraafric.com`. A rising bounce or complaint rate is worth
investigating immediately — both because it affects real users signing
in, and because sustained high bounce/complaint rates can damage the
domain's sending reputation with mailbox providers.

## 17. "Accepted" is not "delivered"

Resend returning a successful HTTPS response means Resend accepted the message
for delivery — it does not mean the recipient's mailbox provider
accepted it, or that the recipient saw it. Spam filtering, greylisting,
and provider-side rejection can all happen after Resend's acceptance.
Use the Resend dashboard's own delivery-status events (not just the HTTPS
response) to know whether a message actually reached the
recipient's provider.

## Live delivery boundary

Real external email delivery to Gmail, Outlook, or iCloud was **not**
attempted in this stage, and is explicitly blocked until all of the
following are true:

- `koraafric.com` is verified in Resend (step 6).
- A real Resend API key is stored in production secret management and
  the SMTP environment variables are configured on a real, hosted API
  process (steps 8–9).
- A specific test recipient address has been explicitly authorized by
  the user for this test.
- The test can be run without the OTP code appearing in any log or
  committed file.

The production API is hosted on Railway, so the remaining live-delivery
check is operational: verify the Railway variables below, request one OTP
to an explicitly authorized test address, and inspect Resend delivery
events and message headers. Do not record the OTP in logs, tickets, or
committed files.

## Remaining external steps (outside this repository)

- Confirm `koraafric.com` is verified in the Resend account.
- Add the exact DNS records Resend displays, at the DNS provider for
  `koraafric.com`.
- Wait for Resend's verification to complete.
- Create the sending-only API key.
- Configure the Railway secret manager and environment variables on the
  production API service.
- Disable tracking in Resend for `koraafric.com`.
- Run the live Gmail/Outlook/iCloud delivery test and header inspection.
- Decide on and roll out the DMARC policy progression.
