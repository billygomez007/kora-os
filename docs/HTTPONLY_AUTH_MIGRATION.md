# Kora browser authentication migration

## Current state

The web application currently stores access and refresh tokens in browser `localStorage`. This is compatible with the existing web and Android clients, but an XSS issue could expose a refresh token and extend a session until rotation, expiry, or revocation.

This document is a migration design only. It does not change runtime authentication.

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

Test login, OTP verification, refresh rotation, concurrent refreshes, logout, logout-all, revoked sessions, expired sessions, invitation acceptance, localized redirects, and Android bearer authentication in staging. Confirm the API emits no refresh token in JSON for the browser flow, cookies are absent from JavaScript, and CORS rejects unapproved origins before production rollout.
