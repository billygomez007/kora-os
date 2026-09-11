# Kora OS Cloudflare WAF and Rate-Limit Plan

These rules are conservative starting points. Deploy in Log or Managed
Challenge mode first, observe legitimate traffic, then block only after a
review. Cloudflare rules are not a replacement for API authorization.

## WAF scope

Protect the API host and these path groups:

- `/v1/auth/*`;
- `/v1/platform/*`;
- `/v1/organizations/*`;
- `/v1/public/*`;
- `/v1/q/*`.

Keep `/v1/health` available to Railway/Vercel monitoring. Use Cloudflare's
managed rules for generic injection and exploit signatures. Do not write a
blanket country, ASN, user-agent, or method block without an incident-backed
reason.

## Suggested outer limits

Tune these against Cloudflare analytics and the API's own limits:

| Request | Initial action |
| --- | --- |
| `POST /v1/auth/email-otp/request` | 5 requests / 10 minutes / IP, Managed Challenge |
| `POST /v1/auth/email-otp/verify` | 10 requests / 10 minutes / IP, Managed Challenge |
| `POST /v1/auth/refresh` | 30 requests / 10 minutes / IP, Managed Challenge |
| public marketplace search | 120 requests / minute / IP, Managed Challenge |
| public booking endpoints | 30 requests / 10 minutes / IP, Managed Challenge |
| QR resolution | 120 requests / minute / IP, Managed Challenge |

Do not rate-limit all authenticated workspace traffic as one global bucket.
Keep application-level throttles, OTP attempt limits, and email/IP limits
enabled.

## Caching rules

Create an explicit bypass for `/v1/*`, requests with `Authorization`, and
requests carrying Kora session cookies. Never cache auth, organization,
payment, transaction, report, staff, customer, appointment, session,
subscription, or private marketplace responses. Cache only immutable Next.js
assets and reviewed public static images.

## Turnstile and bots

Turnstile is not implemented in this change because it requires a site key,
server secret, frontend UX, and API verification tests. The future flow is:
browser Turnstile token → API server-side validation → OTP request. The secret
must remain server-only as `TURNSTILE_SECRET_KEY`; the site key may be
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

Use Bot Management conservatively on OTP, discovery, booking, and QR routes.
Do not challenge ordinary marketing pages or verified workspace users without
an observed abuse signal.
