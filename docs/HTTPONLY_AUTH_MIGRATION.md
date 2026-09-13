# Kora browser authentication migration

## Current state

The web application currently stores access and refresh tokens in browser `localStorage`. This is compatible with the existing web and Android clients, but an XSS issue could expose a refresh token and extend a session until rotation, expiry, or revocation.

The first additive server foundation is now implemented, but the web client has
not been cut over: localStorage access/refresh storage and the legacy JSON/body
refresh contract remain active.

## SEC-03A additive foundation

The API recognizes an explicit `X-Kora-Client: web` header. It does not infer
browser transport from user-agent strings. For that opt-in transport only, OTP
verification and refresh issue a `__Host-kora_refresh` cookie, and logout/
logout-all clear it. The API requires an exact allowlisted `Origin` for these
browser-cookie operations; mobile and legacy body transport do not require that
browser-only Origin check.

During this compatibility phase the response still contains the existing
`refreshToken` field because the current web client and Android client have not
yet migrated. No frontend cutover, localStorage removal, or database change is
part of SEC-03A.

## SEC-03B0.2 browser safety primitives

`POST /v1/auth/browser-logout` is the browser-only logout contract. It is
unauthenticated by bearer token, but requires `X-Kora-Client: web` and an
exactly allowlisted `Origin`. The API hashes the `__Host-kora_refresh` cookie
server-side, revokes the resolved session family without rotating or
classifying the token as reuse, and always clears the cookie. Missing,
expired, unknown, and already-revoked cookies therefore have the same success
behavior; rejected origins or transport markers do not clear a cookie.

Refresh rotation now claims the source `RefreshToken` with a conditional
database update (`usedAt IS NULL AND revokedAt IS NULL`) inside the existing
Prisma transaction. PostgreSQL row-update serialization makes this
authoritative across API replicas: one concurrent request can create the
replacement, while a loser is treated as reuse and revokes the whole session
family with `REUSE_DETECTED`. This preserves the existing sequential replay
protection. The future cookie-first web client must coordinate refreshes across
tabs (for example with Web Locks/BroadcastChannel) before enabling this
contract, because a losing concurrent request intentionally revokes the family.

Refresh also checks `Session.expiresAt` before issuing any replacement. An
expired session revokes its family with `EXPIRED` and returns the same generic
authentication error used for other invalid sessions.

Response redaction is opt-in only: a future browser client must send both
`X-Kora-Client: web` and `X-Kora-Auth-Mode: cookie-v1` to omit `refreshToken`
from OTP/refresh JSON responses. The current web client sends neither the
mode marker nor cookie credentials and therefore keeps the legacy response and
`localStorage` behavior unchanged in this slice. Android/body responses are
unchanged.

## Recommended architecture

Use architecture A: keep the refresh token in a host-only, `HttpOnly` cookie and keep short-lived access tokens in memory.

- The API at `https://api.koraafric.com` sets a `__Host-kora_refresh` cookie. It is `Secure`, uses `Path=/`, and omits `Domain`, so it is not exposed to the marketing site or another subdomain.
- The web app at `https://koraafric.com` calls the API with `credentials: "include"`; the API allowlist remains the two approved web origins and `Access-Control-Allow-Credentials: true`.
- The refresh response returns a short-lived access token to memory only. A full page reload obtains a new access token by calling `/v1/auth/refresh` with the cookie.
- Refresh tokens remain rotated and hashed server-side. Existing session-family reuse detection, logout, logout-all, expiry, and revocation rules remain authoritative.
- Authentication material must never appear in locale URLs, invitation URLs, query strings, analytics payloads, or translated page state.

Architecture B (a full cookie session) would make every state-changing request CSRF-sensitive and couple all clients to browser cookie semantics. Architecture A limits the cookie to refresh and preserves the existing bearer authorization model for API requests.

## Cookie and CSRF policy

Use `Secure`, `HttpOnly`, `Path=/`, and `SameSite=Lax` for the refresh cookie. The web and API are same-site subdomains, so this supports normal Kora navigation while excluding ordinary cross-site requests. Do not use a broad `.koraafric.com` domain unless a future requirement proves it necessary.

Because SameSite is defense in depth rather than a complete CSRF boundary, the API should also require an allowed `Origin` for credentialed state-changing browser requests, reject unexpected `Origin`/`Referer` combinations, add a synchronizer or double-submit CSRF token for cookie-authenticated mutations, and retain idempotency keys on retryable financial and onboarding mutations.

Android/mobile clients should continue using an explicit bearer refresh flow, or receive a separately scoped mobile refresh mechanism. They must not depend on the browser cookie.

## Endpoint migration sequence

1. Add a browser-only refresh-cookie contract while retaining the current bearer refresh contract for mobile compatibility.
2. Update web login/OTP verification to receive an access token in memory and set the refresh cookie server-side.
3. Update the web API client to refresh with `credentials: "include"`, clear in-memory state on `401`, and never persist tokens.
4. Update logout and logout-all to revoke the session family and clear the cookie with matching `Path` and attributes.
5. Keep server-side permission, tenant, branch, Super Admin, Cashier, and Provider checks unchanged; token transport must never become an authorization decision.
6. After telemetry confirms browser clients no longer send stored refresh tokens, remove web `localStorage` token reads/writes. Keep the mobile bearer path until Android migrates separately.

## Locale, roles, and expiry behavior

Locale redirects (`/en`, `/fr`) must preserve only the intended pathname and query string. They must never carry authentication material. Expired access tokens should trigger one refresh attempt; a failed refresh clears in-memory state and returns the user to the localized login route. Super Admin, Cashier, Provider, tenant, and branch authorization continues to be evaluated on every API request after authentication.

## Operational rollout

Test login, OTP verification, refresh rotation, concurrent refreshes, logout, logout-all, revoked sessions, expired sessions, invitation acceptance, localized redirects, and Android bearer authentication in staging. During SEC-03A, confirm the browser cookie is issued and the compatibility `refreshToken` JSON field remains present; after the web cutover, confirm that field is removed for browser responses. Cookies must remain absent from JavaScript, and CORS must reject unapproved origins.
