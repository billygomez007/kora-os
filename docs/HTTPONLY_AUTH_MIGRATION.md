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

## SEC-03B1 compatibility hydration and in-memory access state

The web client now has a module-level in-memory auth store as the source of
truth for access-token reads during the compatibility period. The store starts
in an `UNKNOWN` state, hydrates once from the existing `kora.auth.session`
localStorage record, and then exposes `AUTHENTICATED`, `UNAUTHENTICATED`, or
`RETRYABLE_ERROR` states to the workspace bootstrap gate. Workspace routes do
not run protected access checks while authentication is still unknown,
preventing a first-render race from redirecting a valid session to login.

Hydration is generation-aware. Login, logout, refresh, and cross-tab
invalidation advance or validate a generation so a late refresh or hydration
result cannot restore a session after the user has logged out or a newer auth
transition has completed. Access tokens are mirrored into memory before the
legacy localStorage record is written; refresh-token body transport remains
unchanged for compatibility with the current API and Android client.

Cross-tab coordination is invalidation-only. `BroadcastChannel` is preferred
with a storage-event fallback, and messages contain only an invalidation type
and an ephemeral source identifier. No access token, refresh token, or session
payload is broadcast. The channel is best effort and never blocks logout.

This is an additive SEC-03B1 foundation, not the cookie-first migration. The
web client still reads and writes the legacy localStorage session and still
uses the existing body refresh contract. No reauthentication is required for
existing users, no API files or database schema change, and Android remains on
its bearer-token flow. A later, separately reviewed cutover may activate the
SEC-03A browser refresh-cookie contract and then remove the web localStorage
token dependency.

## SEC-03B2A recovery and refresh-coordination foundation

`POST /v1/auth/browser-access-token` is a dormant browser-only recovery
contract. It requires `X-Kora-Client: web`, an exact allowlisted `Origin`, and
the `__Host-kora_refresh` HttpOnly cookie. It validates the current token and
session without marking the refresh token used, rotating it, extending its
expiry, or changing the token family. It checks token/session expiry,
revocation, and active user status, then returns only the normal short-lived
access token and safe user/session metadata. Responses use `Cache-Control:
no-store`, are rate-limited at 30 requests per minute per throttler key, and
successful recoveries create a safe audit event without credentials. Rejected
requests log only a category and request ID; cookie, access-token, OTP, and
authorization values are never logged. The repository's current throttler
storage is process-local; it is a useful backstop but is not a distributed
multi-replica quota. A distributed limiter remains an operational follow-up
before broad B2B rollout.

The endpoint exists for a future cookie-first browser client to recover after a
rotating refresh response is lost. Presenting the replacement cookie to this
endpoint does not perform a second rotation, so response-loss recovery cannot
trigger refresh-token reuse detection. The current B1 web client does not call
this endpoint.

The web foundation extends the existing invalidation-only auth channel with
metadata-only `refresh-start`, `refresh-complete`, and `refresh-failed`
signals. Signals may carry only a source, generation, version, and status; no
access token, refresh token, cookie, OTP, email, or user payload is accepted or
forwarded. A dormant coordinator uses the `kora-auth-refresh` Web Lock when
available. The lock holder may run the future rotating refresh; waiting tabs do
not rotate blindly and instead use the non-rotating recovery callback after a
completion signal or bounded timeout. Browsers without Web Locks use recovery
only and fail closed rather than pretending BroadcastChannel is a mutex or
creating an unbounded localStorage lock. B2B remains inactive, and B2C
reauthentication/localStorage removal remains inactive.

### SEC-03B2A.1 coordination hardening

Every refresh lifecycle signal is scoped to the authentication generation that
started the operation. The coordinator ignores missing or malformed generation,
version, and status metadata, as well as `refresh-start`, `refresh-complete`, or
`refresh-failed` signals from an older or future generation. Version ordering is
strictly monotonic within a generation, so delayed, duplicate, and out-of-order
signals cannot wake a newer waiter. Logout or a newer login advances the store
generation; a waiter then exits with a stale-generation error and cannot commit
recovered access state.

The recovery contract is covered by tests for exact and normalized browser
markers, missing/malformed/unapproved origins, 30-per-minute throttling, trusted
proxy behavior, concurrent recovery requests, and both response-loss cases. A
lost response body is recoverable with the replacement cookie; a lost
`Set-Cookie` header causes the old cookie to be denied without family revocation,
after which the user must reauthenticate or use the still-valid replacement
cookie. The current web client remains on the B1 compatibility path: cookie-first
OTP, refresh, bootstrap, and browser-logout cutover are all off.

The full API E2E suite runs with serialized files and unique test ports. The
appointment race test creates its OTP fixture users serially before issuing the
concurrent booking requests, avoiding unrelated local PostgreSQL setup
contention. This is test-harness isolation only; appointment and reporting
production logic is unchanged.

Throttling remains process-local and is acceptable only while this recovery
endpoint is dormant. A shared/distributed limiter is a prerequisite for B2B
activation; the smallest likely follow-up is Redis-backed Nest throttler
storage (optionally reinforced at the Cloudflare edge). No infrastructure is
provisioned by this slice.

## SEC-03 prerequisite hardening slice

This slice fixes defects the prior completion review found in the B2A/B2A.1
foundation and lays additional groundwork, without activating any of the
cookie-first behavior above. Cookie-first OTP, refresh, bootstrap, and the
browser logout web cutover all remain off.

### Distributed throttling

The recovery endpoint's "30 requests per minute" policy (and the shared
`AUTH_THROTTLE` on OTP/refresh) was backed only by @nestjs/throttler's
built-in in-memory `ThrottlerStorageService` — per API process, not shared
across replicas. A `RedisThrottlerStorage` (`apps/api/src/modules/throttler/`)
now implements the same fixed-window-plus-block algorithm atomically in a
single Redis Lua `EVAL`, keyed by a sha256 hash of the guard's own tracker
key (never a raw IP, token, or credential). `config/environment.ts` requires
`THROTTLER_REDIS_URL` to be set in production and refuses to boot without
it — there is no silent fallback to the permissive in-memory storage in
production. Outside production (no Redis available), the built-in in-memory
storage is used, which is the existing, accepted, testable-locally
behavior. If the Redis command itself fails at request time (an outage, not
a missing-configuration case), the storage fails OPEN and logs a safe
(no-secret) warning rather than blocking login/OTP/refresh for every user
during a transient blip — an explicit, documented trade-off, not a silent
one. No Redis/Valkey instance is provisioned by this slice; provisioning one
and setting `THROTTLER_REDIS_URL` is a required deployment blocker before
this branch reaches production (the app will not start without it).

### Cross-tab lifecycle vs. invalidation signals

`refresh-start`/`refresh-complete`/`refresh-failed` and genuine invalidation
signals (`logout`/`session-invalidated`/`auth-generation-changed`) shared one
undiscriminating dispatch path: every listener registered via
`startAuthChannel` received every message type. The bootstrap module's
cross-tab handler ignored its message argument entirely and unconditionally
cleared auth on any signal, so a leader tab's refresh broadcast logged out
every other tab mid-refresh. `lib/auth/channel.ts` now exports
`isAuthInvalidationSignal`, and the bootstrap handler checks it before
clearing anything; lifecycle signals are inert there. The refresh
coordinator's own listener already filtered by type/generation/version
correctly and is unchanged.

### Stale refresh failure vs. a newer login

`refreshKoraSession()`'s three failure branches (missing refresh token, a
401 from `/v1/auth/refresh`, a malformed success body) cleared the shared
auth store unconditionally, without checking whether the generation
captured when the attempt began was still current. A request that started
refreshing before a newer, independent login completed elsewhere in the tab
could — once its own now-obsolete network response arrived — destroy that
newer session. Each failure branch, and the retried-request 401 branch in
`koraApi()`, now checks `isCurrentGeneration()` first and, if stale, throws
the same non-destructive "the session changed while it was being refreshed"
error the existing success path already used, instead of clearing.

### Cookie mutation ordering

Reviewing OTP/refresh/logout cookie mutation ordering found one real
asymmetry: `browser-logout` clears the `__Host-kora_refresh` cookie in a
`finally` block (so it clears even if the server-side revoke throws), but
`logout` and `logout-all` only cleared it after a successful revoke — a
thrown revoke left a stale cookie the client believed was already cleared.
Both now clear in `finally` as well, matching `browser-logout`. The
`kora-auth-refresh` Web Lock foundation and non-rotating recovery fallback
from SEC-03B2A.1 already cover the leader/waiter, lost-response, two-tab,
and sleeping-tab cases described in the migration sequence above; no
further activation happens here.

### Canonical authenticated origin — documented blocker, not implemented

CORS currently allows both `https://koraafric.com` and
`https://www.koraafric.com`, and nothing redirects one to the other; the web
app has no `middleware.ts`/`proxy.ts` host logic beyond locale handling.
Web Locks, BroadcastChannel, and localStorage are all origin-scoped, so a
user split across both hosts cannot be coordinated by any of the
SEC-03B2A.1/B2A.1 primitives above — this is a real prerequisite gap for
B2B.

This slice does **not** add an application-level apex→www redirect, even
though `proxy.ts` could technically implement one. The reason: any redirect
that changes a browser's effective origin — whether enforced at Cloudflare
or inside this app — strands that browser's existing origin-scoped
`localStorage` session (the legacy `kora.auth.session` key lives on whichever
host the user happened to authenticate from). That is a one-time,
self-healing cost (the user simply signs in again on the canonical host),
but it is a live, immediate, production-visible behavior change for every
current apex visitor, which is out of proportion for a slice whose other
changes are all either dormant-code-path fixes or additive/dev-only
configuration. It also cannot be "fully justified and covered by tests" in
the way this slice's other changes are, since the affected population (real
users currently on the bare apex, if any) is not something this review can
observe from the repository alone.

**Required infrastructure action before B2B**: pick one canonical
authenticated web origin (`https://www.koraafric.com`, matching the existing
`metadataBase`/sitemap/robots convention) and enforce it with a redirect
from the apex, either as a Cloudflare redirect rule (no app deploy required)
or as application-level middleware in `proxy.ts` (a same-host-preserving,
production-only, exact-hostname-matched 308 redirect, run before the
existing locale logic) — implement whichever the operator prefers, timed
deliberately rather than folded into an unrelated hardening deploy, and
treat the resulting one-time re-authentication for any existing apex-origin
sessions as expected. Do not enable cookie-first bootstrap until one origin
is enforced this way.

### Protected entry-point inventory

Workspace routes (`app/app/*`, gated by `WorkspaceShell` reading
`useAuthSnapshot`/`workspaceAuthGate`), business onboarding
(`app/onboarding`), customer onboarding (`app/customer-onboarding`),
invitation acceptance (`app/invite/[token]`), and platform admin
(`app/super-admin`) were inventoried and none read a refresh token or the
raw legacy session storage key directly — all access goes through
`lib/auth/session.ts`/`lib/auth/store.ts`. A regression test
(`tests/protected-entry-points.test.ts`) statically guards this invariant so
a future change cannot reintroduce a direct read without failing a test.
Cookie bootstrap remains off; this is inventory and a guard rail, not a
behavior change.

### Analytics privacy hardening

GA4's `gtag.js` attaches `page_location`/`page_referrer` from
`document.location`/`document.referrer` to every hit, including explicit
`event()` calls, regardless of automatic page-view collection being
disabled. `/verify` and `/onboarding` can carry `email`, challenge/OTP, and
invitation-token query parameters; the centralized `trackEvent()` helper
(`lib/analytics.ts`) now always supplies its own sanitized, query-stripped
`page_location` and an empty `page_referrer` on every event it sends,
overriding gtag's default rather than relying on it — closing the one place
those values could otherwise reach Google Analytics unsanitized. `page_view`
semantics, the events sent, and consent behavior are all unchanged; no
historical leak is claimed, only a latent gap in the explicit-event path.

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
