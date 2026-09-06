# Kora OS Email OTP Production Setup — Resend and koraafric.com

Kora OS is passwordless: every sign-in is a one-time code sent by email
(docs/SECURITY.md section 6). This guide connects that existing flow to
a real production email provider, [Resend](https://resend.com), for the
official domain:

- Official domain: `koraafric.com`
- Authentication sending domain: `auth.koraafric.com`
- Sender identity: `Kora OS <login@auth.koraafric.com>`
- Future API domain: `api.koraafric.com` (not yet hosted)
- Future web application: `app.koraafric.com` (does not exist yet)

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
- 🚀 **Requires production hosting** — cannot be done until the Kora API
  is actually deployed somewhere with real environment variables.

Nothing in this list requires pasting a real Resend API key into Claude
Code, a chat message, a commit, or any file in this repository.

## 1. What this stage prepared 🤖

The backend's email delivery already goes through one provider-neutral
port (`EmailOtpSender`, docs/ARCHITECTURE.md section 6) with a real SMTP
implementation (`SmtpEmailOtpSender`, using `nodemailer`) behind it —
the same adapter that already delivers to the local Mailpit container in
development. Resend's SMTP endpoint is a drop-in configuration for that
same adapter; no second authentication system or duplicate email
infrastructure was introduced.

Confirmed compatible as-is, with no rewrite:

- **Host/port/TLS**: `SmtpEmailOtpSender` passes `SMTP_HOST`, `SMTP_PORT`,
  and `SMTP_SECURE` straight through to `nodemailer`. `secure: true` on
  port 465 gives implicit TLS from the first byte (Resend's recommended
  configuration); `secure: false` on port 587 leaves nodemailer's default
  opportunistic STARTTLS in place, which Resend's server always offers.
  Certificate validation is never disabled in either case.
- **Authentication**: `SMTP_USER`/`SMTP_PASSWORD` map directly to
  Resend's required `resend` / `<API key>` SMTP credentials.
- **Sender identity**: `EMAIL_FROM` already accepts a combined
  `"Name <address>"` string, so `EMAIL_FROM="Kora OS <login@auth.koraafric.com>"`
  works with no code change.

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
- The SMTP connection, greeting, and socket phases now have explicit,
  bounded timeouts, so a slow or unreachable mail server can never leave
  a sign-in request hanging.
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
   will hold the ability to send email as `auth.koraafric.com`.

## 4. Add `auth.koraafric.com` as a sending domain 🌐

1. In the Resend dashboard, add a new domain: `auth.koraafric.com` —
   the authentication *subdomain*, not the bare `koraafric.com` apex.
   Using a dedicated subdomain keeps authentication email deliverability
   and reputation separate from any future marketing or transactional
   mail sent from `koraafric.com` or other subdomains.
2. Resend will display a set of DNS records (typically SPF via a `TXT`
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
   `auth.koraafric.com` (the DNS provider's UI usually wants only the
   subdomain label, e.g. `resend._domainkey.auth`, not the full FQDN —
   follow Resend's own field-by-field instructions for your specific DNS
   provider).
3. Do not add MX records for `auth.koraafric.com` unless Resend's setup
   instructions specifically call for one — a sending-only authentication
   subdomain does not need to receive mail. If Resend's instructions do
   show an MX record, add exactly that one, exactly as shown.
4. Leave existing records for `koraafric.com`, `app.koraafric.com`, and
   `api.koraafric.com` untouched — this stage only concerns
   `auth.koraafric.com`.

## 6. Wait for Resend to report the domain as verified 🌐

DNS propagation can take anywhere from a few minutes to (rarely) 48
hours. Refresh the domain's status in the Resend dashboard until it
shows **Verified** — do not proceed to live sending before this, and do
not assume verification succeeded without the dashboard confirming it.

## 7. Create a sending-only Resend API key 🌐

1. In Resend, create a new API key scoped to **sending only** (not full
   account access), ideally restricted to the `auth.koraafric.com`
   domain if Resend's key-scoping supports per-domain restriction.
2. Name it clearly, e.g. `kora-os-production-auth-send`.
3. Copy the key **once** — Resend shows it only at creation time. Do not
   paste it into a chat message, a commit, a `.env` file that gets
   committed, or any log. It goes directly into the next step.

## 8. Store the API key in the hosting provider's secret manager 🚀

This step requires the production hosting environment to exist, which
this stage does not create (see "Stop boundary" below).

When production hosting is chosen, store the Resend API key as a secret
(e.g. `SMTP_PASSWORD`) in that provider's secret manager — never in a
committed file, a Docker image layer, or a CI log. Inject it into the
running process as an environment variable at deploy time.

## 9. Configure the existing SMTP environment variables 🚀

Once hosted, set these environment variables on the production API
process (see `.env.example` for the full annotated block):

```text
EMAIL_DELIVERY_MODE=smtp
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=<the Resend API key, from the secret manager>
EMAIL_FROM="Kora OS <login@auth.koraafric.com>"
```

Port 465 with implicit TLS is recommended because the connection is
encrypted from the first byte, with no window where a network
intermediary could see an unencrypted STARTTLS negotiation. If outbound
465 is blocked in the chosen hosting environment, the alternative is:

```text
SMTP_PORT=587
SMTP_SECURE=false
```

Leaving `EMAIL_DELIVERY_MODE` unset in any environment (including
production) is always valid — the API starts, but every OTP request
fails closed with the same `503` rather than pretending to send
(`apps/api/src/modules/auth/email-otp/unconfigured-email-otp-sender.ts`).
Setting a value other than `smtp` fails startup validation immediately.

## 10. Sender identity 🚀

`EMAIL_FROM="Kora OS <login@auth.koraafric.com>"` is already the value
shown above — no separate configuration step. Do not send authentication
email from any other address once this is live, including the bare
`koraafric.com` apex or a personal/shared inbox.

## 11. Disable open and click tracking for authentication email 🌐

In the Resend dashboard, for the `auth.koraafric.com` domain (or at the
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
- If a DMARC policy is already published for `koraafric.com` or
  `auth.koraafric.com`, confirm `dmarc=pass` too.

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
`auth.koraafric.com`. A rising bounce or complaint rate is worth
investigating immediately — both because it affects real users signing
in, and because sustained high bounce/complaint rates can damage the
domain's sending reputation with mailbox providers.

## 17. "Accepted" is not "delivered"

Resend returning success over SMTP means Resend accepted the message
for delivery — it does not mean the recipient's mailbox provider
accepted it, or that the recipient saw it. Spam filtering, greylisting,
and provider-side rejection can all happen after Resend's acceptance.
Use the Resend dashboard's own delivery-status events (not just the SMTP
`250 OK` response) to know whether a message actually reached the
recipient's provider.

## Live delivery boundary

Real external email delivery to Gmail, Outlook, or iCloud was **not**
attempted in this stage, and is explicitly blocked until all of the
following are true:

- `auth.koraafric.com` is verified in Resend (step 6).
- A real Resend API key is stored in production secret management and
  the SMTP environment variables are configured on a real, hosted API
  process (steps 8–9).
- A specific test recipient address has been explicitly authorized by
  the user for this test.
- The test can be run without the OTP code appearing in any log or
  committed file.

None of these are met yet — there is no production hosting for the Kora
API at all. Real Gmail/Outlook/iCloud delivery is **blocked, not
completed**, pending the user's own Resend account creation, DNS
changes, and a hosting decision, none of which this stage performs (see
the stop boundary in the task specification this document was written
for).

## Remaining external steps (outside this repository)

- Create/sign into the Resend account and add `auth.koraafric.com`.
- Add the exact DNS records Resend displays, at the DNS provider for
  `koraafric.com`.
- Wait for Resend's verification to complete.
- Create the sending-only API key.
- Choose and provision production hosting for the Kora API (a separate,
  later stage — not performed here).
- Configure the secret manager and environment variables on that
  hosting.
- Disable tracking in Resend for `auth.koraafric.com`.
- Run the live Gmail/Outlook/iCloud delivery test and header inspection.
- Decide on and roll out the DMARC policy progression.
