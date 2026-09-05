# Kora OS Security Model

Status: Foundation baseline

## 1. Security objective

Kora stores business operations, customer contact information, staff records, and financial activity. The security model must preserve confidentiality, integrity, availability, tenant isolation, and reliable attribution of important actions.

Security is enforced by the backend and database boundaries. Mobile interface visibility is a usability feature, not an authorization control.

## 2. Verification baselines

Kora uses these external baselines during design, implementation, and release verification:

- OWASP Application Security Verification Standard 5.0.0 for backend and API controls.
- OWASP Mobile Application Security Verification Standard for mobile storage, cryptography, authentication, network, platform, code, resilience, and privacy controls.
- Android platform security guidance for secure storage, permissions, networking, and application configuration.

Using a baseline does not constitute certification. Release evidence must map implemented and tested controls to the applicable requirements.

## 3. Protected assets

- User identities, authentication factors, sessions, and recovery mechanisms.
- Organization membership, roles, permissions, and branch assignments.
- Customer names, contact details, notes, and history.
- Appointments, queue entries, service records, and staff performance.
- Transactions, payments, refunds, commissions, receipts, and reconciliation.
- Subscription, billing, and provider references.
- Audit events, operational logs, backups, and exported data.
- Signing keys, API secrets, encryption keys, webhook secrets, and provider credentials.

## 4. Trust boundaries

- Mobile device to Kora API.
- Kora API to PostgreSQL, Redis, object storage, and workers.
- Kora workers to push, SMS, WhatsApp, email, payment, and billing providers.
- Platform administrator to production control plane.
- Public booking or invitation links to protected business resources.

All data crossing a trust boundary is authenticated where appropriate, validated, bounded, and logged safely.

## 5. Primary threats

- Cross-organization data access.
- Privilege escalation within an organization.
- Stolen or replayed sessions.
- Account enumeration and automated login abuse.
- Forged invitations, OTP challenges, or billing webhooks.
- Duplicate or altered financial commands.
- Unauthorized changes to service prices, commissions, or reconciliation.
- Sensitive data exposure through logs, backups, notifications, or local storage.
- Compromised mobile devices and tampered application packages.
- Dependency, CI/CD, signing-key, or administrator compromise.
- Denial of service against authentication, booking, or operational APIs.

## 6. Authentication

Kora OS uses passwordless email OTP authentication for customers,
owners, managers and staff. Kora does not store or support user
passwords — there is no password field anywhere in the schema, no
password hashing, and no password-reset flow; a locked-out user simply
requests a new code the same way they always sign in.

- A user signs in by entering an email address, receiving a one-time
  code by email, and entering that code. The same request/verify pair is
  both sign-up and sign-in — there is no separate password-style
  registration flow, and completing it always leaves the email verified
  (a successful OTP verification is proof of control over the address).
- A one-time code is at least six digits, generated with a
  cryptographically secure random generator (`crypto.randomInt`, not
  `Math.random`), and stored only as a keyed digest —
  HMAC-SHA256(`OTP_PEPPER`, challenge id + normalized email + code) —
  never in plaintext, in any table, log, or response.
- A code is short-lived (`OTP_EXPIRY_MINUTES`, default 10), single-use
  (verification and consumption are one atomic database update, so
  concurrent verification requests can never both succeed with the same
  code), and locks after a bounded number of wrong attempts
  (`OTP_MAX_ATTEMPTS`, default 5) — after which even the correct code is
  rejected.
- Requesting a new code invalidates whatever code is still active for
  that email, but the ability to request a code at all is independently
  rate-limited by both normalized email (a resend cooldown, plus a
  per-hour cap, `OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR`) and by request IP
  (`OTP_MAX_REQUESTS_PER_IP_PER_HOUR`) — a resend can never be used to
  reset an account's accumulated failed-attempt or request-rate limits
  for free, since obtaining a fresh challenge at all is itself bounded.
- Comparing a submitted code against its stored digest uses a
  constant-time comparison (`crypto.timingSafeEqual`).
- Authentication responses do not reveal whether a specific email
  already has an account: `POST /auth/email-otp/request` returns the
  identical response shape either way, and a request/delivery failure is
  reported distinctly from "check your email" rather than folded into
  the same generic response (a genuine infrastructure problem is not an
  account-existence signal, so it is safe, and more useful, to surface
  separately).
- `OTP_PEPPER` must be an explicit, strong value in production — the
  same policy `JWT_ACCESS_SECRET` and `REFRESH_TOKEN_PEPPER` already
  follow (docs/API_SPEC.md, `.env.example`).
- High-risk account changes and owner/platform-administrator actions
  eventually need step-up verification beyond a single OTP — see the
  passkey/device-bound roadmap note at the end of this section.

Email delivery itself goes through a provider-neutral `EmailOtpSender`
port (docs/ARCHITECTURE.md section 6), and no code is ever written to
application logs, a container's stdout/stderr, or any other log
destination by any sender — there is no "logging is fine as long as
it's not the app's own logger" exception. Tests inject an in-memory fake
that captures a code only inside the test process. Development and
production share the same real implementation, an SMTP sender
(nodemailer, with its `logger`/`debug` transport options — which would
otherwise print the raw SMTP conversation, code included — explicitly
off): development points it at a local, credential-free Mailpit
container (`infrastructure/compose.yaml`, `pnpm db:up`; inspect
delivered codes at `http://127.0.0.1:8025`, never enabled in
production) via `EMAIL_DELIVERY_MODE=smtp`; production has no real
provider connected yet, so it runs with delivery unconfigured and fails
closed (a `503`) rather than silently pretending a code was sent — see
docs/ROADMAP.md for where a real provider integration lands. A failed
delivery also invalidates the challenge it belongs to immediately, the
same as a resend would, so an undelivered code is never left active and
guessable for its full TTL.

Email OTP is Kora's chosen initial authentication method, but it is not
phishing-resistant — a sufficiently well-crafted lookalike site can
still relay a code an attacker requests through it. Passwordless
passkeys or another device-bound authentication method are a security
roadmap item for a later phase, targeted specifically at sensitive
financial and owner-administration actions rather than replacing email
OTP for ordinary sign-in. Passwords are not planned as a fallback for
any of this — if email OTP proves insufficient for a given action, the
next step is a stronger passwordless method, not a weaker password one.

## 7. Sessions

- Access tokens are short-lived and audience-bound.
- Refresh tokens are random, rotated after use, stored only as hashes on the server, and revocable per device.
- Refresh-token reuse revokes the affected token family and creates a security event.
- Logout revokes the current session; logout-all revokes all user sessions.
- Suspension or removal of a membership immediately prevents new tenant-scoped authorization.
- Sensitive mobile credentials use operating-system protected storage and never Room, logs, analytics, or plain preferences.
- Server clocks determine token and authorization validity.

All of the above except the mobile-storage line (no Android client
consumes this API yet) is implemented as described. Concretely: an
access token is a JWT carrying only a user ID and session ID (`sub`,
`sid`) — no role, permission, or other mutable authorization claim ever
goes into a token, so a permission change takes effect on a caller's very
next request rather than waiting for their token to expire. A refresh
token is a `crypto.randomBytes(32)` value; the server stores only its
SHA-256 hash (a fast hash is appropriate here — the token is already
high-entropy and unguessable, unlike a password, so a slow memory-hard
hashing function would add latency without adding security; see
docs/DATA_MODEL.md's `refresh_tokens` entry). Every refresh marks the presented token `used`
and issues a new one for the same session; presenting an already-used or
already-revoked token revokes that whole session — not just the reused
token — which is the "security event" this document originally
anticipated (implemented as an `audit_events` row, action
`auth.refresh_reuse_detected`, rather than a separate table). Revocation
is checked on every authenticated request (the session behind an access
token's `sid` claim must still be present and not revoked), not only
when a refresh is attempted, so a revoked session is denied immediately
rather than merely failing to renew.

## 8. Tenant isolation

- Every tenant-owned resource contains `organization_id`.
- The active organization must match an active membership for the authenticated user.
- Client-supplied organization and branch identifiers are selectors, never proof of permission.
- Repositories require organization scope for tenant-owned queries.
- Resource fetches verify tenant ownership before returning or mutating data.
- Cross-tenant resource references are rejected before business logic executes.
- Composite database constraints reinforce same-tenant relationships where practical.
- Background jobs, cache keys, object-storage keys, and realtime topics include tenant scope.
- Automated tests attempt cross-tenant reads, writes, references, exports, and subscriptions.

Implemented via TenantContextService (resolves an active membership,
its union of role permissions, its branch assignments, and the
organization's subscription access mode fresh from the database on
every call — nothing here is cached or trusted from a token) and
TenantAccessGuard (applies that resolution per route: membership denies
access to any organization the caller does not belong to; a missing
required permission or an out-of-scope branch — an explicit
`BranchAssignment`, or the broad `branches.manage` permission — denies
the request; `BLOCKED` subscription access denies everything and
`READ_ONLY` denies mutating requests unless a route opts in). An
`X-Kora-Organization-Id` header or `:organizationId` route param is
read only as a *selector*; TenantAccessGuard still re-resolves real
membership before granting anything, so naming an organization the
caller does not belong to is rejected with `403`. See section 29 for the
one deliberate, curated exception to this isolation: public business
discovery.

## 9. Authorization

Authorization evaluates identity, active membership, role-derived permissions, branch scope, subscription access mode, entitlement, resource relationship, and resource state.

Rules include:

- Default deny when no explicit permission grants access.
- Multiple roles produce a union of allowed permissions, subject to branch and resource constraints.
- A cashier cannot change commission rules merely because the mobile interface exposes financial screens.
- A provider can answer only assigned payment verifications unless granted a management permission.
- Owners cannot bypass platform-level controls such as subscription integrity or audit immutability.
- Platform support access is separate from organization roles and is time-bounded and audited.

Permission decisions are covered by policy unit tests and endpoint integration tests.

## 10. Subscription enforcement

- Subscription state and entitlements are calculated by the backend.
- Mobile clients cannot set their own plan, entitlement, trial end, billing period, or access mode.
- Limit checks execute inside the same transaction as branch or staff creation where concurrency could exceed limits.
- Past-due and expired organizations retain controlled access according to the documented access mode.
- Billing webhook signatures are verified before processing.
- Provider events are deduplicated and reconciled against internal subscription history.
- Billing payloads and credentials are restricted and retained only as long as required.

## 11. API protection

- Production APIs require TLS and reject unencrypted access.
- Request bodies, query parameters, headers, file uploads, and identifiers are validated against explicit schemas.
- Unknown fields are rejected for sensitive commands.
- Request sizes, collection limits, date ranges, and file sizes are bounded.
- Database queries use parameterized access through the selected data layer.
- Errors return stable safe codes and request IDs without stack traces or database details.
- CORS, if a future browser surface uses the API, is an explicit allowlist and is not an authentication mechanism.
- Rate limits are stricter for authentication, public booking, invitations, exports, payments, refunds, and webhooks.

## 12. Financial integrity

- Money uses integer minor units and explicit currency codes, with explicit overflow validation against the ceiling of a 32-bit column before any value is written (`assertSafeMoneyAmount`, `apps/api/src/common/money/`).
- Server code calculates checkout totals, adjustments, commissions, and reported figures; expected cash-reconciliation values remain a future phase. Client-submitted totals are never trusted as authoritative.
- Recording a payment requires a stable `Idempotency-Key`; Checkout creation accepts the same guarantee for free from a database-level unique constraint instead (see section 33).
- The server fingerprints idempotent requests and rejects key reuse with different content (`IDEMPOTENCY_CONFLICT`).
- Financial state changes use database transactions, validated state machines, optimistic concurrency, a `SELECT ... FOR UPDATE` row lock on the parent Checkout, and audit events — see section 33 for the full implementation.
- A Checkout may be voided before settlement; a posted Transaction is immutable and cannot yet be reversed, refunded, or adjusted — those are explicitly deferred to a later phase, alongside cash-session reconciliation and payouts.
- Commission finalization requires a POSTED Transaction — never a merely-recorded or disputed payment claim — mirroring the same separation-of-duties principle section 33 establishes for payment confirmation; see section 34 for the full commission/receipt/reporting implementation.
- Uncertain network results are resolved by querying the original command or transaction before any retry with a new key.

## 13. Android application security

- The release application is signed only through controlled release infrastructure.
- The existing Google Play application ID and signing continuity are protected.
- Debug signing, debug logging, test endpoints, seed data, and inspection features are excluded from release builds.
- Exported Android components are minimized and explicitly declared.
- Deep links validate scheme, host, path, purpose, token, and authenticated state.
- Runtime permissions are requested only when a user action requires them.
- Sensitive screenshots are restricted on selected authentication and financial surfaces when justified by usability testing.
- Clipboard use for sensitive information is avoided.
- WebView is not introduced for core application behavior; any future use receives a dedicated threat review.
- Backup and data-extraction rules exclude authentication and sensitive local data.

## 14. Mobile local data

- Room stores only the minimum data needed for responsive and offline workflows.
- Authentication credentials and encryption keys are never stored in Room.
- Sensitive cached fields are encrypted when the threat model requires it.
- Cache rows retain organization ownership and are cleared on logout, membership removal, or organization access loss.
- Switching organizations cannot display data from the previously active organization.
- Local pending commands contain no provider secrets and expose safe retry status.
- Local financial commands are enabled only after replay, conflict, and recovery tests pass.

## 15. Network security

- All production endpoints use modern TLS configuration and valid certificates.
- Cleartext Android network traffic is disabled for release builds.
- Development exceptions are isolated to debug configuration.
- Certificate pinning is introduced only with a tested rotation and recovery strategy.
- Timeouts, retry policies, and backoff are explicit.
- Non-idempotent financial commands are never automatically retried with a new idempotency key.

## 16. Backend and database security

- API and worker processes use separate least-privilege runtime identities where practical.
- Production databases are not publicly exposed.
- Database users receive only required permissions.
- Schema migration privileges are separate from normal runtime privileges.
- Application access to audit events does not include update or delete permissions.
- Redis is private, authenticated, encrypted where supported, and contains no durable source-of-truth financial state.
- Object storage is private by default; downloads use short-lived authorized access.
- Secrets come from managed secret storage and are rotated.
- Development, staging, and production use separate credentials and data.

## 17. Encryption and key management

- Data is encrypted in transit and through managed storage encryption at rest.
- Particularly sensitive provider tokens or payloads receive application-level protection when needed.
- Keys are versioned and rotation procedures are tested.
- Encryption keys are not stored beside encrypted production data in source control or mobile builds.
- Backup encryption and restoration access follow the same control standard as production data.

## 18. Notifications and external providers

- Notification content is minimized; lock-screen messages do not expose unnecessary financial or customer detail.
- Provider adapters receive only the information required for delivery.
- Delivery callbacks and webhooks are authenticated and deduplicated.
- Failed delivery does not roll back valid business or financial state.
- Phone numbers and email addresses are normalized and authorized before use.
- Provider outages use bounded retries and dead-letter handling.

## 19. Audit and diagnostic logging

Audit events contain actor, tenant, optional branch, action, entity, request ID, safe state metadata, source, and time. They are append-only from application code.

Logs and audit metadata never contain:

- Plaintext OTP codes (Kora has no passwords or password hashes to leak — see section 6).
- Access, refresh, or invitation tokens.
- Full payment credentials or provider secrets.
- Private encryption keys.
- Unnecessary customer notes or message content.

Access to audit history is permission-controlled. Export and administrator access create additional audit events.

## 20. Privacy and lifecycle

- Kora collects only information required for documented business purposes.
- Access and retention are purpose-limited.
- Customer and staff data export requires explicit authorization.
- Account-deletion workflows distinguish identity deletion, organization ownership transfer, personal-data anonymization, and legally required financial retention.
- Production retention periods are documented before launch.
- Analytics and crash reporting exclude sensitive business and customer values by default.

## 21. Administrative security

- Platform administration uses separate privileged identities and strong authentication.
- Privileged actions require explicit reasons and produce immutable audit events.
- Support impersonation is disabled by default; if later introduced, it is consented, time-limited, visibly indicated, and audited.
- Production access follows least privilege and periodic access review.
- Emergency access is controlled, monitored, and reviewed after use.

## 22. Supply chain and CI/CD

- Dependencies and build plugins are version-controlled and scanned.
- Pull requests run formatting, compilation, unit tests, integration tests, secret scanning, and dependency checks.
- Protected branches require successful checks before release integration.
- CI receives narrowly scoped short-lived credentials where supported.
- Release artifacts are traceable to a reviewed commit.
- Signing keys and production secrets are never printed in build logs.
- Dependency updates are tested rather than accepted blindly.

## 23. Backups and recovery

- PostgreSQL uses encrypted automated backups and point-in-time recovery where supported.
- Restore tests are performed on a schedule using a non-production target.
- Recovery objectives are defined before production launch.
- Object-storage and configuration recovery are included in disaster-recovery plans.
- Audit and subscription history are included in backup verification.

## 24. Security testing gates

Before production launch, tests must cover:

- Cross-tenant access for every sensitive resource type.
- Missing, expired, revoked, and replayed authentication credentials.
- Role and branch-scope denial paths.
- Subscription and entitlement bypass attempts.
- Duplicate payment and refund commands.
- Invalid financial state transitions and stale versions.
- Forged and replayed billing or notification webhooks.
- Injection, mass assignment, malformed input, and excessive payloads.
- Sensitive-data leakage in responses, logs, notifications, backups, and mobile storage.
- Android exported components, deep links, backup rules, and release configuration.

An independent penetration test is required before meaningful production financial volume.

## 25. Incident response

- Security events have severity, owner, evidence, containment, recovery, and review procedures.
- Suspected token compromise supports immediate session and credential revocation.
- Tenant exposure investigation uses request IDs, audit events, and infrastructure logs.
- Evidence access is restricted and recorded.
- Required user, partner, regulator, or authority notification is determined with qualified legal and security guidance.
- Every material incident produces remediation actions and regression tests.

## 26. Release security checklist

- No secrets or production credentials in Git history or mobile artifacts.
- Release build disables debug behavior and cleartext traffic.
- Authentication and recovery abuse controls pass.
- Tenant-isolation and permission test suites pass.
- Idempotency and financial transition tests pass.
- Subscription enforcement tests pass.
- Database migrations and rollback or forward-fix procedure are reviewed.
- Backup restoration is verified.
- Logs and notifications are checked for sensitive values.
- Dependency and artifact scans have no unaccepted critical findings.
- Privacy policy, deletion process, support path, and incident contacts are current.

## 27. Risk acceptance

Security controls are not silently skipped. Any temporary exception records its owner, reason, affected assets, compensating controls, expiration date, and remediation task. Financial integrity and tenant-isolation controls cannot be waived for production convenience.

## 28. References

- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP MASVS: https://mas.owasp.org/MASVS/
- Android Security: https://developer.android.com/security

## 29. Public discovery and business visibility

Public business discovery (`docs/API_SPEC.md` section 29) is the one
deliberate, narrow exception to section 8's tenant isolation: it is
designed to expose a curated subset of organization data to anyone,
authenticated or not. The control here is not "deny by default" as with
every other tenant-scoped read — it is a strict allowlist of exactly
which fields and which rows are reachable, enforced structurally:

- `PublicBusinessProfileVisibility` governs discoverability, not
  authentication: `PRIVATE` never appears in discovery regardless of
  publication state; `LINK_ONLY` is resolvable only by exact slug (never
  by search) — "having the link" is the access control, not an account;
  `PUBLIC` is the only visibility that appears in general search. All
  three still require `published_at` to be set — a business controls
  when it goes live independently of its visibility choice.
- The discovery read path (`DiscoveryService`) only ever selects
  `PublicBusinessProfile`'s own columns and a `Branch`'s public-only
  columns (`latitude`, `longitude`, `public_phone`, `public_email`,
  `opening_hours_note`, gated by `is_discoverable`) — never
  `organizations`' internal fields, `organization_subscriptions`, `roles`
  /`membership_roles`, `staff_profiles`, `audit_events`, or
  `customer_records`. There is no query path from a discovery endpoint
  into any of those tables, so this is enforced by what the service can
  reach, not only by what it happens to select.
- A business's operational contact details (`branches.phone`/`email`)
  are separate columns from its public ones
  (`branches.public_phone`/`public_email`); publishing a profile never
  exposes the former.
- No rating, review, or "distance" value is fabricated. A "near" search
  filters against an approximate bounding box and never ranks or labels
  results by computed distance (docs/DATA_MODEL.md's
  `public_business_profiles` entry) — a plausible-looking but inexact
  number is a worse trust signal than none at all.
- Publishing a profile is authorization-gated the normal way
  (`business_profile.manage`, owner/manager by default) and validated:
  a profile cannot be published with zero discoverable branches, so a
  customer can never land on a published business with nowhere to
  actually go.

## 30. Service catalogue, availability, and appointment booking

**Kora remains passwordless.** Nothing in this phase's work introduces a
credential of any kind — a customer books using the same email-OTP
session as everywhere else in the product (section 6); there is no
booking-specific password, PIN, or guest-checkout secret.

**Appointment is not a `ServiceSession`, a `Payment`, or a
`Transaction`.** None of those concepts exist in the schema yet. A
`CONFIRMED` appointment is a reservation, nothing more — it is never
treated as evidence that work happened or that revenue was earned. Its
status can only become `CANCELLED` or `NO_SHOW`; there is deliberately
no `COMPLETED` value, because completion is a claim only a future
`ServiceSession` can substantiate. A cancelled or no-show appointment
must never become verified revenue, and nothing in this phase computes
revenue from an appointment at all.

**Prices and durations are server-authoritative.** A booking request
(customer or staff-assisted) carries only a business slug, branch,
ordered service IDs, an optional specific provider, and a requested
start time — never a price, a duration, or an end time. Every price and
duration is resolved server-side from `Service`, any `BranchService`
branch-level override, and (for duration only) any staff-specific
override on `StaffServiceAssignment`; a client value for any of these,
even if somehow supplied, is never read.

**Appointment history uses snapshots.** `AppointmentItem` stores its own
`service_name_snapshot`/`duration_minutes_snapshot`/
`price_minor_snapshot`/`currency_snapshot` at booking time. Archiving or
editing a `Service` afterward never rewrites a past appointment's
record — verified directly (`test/service-catalogue.e2e-spec.ts`: a
booked appointment's item snapshot is unchanged after the underlying
service's name, price, and duration are all edited).

**Availability results are advisory; booking creation is the
authoritative atomic reservation.** `AvailabilityEngineService`
(docs/ARCHITECTURE.md section 6) computes a snapshot of currently
bookable slots from current catalogue, schedule, and appointment state —
nothing about calling it reserves anything, and its result can be stale
by the time a booking request arrives. `AppointmentBookingService` never
trusts a prior availability read: it re-resolves eligibility and
provider selection, then relies on the database itself — not
application-level re-checking — as the final word on whether a specific
slot is actually free.

**Double-booking prevention is database enforced.** A PostgreSQL
`EXCLUDE` constraint (`appointments_no_staff_double_booking`, requiring
the `btree_gist` extension for a GiST equality operator class on the
assigned staff member's `uuid` column, combined with `tstzrange` overlap
on the *occupied* UTC window — service time plus branch buffers) rejects
a genuinely conflicting insert or update at the database level,
regardless of what the application layer believed was free. `[)` range
bounds mean two exactly back-to-back appointments are adjacent, not
overlapping, and both are allowed; cancelled appointments are excluded
from the constraint entirely (it applies only to `CONFIRMED` rows) and
so never block a slot. Two simultaneous identical booking requests are
proven to resolve to exactly one success
(`test/appointment-booking.e2e-spec.ts`: 6 concurrent requests for the
same provider and time, exactly 1 succeeds, the other 5 receive a
generic `409 SLOT_UNAVAILABLE` — the underlying PostgreSQL exclusion-
violation SQLSTATE and constraint name are never included in the
response; see `isExclusionConstraintViolation` in
`apps/api/src/common/database/postgres-constraint-error.util.ts`).
Rescheduling reuses the same constraint inside the same transaction as
the move itself, so a failed reschedule always leaves the original
appointment completely unchanged — there is no separate
revalidate-then-write step for a race to land between.

A client-generated idempotency key (`AppointmentIdempotencyKey`, scoped
to the authenticated customer, never accepted as a bare identifier from
an unauthenticated caller) makes a retried or duplicated booking request
return the original appointment rather than create a second one;
reusing a key with a materially different request is rejected as a
conflict rather than silently honored either way.

**Branch-local schedules are converted to UTC**, always server-side and
always through the branch's own `time_zone` (an IANA identifier,
format-validated via `Intl.DateTimeFormat` at organization creation —
`Africa/Accra` is the safe default for existing Ghana development
branches, not a platform-wide assumption). `BranchBusinessHours`,
`StaffAvailabilityRule`, and schedule-exception local times are plain
`"HH:mm"` wall-clock strings with no timezone of their own; every
conversion to or from a UTC instant happens in one place
(`apps/api/src/common/scheduling/local-time.util.ts`), verified
correct across a zone with no DST (`Africa/Accra`), a fixed
non-UTC-zero offset (`Africa/Johannesburg`), and a DST transition
(`America/New_York`).

**Customer records are tenant scoped.** `CustomerRecord` — one
organization's own knowledge of a customer, created automatically on
that customer's first booking with that organization — is never
joinable with, or visible to, another organization; there is no
relationship between two organizations' `CustomerRecord` rows for the
same person at all, the same structural isolation section 8 describes
for every other tenant-owned table. A business appointment response
includes only the customer information necessary to provide the booked
service (name/contact detail from that organization's own
`CustomerRecord`) — never full global customer information or
cross-organization history.

Booking-related permissions (`services.read`/`services.manage`,
`availability.read`/`availability.manage`, `appointments.read`/
`appointments.manage`) follow section 9's existing model exactly: fresh
per-request resolution, no caching, no trust in a token or request
body. A `READ_ONLY` subscription may read this configuration but not
mutate it; a `BLOCKED` or `READ_ONLY` subscription rejects a new
customer booking with a generic `409 SUBSCRIPTION_UNAVAILABLE` (checked
explicitly for the customer path, since it reaches the organization by
public slug rather than through `TenantAccessGuard`; the staff-assisted
path already goes through that guard, which enforces the same rule).

No notification provider is integrated for booking confirmations yet.
`DomainEventEmitter` (`apps/api/src/common/events/`) emits named,
in-process events — `ServiceCreated`, `AvailabilityChanged`,
`AppointmentCreated`, `AppointmentCancelled`, `AppointmentRescheduled`,
`AppointmentNoShowMarked` — as a documented, real hook point for a
future notification/outbox subscriber to attach to; emitting is
fire-and-forget and never a substitute for the durable audit trail
below, and a listener throwing can never fail the request that
triggered it.

Every mutation in this section writes an audit event (service/category
create and edit, branch-service and staff-assignment changes,
business-hours and availability changes, appointment creation,
cancellation, rescheduling, no-show marking, and a reschedule that lost
a database-level conflict) through the same append-only `AuditEvent`
path as the rest of the platform (section 19) — never a plaintext OTP,
access token, refresh token, or full raw request body; state changes are
recorded as compact before/after JSON, not arbitrary object dumps.

**AI will later consume controlled discovery and availability APIs, not
unrestricted database access** (docs/ROADMAP.md section 17,
docs/ARCHITECTURE.md section 20): the same public, visibility-filtered
endpoints this section describes are the intended integration surface
for a future AI discovery/business-intelligence layer, not a direct
query path into `services`, `appointments`, or any other table.

Email OTP (section 6) remains Kora's authentication method for booking
as for everything else, and is not phishing-resistant. Passkeys or
another device-bound method remain a security-roadmap item for a later
phase, targeted at sensitive financial and owner-administration actions
rather than ordinary booking; passwords are not planned as a fallback
for any of this, booking included.

## 31. Walk-in intake, live branch queue, and service sessions

**Kora remains passwordless.** Nothing in this phase introduces a
credential — every walk-in, check-in, and queue/session command is
performed by an authenticated staff member using the same email-OTP
session as everywhere else (section 6). No customer-facing surface
exists in this phase; there is no customer self-check-in, QR check-in,
or geofenced check-in.

**`Appointment`, `QueueEntry`, and `ServiceSession` are three separate
concepts, never conflated.** An `Appointment` is a reservation. A
`QueueEntry` is a customer waiting for or receiving service at a branch
*today* — `QueueEntry` itself is the durable walk-in record; no
separate `WalkIn` table exists, since a walk-in-sourced entry and an
appointment-checked-in entry share exactly the same lifecycle
(docs/DATA_MODEL.md section 7). A `ServiceSession` is actual work
performed. Checking an appointment into the queue never mutates the
appointment itself and never marks it completed; only a future
`ServiceSession` can establish that work happened, and a completed
session is not itself a `Payment`, `Transaction`, `Receipt`, or
`Commission` — none of those exist yet, and `serviceTotalMinor` is the
value of performed services, not proof money was received.

**The queue and service-session state machines are enforced, not
advisory.** A `QueueEntry` reaches `IN_SERVICE` only by starting a
`ServiceSession`, and `COMPLETED` only by completing one — never
through a direct command; terminal states (`COMPLETED`, `CANCELLED`,
`NO_SHOW`) cannot be reopened. A `ServiceSession` reaches `COMPLETED`
or `CANCELLED` only from `IN_PROGRESS`. Every invalid transition is
rejected with a stable `409` before any write is attempted
(`assertQueueTransitionAllowed`,
`apps/api/src/modules/queue/queue-transition.util.ts`), verified by a
dedicated unit test for every allowed and rejected pair.

**Double-booking-style protection extends to service sessions, enforced
at the database level.** Two partial PostgreSQL unique indexes —
`service_sessions_one_active_per_staff` and
`service_sessions_one_active_per_queue_entry`, both `WHERE status =
'IN_PROGRESS'`, requiring no extension beyond what this schema already
uses — guarantee a staff profile can never hold two active sessions at
once, and a queue entry can never have more than one active session,
regardless of what the application layer believed was free. Starting a
session is one database transaction: claiming the queue entry (an
`UPDATE ... WHERE status IN ('WAITING', 'CALLED')`, the same
re-checked-on-lock-wait pattern the rest of the codebase uses), creating
the session and its item snapshots, moving the queue entry to
`IN_SERVICE`, and writing history. A violation of either partial index
rolls the *entire* transaction back — the queue-entry claim included —
so a failed start leaves the queue entry completely unchanged, and the
raw constraint name and SQLSTATE are never returned to the caller
(translated to a generic `409 STAFF_ALREADY_SERVING` or `409
QUEUE_ENTRY_ALREADY_IN_SERVICE` via the same `isUniqueConstraintViolation`
utility appointment booking's idempotency path already established).
Proven directly (`test/service-sessions.e2e-spec.ts`): several
concurrent start attempts on the same queue entry resolve to exactly
one `IN_PROGRESS` session; concurrent start attempts assigning the same
staff member to two different queue entries also resolve to exactly
one, with the losing queue entry's status and `version` provably
unchanged. Completion is the same shape — freeze the total, complete
the queue entry, one transaction, so a failed completion leaves both
rows unchanged.

**Ticket numbers are issued atomically, per branch and branch-local
business date.** `BranchQueueDay` — one row per `(organizationId,
branchId, businessDate)`, with `businessDate` always computed from the
*branch's* own `timeZone` via `todayInZone`
(`apps/api/src/common/scheduling/local-time.util.ts`), never the API
server's — issues the next ticket number and bumps a polling `revision`
through a single native Postgres `INSERT ... ON CONFLICT DO UPDATE`
(Prisma's `upsert`), not a read-then-write application check. A second,
structural line of defense (`queue_entries`' own unique constraint on
`(branchId, businessDate, ticketNumber)`) would reject a duplicate even
if the first ever failed. Proven directly: several concurrent walk-in
requests receive unique, sequential ticket numbers with no gaps and no
duplicates.

**Both intake paths are idempotent.** A client-supplied `Idempotency-
Key` header, scoped per acting staff membership (not globally — a key
only needs to be unique within one staff member's own request stream,
the same reasoning `AppointmentIdempotencyKey` applies per customer), is
checked *before* any write is attempted, exactly mirroring the booking
flow's own two-layer approach: a proactive pre-check short-circuits a
genuine retry, and a reactive unique-constraint catch on
`queue_intake_idempotency_keys` is the safety net for a true concurrent
race — proven under actual concurrency (`test/queue-intake-and-
commands.e2e-spec.ts`: 5 simultaneous identical-key walk-in requests
create exactly one `QueueEntry`). Appointment check-in additionally
enforces "at most one `QueueEntry` per `Appointment`" through a plain
unique constraint on `queue_entries.appointment_id`, with the same
reactive-catch pattern proving 5 simultaneous check-in requests for the
same appointment resolve to exactly one success and four generic `409
ALREADY_CHECKED_IN` responses — never a raw constraint error.

**A newly entered walk-in email or phone number is never used to link a
global `CustomerProfile`.** Creating a new `CustomerRecord` for a
walk-in customer never searches for or attaches an existing
`CustomerProfile` by matching contact details — account linking
requires verified ownership (the passwordless sign-in flow itself) and
stays out of scope here, the same boundary section 29 draws for
discovery. Every `QueueEntry` still carries an organization-scoped
`CustomerRecord`, tenant-isolated the same way section 8 and section 30
already describe for appointments — a cross-tenant `customerRecordId`
is rejected with a clean `400`, never a raw foreign-key violation, and a
cross-tenant or cross-branch `appointmentId` at check-in is rejected
with `404` (its existence is never confirmed to a caller who cannot
reach it).

**A provider acts on their own session only, unless granted broader
management.** `service_sessions.perform` lets a staff member start and
complete/cancel/edit only the session assigned to their own
`StaffProfile`; `service_sessions.manage` (owner, manager) lifts that
restriction to any session in the organization. Because NestJS's
declarative permission guard expresses only "all of these codes
required," not "either of these, then check ownership," this
either/or-plus-ownership rule is checked explicitly in
`ServiceSessionsService` rather than through `@RequirePermissions` —
proven directly: a plain service-provider cannot start, complete, or
cancel another provider's session (`403`), and a manager/owner can.
Every id-scoped queue-entry and service-session route (none of which
carry a `:branchId` route parameter — see the API surface in
docs/API_SPEC.md sections 16-17) re-checks branch access against the
caller's own tenant context after loading the entity
(`assertMembershipHasBranchAccess`,
`apps/api/src/common/authorization/assert-branch-access.util.ts`), the
same guarantee `TenantAccessGuard`'s `@RequireBranchParam` gives routes
that do carry one.

Continues enforcing section 9's existing subscription/tenant/RBAC model
exactly: `READ_ONLY` may read queue and session records but not mutate
them (`TenantAccessGuard` blocks every non-`GET` method under
`READ_ONLY` automatically, by HTTP method, with no extra service-layer
check required here — unlike customer appointment booking, every
queue/session route is staff-initiated and already passes through that
guard); `BLOCKED` denies everything.

Every mutation in this section writes an audit event —
`queue.walk_in.created`, `queue.appointment.checked_in`,
`queue.entry.called`, `queue.entry.returned_to_waiting`,
`queue.entry.assigned`, `queue.entry.cancelled`, `queue.entry.no_show`,
`service_session.started`, `service_session.items_updated`,
`service_session.completed`, `service_session.cancelled` — through the
same append-only `AuditEvent` path as the rest of the platform (section
19). Metadata carries identifiers and safe operational values only
(status, ticket number, assigned staff id, service total) — never a
customer's phone/email or an internal exception detail; proven directly
that a completed session's audit trail never mentions a payment,
transaction, receipt, commission, or payout (`test/service-
sessions.e2e-spec.ts`), because none of those concepts exist yet to
mention.

The already-applied migration named `allow_walk_in_appointment_customer`
did **not** implement any of the above — its name is historical and
narrower than it sounds (docs/DATA_MODEL.md section 15). This phase's
actual walk-in/queue/service-session tables were added by
`add_walk_in_queue_and_service_sessions`.

## 32. ServiceSession status history and least-privilege service-session access

**`ServiceSessionStatusHistory` is the domain lifecycle ledger for one
session, distinct from `AuditEvent`.** `AuditEvent` (section 19) is the
platform-wide, cross-entity record every mutation in Kora writes to
regardless of type — actor, tenant, branch, action, entity, request ID.
`ServiceSessionStatusHistory` is narrower and typed: the queryable
transition history of *one aggregate*, the same role
`QueueEntryStatusHistory`/`AppointmentStatusHistory` already play for
theirs. Both are written on every transition, inside the same database
transaction as the status-change update itself — neither replaces the
other, and a failed transition (a stale optimistic-concurrency version,
a losing concurrent race, an already-terminal session) leaves neither
behind, proven under real concurrency
(`test/service-session-status-history-and-permissions.e2e-spec.ts`:
several simultaneous completion attempts on the same session resolve
to exactly one successful transition and exactly one appended
`COMPLETED` history row). `previousStatus` is null only for the row
written alongside session start; a `CHECK` constraint enforces that a
row targets `IN_PROGRESS` if and only if `previousStatus` is null, and
that `cancelDisposition` is set if and only if `newStatus` is
`CANCELLED` — the same shape-constraint pattern `ServiceSession.
cancelDisposition` itself already establishes (section 31). No update
or delete path is exposed through application services. No customer
PII is ever written to a history row — only identifiers, statuses,
actor references, and a staff-entered reason string.

**`service_sessions.start` is a new, narrower permission** completing
the least-privilege model section 31 began. The four service-session
permissions now carry four different scopes, checked in
`ServiceSessionsService` (`assertStartAuthorized`,
`apps/api/src/modules/service-sessions/service-session-start-
authorization.util.ts` — a pure, independently unit-tested function
taking every fact it needs as an explicit argument rather than reaching
into request state itself):

- `service_sessions.manage` (owner, manager): unrestricted.
- `service_sessions.perform` (service provider): may start, complete,
  cancel, and edit only a session whose `assignedStaffProfileId` is
  their own `StaffProfile` — resolved fresh from the database via the
  caller's own `organizationId`+`membershipId` on every call, never
  cached or trusted from a token.
- `service_sessions.start` (receptionist, manager, owner): may start
  service only for the provider *already assigned* to the queue entry;
  redirecting the work to a *different* provider at start time
  additionally requires `queue.manage`. Grants nothing else — no
  ability to replace items, complete, or cancel the resulting session,
  and no ability to act as its assigned provider.
- `service_sessions.read`: view only, on every role that holds it
  (owner, manager, receptionist, service provider, cashier).

**The route-level gate and the fine-grained rule are deliberately two
different layers.** `start-service` is guarded by a new
`@RequireAnyPermission('service_sessions.start', '.perform', '.manage')`
decorator on `TenantAccessGuard` (`apps/api/src/common/authorization/
decorators/require-any-permission.decorator.ts`) — the OR counterpart
to the existing `@RequirePermissions`' AND-only semantics, unit-tested
directly on the guard (`tenant-access.guard.spec.ts`). That decorator
is only ever the coarse "holds at least one of these three codes" gate;
`assertStartAuthorized` is the actual fine-grained rule once past it.
Neither layer is a substitute for the other, and neither can be
bypassed by holding an unrelated permission — `service_sessions.
start` alone can never reach `complete`, `cancel`, or `PUT .../items`,
which remain gated by `service_sessions.perform` **or** `.manage` only,
exactly as before this correction (docs/API_SPEC.md section 17).

**Ineligibility and branch-assignment checks are unconditional,
regardless of which permission the caller holds.** A `.start`-only
receptionist who also happens to hold `queue.manage` (the seeded
default) can select a different provider at start time, but the
underlying eligibility check (`resolveEligibleProviders` — active
membership, branch assignment, a `StaffServiceAssignment` for every
requested service) and `assertMembershipHasBranchAccess` still run
unconditionally before any session is created; the least-privilege
grant never widens what counts as a *valid* provider, only who is
allowed to invoke the command. Proven directly: a receptionist cannot
start service with a staff member who has no service assignment
(`400`, same as any other caller), and cannot start service for a
branch they have no `BranchAssignment` for even though `service_
sessions.start` itself carries no branch scope in its name (`403`).

**`READ_ONLY` and `BLOCKED` subscription behavior is unchanged and
still enforced entirely by `TenantAccessGuard`** (section 10): every
mutating service-session route — `start-service` included, now behind
the any-of decorator — is still a non-`GET` method, so `READ_ONLY`
blocks it by HTTP method exactly as before this correction, with no
additional service-layer subscription check required; `GET` reads
remain permitted. `BLOCKED` denies everything. Proven directly under a
`READ_ONLY` subscription: reading a session still succeeds, starting
and completing one both return `403`.

Cross-tenant and cross-branch safety are unchanged in mechanism from
section 31 (composite tenant foreign keys, `assertMembershipHasBranch
Access` on every id-scoped route) and are re-verified here for the new
permission surface specifically: starting service for a queue entry in
another organization returns `404` regardless of which of the three
permissions the caller holds, never confirming the entry's existence
to a caller who cannot reach it.

## 33. Checkout, payment recording, verification, and transaction posting

**Four entities, each proving a different fact, never collapsed into
one.** `Checkout` is the amount due for a completed `ServiceSession` —
immutable line-item snapshots, recomputed from nothing once created.
`PaymentRecord` is a staff member's *claim* that money was received —
recording one is not itself revenue. `PaymentDispute`/
`PaymentVerificationEvent` are the assigned provider's confirm-or-
dispute step every claim must pass, and an owner/manager's resolution
of a dispute. `Transaction` is the immutable, posted commercial fact —
the only thing a future reporting phase may ever count as business
revenue, created exactly once per Checkout and never through any
public create/update/delete route. See docs/DATA_MODEL.md section 8
for the full schema and docs/ARCHITECTURE.md sections 11-12 for the
state machines.

**Separation of duties is enforced in code, in
`assertConfirmAuthorized`** (`apps/api/src/modules/payments/payment-
confirmation-authorization.util.ts`, pure and independently unit-
tested): the assigned provider, holding `payments.verify_own`, may
confirm a payment recorded by someone else; a recorder who is also the
assigned provider is always blocked from self-confirming
(`PAYMENT_SELF_CONFIRMATION_FORBIDDEN`) — converting your own claim
into verified truth with no independent check is a conflict of
interest regardless of role. The one escape hatch is a solo owner/
provider: an owner/manager holding `payments.resolve` may confirm
directly as a **management override**, but only given an explicit,
non-empty `reason`, and every such confirmation writes a distinct,
separately queryable `payment.management_override` audit event in
addition to the ordinary `payment.confirmed` one — so a management
override is always visible as such, never indistinguishable from an
ordinary provider confirmation after the fact. A provider without
`payments.resolve` who is not the assigned provider for a given record
is rejected outright (`PAYMENT_CONFIRMATION_FORBIDDEN`) — holding
`payments.verify_own` grants no blanket authority over every payment,
only over records assigned to the caller's own `StaffProfile`,
resolved fresh from the database on every call exactly as
`service_sessions.perform` already does (section 32). Disputing
follows the same assigned-provider-only rule, with no management-
override path — a manager who wants to intervene resolves the
resulting dispute instead (`payments.resolve`), which is the only
route that can move a `DISPUTED` payment onward.

**A `GET .../payment-verifications/pending` endpoint is scoped to the
authenticated provider's own `StaffProfile` only** — never every
branch payment, regardless of how broad the caller's other permissions
are. A membership with no `StaffProfile` at all (a pure manager, say)
simply gets an empty list rather than an error.

**Exactly-once Transaction posting under concurrency rests on a single
lock, not on application-level coordination.** Every payment-domain
mutation — record, confirm, dispute, void, resolve — takes a
`SELECT ... FOR UPDATE` row lock on the parent `Checkout` as the very
first database action inside its own transaction, in the same order
every time (`CheckoutSettlementService.lockCheckout`, `apps/api/src/
modules/payments/checkout-settlement.service.ts`). Because every code
path acquires the identical single resource in the identical order,
two concurrent mutations against the same Checkout always serialize
rather than deadlock, and each one re-validates the record it is about
to change *after* acquiring the lock — a payment already moved on by
a winning concurrent request is caught here (`PAYMENT_STATE_INVALID`),
not by an earlier, now-stale read. The centralized status-recalculation
rule (`deriveCheckoutSettlement`, pure and unit-tested,
`apps/api/src/modules/checkouts/checkout-settlement.util.ts`) runs
against this same locked, fresh snapshot after every mutation: an
unresolved dispute anywhere makes the checkout `DISPUTED`; otherwise a
payment still awaiting confirmation makes it `AWAITING_VERIFICATION`;
otherwise confirmed payments below the total leave it `OPEN`; only
when confirmed applied payments exactly equal the total does
`TransactionPostingService.postForCheckout` run, inside that same
transaction, copying `CheckoutLineItem` snapshots into
`TransactionLineItem` rows, allocating each confirmed payment, and
marking the Checkout `SETTLED` — all four writes succeed together or
none of them do. Proven under real concurrent load
(`test/transaction-posting-and-concurrency.e2e-spec.ts`): five
simultaneous confirmation attempts on the one payment that completes a
checkout's balance produce exactly one successful confirmation, four
clean `409` conflicts, and exactly one posted Transaction; a confirm
and a dispute racing on the same payment resolve to exactly one valid
outcome with the Checkout's derived state always consistent with it. A
database-level uniqueness conflict on a Transaction's `checkoutId` or
`reference` (the defense-in-depth safety net behind the lock, never
the primary mechanism) resolves to idempotent success or a stable
domain conflict — never a raw Prisma or PostgreSQL error reaching the
client.

**Idempotency is required for payment recording and, for a different
reason, unnecessary-but-still-safe for Checkout creation.** Recording a
payment without an `Idempotency-Key` header is rejected outright
(`400`); the key, request fingerprint, and resulting `PaymentRecord`
id are stored in `FinancialIdempotencyKey`, scoped by organization,
membership, operation, and key (one generic table covering both
Checkout creation and payment recording, rather than one per command —
docs/DATA_MODEL.md section 8). A replayed request with the same key
and body returns the original payment; the same key with a different
body returns `409 IDEMPOTENCY_CONFLICT`. Checkout creation needs no
client-supplied key at all, because `Checkout.serviceSessionId` is
itself unique at the database level: a request that lands after an
earlier one has already committed gets a clear `CHECKOUT_ALREADY_
EXISTS` conflict, while a request racing that closely (the reactive
unique-constraint catch, not the earlier pre-check) is instead hand
back the winner's Checkout transparently, matching how the caller
actually experiences a double-submit.

**Stable, non-leaking error codes** cover every state-machine
precondition in this domain: `SERVICE_SESSION_NOT_COMPLETED`,
`CHECKOUT_ALREADY_EXISTS`, `CHECKOUT_STATE_INVALID`, `CHECKOUT_
ALREADY_SETTLED`, `CHECKOUT_TOTAL_INVALID`, `CHECKOUT_BALANCE_
EXCEEDED`, `PAYMENT_STATE_INVALID`, `PAYMENT_CONFIRMATION_FORBIDDEN`,
`PAYMENT_SELF_CONFIRMATION_FORBIDDEN`, `PAYMENT_DISPUTE_REQUIRED`,
`PAYMENT_DISPUTE_ALREADY_RESOLVED`, `IDEMPOTENCY_CONFLICT`,
`TRANSACTION_ALREADY_POSTED`. `ApiExceptionFilter` (section 21)
guarantees none of these — or any unhandled internal error — ever
exposes a raw driver message, SQLSTATE, or stack trace to a client.

**Amount, method, and currency are immutable on a `PaymentRecord` from
the moment it is created** — no update route exists for them at all;
a mistake is corrected by voiding (while still `RECORDED`, requiring
`payments.resolve`) and recording a fresh replacement, never by
editing the original. A CASH payment's `tenderedAmountMinor` may
legitimately exceed `appliedAmountMinor`; the difference (`changeMinor`
in the API response) is derived at read time and never stored or
counted toward the checkout balance. `externalReference` is validated
to a safe alphanumeric code shape — no field anywhere in the schema is
shaped to hold a card number, bank account number, PIN, or other
payment credential, matching the "recording categories only, no
gateway integration" rule for `method` itself (docs/ARCHITECTURE.md
section 11).

**`READ_ONLY` and `BLOCKED` subscription behavior follows the same
unconditional `TenantAccessGuard` mechanism as every other domain**
(section 10): every mutating route in this stage — checkout creation,
adjustments, voiding, payment recording, confirm/dispute/void,
dispute resolution — is a non-`GET` method with no
`@AllowReadOnlyAccess` override, so `READ_ONLY` blocks all of them by
HTTP method alone; reads remain permitted.

**Cross-tenant and cross-branch safety follow the established
mechanism** (composite `(organizationId, id)` foreign keys throughout,
`assertMembershipHasBranchAccess` on every id-scoped route) and are
re-verified for this domain specifically: a payment or transaction id
from another organization returns `404` regardless of which
permission the caller holds, never confirming its existence.

**Explicitly out of scope for this stage, and not implemented:**
commissions, receipts, reporting dashboards, refunds, reconciliation,
payment-gateway integration, subscription billing, staff earnings,
invoices, transaction reversals, chargebacks, tax calculation,
accounting journal entries. Customer service payments and organization
subscription payments remain completely separate domains — this
domain never touches `OrganizationSubscription`/`PlanPrice`, and Kora
does not hold, transfer, or settle customer money in this phase; every
payment method here is a manually recorded staff attestation, not a
processed transaction.

## 34. Commission accrual, receipt issuance, and reporting

**Every derived record traces back to one immutable, already-POSTED
Transaction — never a mutable `PaymentRecord` claim.** `Commission
AccrualService.accrueForTransaction` and `ReceiptService.
issueForTransaction` are invoked only from inside
`TransactionPostingService.postForCheckout`, in the same database
transaction that creates the Transaction itself: a failure in either
rolls back the Transaction, its line items, and its payment
allocations together, and a failure anywhere else in that transaction
leaves no accrual or receipt behind. Both services check what already
exists for the transaction before creating anything, which is what
lets the exact same call also serve as `TransactionPostingService.
ensureDerivedRecords` — an internal repair path for a hypothetical gap,
never exposed through any controller, unauthenticated route, or
arbitrary public backfill endpoint. Proven under real concurrent load
(`test/commission-accrual-posting.e2e-spec.ts`,
`test/receipts.e2e-spec.ts`): five simultaneous confirmation attempts
on the payment that completes a checkout's balance still produce
exactly one accrual per line item and exactly one receipt, and several
transactions posted back to back receive distinct, strictly increasing
receipt sequence numbers with no gap or duplicate.

**Commission rules are versioned and scope-unique at the database
layer, not only in application code.** A `CommissionRule` is never
edited in place once current — `commissions.manage` (owner/manager
only) reaches only `POST .../commission-rules{,/:id/supersede,/:id/
deactivate}`, each of which either creates a brand-new row or closes
the current one, never an in-place field update. Only one CURRENT rule
(`effectiveUntil IS NULL AND deactivatedAt IS NULL`) may exist per
exact `(branchId, staffProfileId, serviceId)` scope combination — a
plain `UNIQUE` constraint cannot express this because each scope
column is independently nullable and would treat every `NULL` as
distinct, so this is a hand-written partial index with `NULLS NOT
DISTINCT` (PostgreSQL 15+), confirmed against the real database
(`test/commission-rules.e2e-spec.ts`: a second organization-default
rule is rejected with `409 COMMISSION_RULE_SCOPE_CONFLICT`; five
concurrent attempts to create the same exact scope converge on exactly
one row). A rule is resolved as of the Transaction's own `postedAt`,
never "now" — superseding or deactivating a rule after a Transaction
has already posted never changes that Transaction's already-created
accrual, since every value the calculation depended on was snapshotted
onto the accrual row itself.

**Separation of duties for `commissions.read_own` mirrors
`payments.verify_own`'s own rule.** `GET .../me/earnings` resolves the
caller's own StaffProfile fresh from the database on every request —
a client-supplied staff-profile id is never accepted, and a membership
with no StaffProfile at all simply has no earnings. `commissions.
read_all` (owner/manager only) is the only way to see another staff
member's accruals.

**A Receipt is not a statutory VAT or tax invoice** — no TIN, no tax
calculation, no compliance claim of any kind, and every value on it is
a snapshot taken atomically at issuance time (business name, branch
name, branch contact/location, customer display name, currency,
totals, line items, and payment-method summaries with only a
safe-code-validated `externalReference`, never a card/account number,
PIN, or `PaymentRecord.note` free text) — never a later live read of a
mutable `Branch`/`CustomerRecord`/`PaymentRecord` row. The receipt
number (`{branchCode}-{year}-{sequence}`) carries no UUID, PII, or
credential, and is unique only within the issuing organization, not
platform-wide, since it is built from `Branch.code` — itself only
unique per organization.

**Receipt access is two entirely separate paths that never overlap.**
The business side (`GET .../organizations/:organizationId/receipts{,/
:id}`, `receipts.read` — owner/manager/cashier/receptionist, never a
plain service provider by default) is tenant-scoped exactly like every
other endpoint in this document. The customer side (`GET /me/receipts
{,/:id}`) carries no organization in its route at all — proving
ownership is the *only* access rule, via `Receipt.customerRecordId ->
CustomerRecord.customerProfileId` matching the authenticated user's
own CustomerProfile, resolved fresh from the database on every
request. A walk-in customer with no linked CustomerProfile is
reachable only through the business side; requesting their receipt id
through `/me/receipts/:id` as any other authenticated customer returns
the same `404` as a receipt that does not exist at all — proven
directly (`test/receipts.e2e-spec.ts`): a stranger, and a different
real customer, both get `404` for a receipt they do not own.

**Reporting authority follows the same "only POSTED Transactions are
revenue" rule as commission calculation.** `GET .../reports/*`
(`reports.read`, owner/manager only) derives every figure from already
-immutable records — POSTED Transactions and their line-item/
CommissionAccrual/ReceiptPaymentSummary snapshots — never a live
PaymentRecord. A RECORDED or DISPUTED payment claim appears only as an
explicitly separate operational counter on the overview report
(`pendingPaymentClaimCount`/`disputedPaymentClaimCount`), never summed
into `postedRevenue`, never labeled revenue, and never combined across
currencies (every monetary figure is grouped strictly by currency
code). Every report requires a validated `from`/`to` range capped at
366 days; a branch-scoped report groups by that branch's own local
calendar day, while an organization-wide report spanning potentially
several branch timezones requires an explicit, IANA-validated
`timezone` query parameter rather than silently choosing one branch's
zone or mixing ambiguous local-day boundaries. `READ_ONLY` subscription
mode permits every report/receipt/earnings read (all `GET`) while still
blocking commission-rule mutations (`POST`, no `@AllowReadOnlyAccess`
override) through the same unconditional `TenantAccessGuard` mechanism
as every other domain (section 10).

**Cross-tenant and cross-branch safety follow the established
mechanism** (composite `(organizationId, id)` foreign keys throughout,
`assertMembershipHasBranchAccess` on every branch-scoped report/rule
route) and are re-verified for this domain specifically: a commission
rule, receipt, or branch-scoped report request for another
organization's id returns `404`, never confirming its existence.

**Explicitly out of scope for this stage, and not implemented:**
commission payouts, payroll, settlement, a "paid" status or staff
wallet balance for any commission, and receipt PDF/email delivery or
public share links. Cash-session reconciliation, refunds, and
reversals are implemented — see section 35. Kora does not hold,
transfer, or settle any money in this phase — every commission accrual
and every receipt describes value already claimed and confirmed
through the payment-verification stage (section 33), never a payout
Kora itself makes.

## 35. Cash controls, refund/reversal corrections, commission adjustments, corrective receipts, and gross/net reporting

Implemented (docs/ROADMAP.md Phase 7) — see docs/ARCHITECTURE.md section 22 for the full design. Two related but independent security-relevant additions: branch cash-drawer custody, and correcting an immutable, already-POSTED `Transaction`.

**Cash-drawer custody is a physical fact, never a revenue calculation, and is defended at three independent layers.** `expectedClosingCashMinor`/`countedCashMinor`/`varianceMinor` never appear in, and never feed, any revenue figure anywhere in this codebase — the dedicated `GET .../reports/cash-reconciliation` endpoint (section 34) is the only place they surface at all. Layer one is authorization: `cash_sessions.open`/`.operate`/`.close` restrict a cashier to a session they themselves opened, unless they additionally hold `cash_sessions.reconcile` (owner/manager only), which is also the only permission that can review a closed session. Layer two is the application-level row lock: every mutation (`CashSessionsService.lockCashSession`) takes a `SELECT ... FOR UPDATE` on the target session before writing a ledger entry or closing it — the same aggregate-root-lock pattern section 33 already established for `Checkout`. Layer three is a hard database-level backstop: a `BEFORE INSERT` trigger on `cash_ledger_entries` independently rejects any entry whose session is not `OPEN`, taking its own row lock inside the trigger body so it stays race-safe against a concurrent close — proven by directly attempting the insert with the application layer bypassed entirely, against a real PostgreSQL instance, not merely asserted. At most one `OPEN` `CashSession` may exist per `(registerId, currency)`, enforced by a partial unique index and confirmed under five concurrent open attempts converging on exactly one row. A disputed or voided `PaymentRecord` never silently removes cash already recorded into a session's ledger — any physical correction requires an explicit, audited, reason-carrying manual `CASH_OUT` movement, never an automatic reversal of the original `PAYMENT_RECEIVED` entry.

**A posted SALE `Transaction` is never mutated, updated, or deleted by a correction — only a new, separately immutable REFUND/REVERSAL `Transaction` is ever created.** No route anywhere accepts an update to an existing `Transaction`'s fields; `TransactionCorrectionExecutionService.execute` only ever creates new rows (a corrective `Transaction`, its line items, its `CommissionAccrual` adjustments, its `Receipt`, and — for cash — one `CashLedgerEntry`) inside one atomic database transaction. `Transaction.kind` and the non-negative-magnitude-plus-derived-sign convention (docs/ARCHITECTURE.md section 22) means a REFUND/REVERSAL can never be mistaken for negative revenue at the storage layer — the distinction is enforced by a `CHECK` constraint requiring `adjustmentTotalMinor = 0` for every non-SALE kind, and by the reporting layer's own `summarizeTransactionKinds` deriving sign only from `kind`, never from a stored sign.

**Separation of duties for correction decisions is enforced in code, not only by permission, mirroring section 33's payment-confirmation rule exactly.** `assertCorrectionDecisionAuthorized` is a pure, unit-tested function: the membership that requested a correction can never approve or reject it themselves (`403 CORRECTION_SELF_DECISION_FORBIDDEN`), even while holding `refunds.approve` — the one narrow escape hatch is an active owner with no *other* active membership in the organization holding `refunds.approve` at all (checked fresh against the database on every decision, never cached), and even then only with an explicit, non-empty `overrideReason`, recorded as `soloOwnerOverride: true` on the correction plus a separate, clearly labelled `correction.solo_owner_override` audit event — the same "no independent check exists, so require an audited override" shape section 33's solo-owner payment-confirmation override already established. Approval (`refunds.approve`) and execution (`refunds.execute`) are deliberately separate permissions and separate HTTP actions even when the same manager holds both, so an approval decision and the act of paying money out are always two distinct, separately timestamped, separately actor-attributed events.

**A refund can never exceed what remains, under any concurrency pattern, because the remaining amount is always recomputed fresh under a lock on the correct aggregate root.** `TransactionCorrectionExecutionService.execute` locks the `TransactionCorrection` row first, then the *original* SALE `Transaction` row — a higher-level aggregate root than the correction itself, the same "lock the aggregate root before computing a derived limit" principle `CheckoutSettlementService` established in section 33 — before ever recalculating the remaining refundable amount per line from every other EXECUTED correction against that same sale. This closes the exact race a naive "check remaining, then insert" implementation would have: two concurrent partial-refund executions against the same sale can never together exceed the original line amount, because the second one to acquire the lock always sees the first one's already-committed EXECUTED row. Five concurrent execute attempts against the same approved correction produce exactly one corrective Transaction and four `409` conflicts, proven against a real PostgreSQL instance (`test/transaction-corrections.e2e-spec.ts`); a failed execution (e.g. exceeding what remains) leaves absolutely no partial trace — no corrective Transaction, no commission adjustment, no receipt, no cash-ledger entry — since every write happens inside the one atomic transaction that either commits completely or rolls back completely. A REVERSAL is additionally blocked, both at request time and again defensively at execution, once any refund or reversal has already been executed against that sale — at most one successful full reversal can ever exist per SALE Transaction.

**Idempotency for correction requests and execution follows the request-payment pattern exactly, including the "replay before rethrowing" ordering fix this stage corrected.** Both `.../refund-requests`/`.../reversal-requests` and `.../execute` require an `Idempotency-Key`; a repeated identical request returns the original result rather than creating a duplicate, and a repeated key with a different body is rejected (`409 IDEMPOTENCY_CONFLICT`). Critically, the idempotent-replay check in `execute()` runs *before* the correction's state-validity check, not after — so a genuine retry of a request that already succeeded (the same key, arriving after the correction has already moved past `APPROVED` to `EXECUTED`) replays the original successful result instead of surfacing a spurious `409` to a caller who did nothing wrong, the same ordering `PaymentsService.record` already establishes for payments.

**Commission adjustments can never be inflated or manipulated by changing policy after the fact.** `CommissionAdjustmentService.adjustForCorrection` reads only the original EARNED accrual's own immutable snapshot (`ruleTypeSnapshot`, `rateBasisPointsSnapshot`, `fixedAmountMinorSnapshot`, `basisSnapshot`) — the current `CommissionRule` is never consulted, even if it has since been superseded or deactivated, so a manager cannot retroactively change what a refund reverses by editing commission policy after the original sale. `calculateFixedAdjustmentAmount` caps every adjustment at what actually remains of the original accrual regardless of calling order, so cumulative adjustments across any number of partial corrections can never exceed the original accrual — proven directly, including the specific case of prior partial adjustments summing close to the original before a final correction claims the exact remainder rather than a naively re-prorated (and therefore too-large) amount.

**Corrective receipts never expose more than the original receipt already permits, and are never described as a statutory document.** `ReceiptKind.REFUND_RECEIPT`/`REVERSAL_RECORD` are issued through the identical atomic, exactly-once sequence as `SALE_RECEIPT` (section 34); the same "not a VAT invoice, no TIN, no tax calculation" stance applies unchanged, and the same business-side (`receipts.read`) vs. customer-side (`/me/receipts`, ownership-proven) access split applies unchanged — a corrective receipt for a walk-in customer with no linked `CustomerProfile` is reachable only through the business side, exactly like the original sale receipt it corrects.

**`READ_ONLY` and `BLOCKED` subscription behavior, and cross-tenant/cross-branch safety, follow the identical unconditional mechanisms established in sections 10 and 33** and are re-verified for every route introduced in this stage: every mutating cash-control, correction, and reporting route is a non-`GET` method with no `@AllowReadOnlyAccess` override, so `READ_ONLY` blocks all of them by HTTP method alone while every read remains permitted; a cash register, cash session, or correction id from another organization returns `404` regardless of which permission the caller holds, never confirming its existence, proven directly for each new resource type.

**Explicitly out of scope for this stage, and not implemented:** payment-gateway integration, external settlement matching, commission payouts, payroll, a "paid"/settlement status for any commission, subscription billing, statutory tax invoicing, and receipt PDF/email delivery or public share links. A manually recorded cash refund never claims to prove external settlement — it is described throughout as a manually recorded return, exactly like a manually recorded payment (section 33).

## 36. Android application security

The first production Android integration (docs/ROADMAP.md) connects a
real customer-facing vertical slice — sign-in, home, discovery,
booking, appointment management — plus workspace selection and an
initial business dashboard, to the real API. Two small additive backend
endpoints exist purely to let the client make that connection safely
(sections 31-32); everything below this paragraph describes how the
Android application itself is built to never become the thing that
decides what a user is allowed to do or see.

**The two new endpoints follow every existing tenant-isolation rule
unchanged, and add no new authorization surface.** `GET
/v1/me/workspaces` is a read-only projection derived from the same
`OrganizationMembership`/`BranchAssignment`/`SubscriptionAccessService`
facts every other authorized route already consults — it grants
nothing by existing, and every protected request the client makes
afterward is independently re-authorized by `TenantAccessGuard` exactly
as before this endpoint existed. Favorites (`/v1/me/favorites`) are
scoped to `CustomerProfileService.getOrCreateId(userId)`, isolated per
customer the same way `CustomerRecord` already is, and re-derive
visibility from `PublicBusinessProfile` on every read rather than
trusting whatever was true at favorite-time — a business that turns
PRIVATE after being favorited disappears from the list without any
cleanup job or stale-data exposure window.

**Passwordless email OTP is the only credential, on Android exactly as
everywhere else, and the client never learns anything a generic
response wouldn't reveal.** `POST /v1/auth/email-otp/request` and
`/verify` are called with an email normalized the same way the backend
normalizes it (trimmed, lower-cased) so a client-side difference can
never cause a spurious "account not found"; the response is
intentionally generic regardless of whether the address has an
account, matching the backend's own account-enumeration defense
(section 2). The OTP code itself is held only in a single Compose
`TextFieldValue` inside `AuthViewModel`'s in-memory `StateFlow` — never
written to Room, DataStore, `SharedPreferences`, a log line, a crash
report, `onSaveInstanceState`, or any analytics event — and is
explicitly cleared (reset to an empty string) on every terminal
outcome: a successful sign-in, or a rejected/expired/consumed/
rate-limited verification. The field accepts numeric paste and the
platform's own SMS-style one-time-code autofill (`KeyboardType.
NumberPassword` plus the system autofill framework) without the
application ever requesting the SMS-read or SMS-retriever permission —
Kora OS delivers the code by email, never SMS, so there is nothing for
that permission to read in the first place.

**A refresh token and minimal session metadata are the only things
ever persisted for signed-in state, and they are persisted only inside
an Android Keystore-backed encrypted store.** `TokenStore` is built on
`androidx.security.crypto.EncryptedSharedPreferences`, itself backed by
a Keystore-managed `MasterKey` (AES-256-GCM), with AES-256-SIV key
encryption and AES-256-GCM value encryption — never plain
`SharedPreferences`, never Room, never a custom hand-rolled Cipher/
KeyStore integration. It stores exactly `{refreshToken, sessionId,
userId, displayName, email}`; the **access token is never persisted
anywhere** — it lives only as an in-memory field inside
`SessionManager`, is lost on process death by design, and is
transparently re-obtained through the stored refresh token on the next
cold start. If the underlying Keystore key is later invalidated (device
credentials changed, key deleted at the OS level) or the encrypted file
is otherwise unreadable, every `TokenStore` method fails safe: the
corrupted file is deleted and the caller is told "no stored session" —
never a decryption exception surfaced to the user and never a crash.

**Refresh-token rotation is single-flight, atomically replaces the
stored token before any retry, and can never loop.**
`SessionManager.refreshIfNeeded` (implementing the network layer's
`RefreshCoordinator` seam) takes a `Mutex` before touching the network;
a second caller that arrives while a refresh is already in flight for
the same failed access token waits for that lock and then simply reuses
the already-rotated token with no second network call, rather than
racing a second refresh — proven directly with two concurrent callers
against a single enqueued server response. `TokenAuthenticator` (an
OkHttp `Authenticator`, not an interceptor) retries an original request
at most once (`responseCount(response) >= 2` refuses a second retry)
and never intercepts the auth endpoints themselves at all (`auth/...`
paths are excluded before any refresh attempt), so a 401 from the
refresh endpoint's own failure can never trigger another refresh — the
one structural guarantee that rules out a refresh loop by construction,
not merely by convention. A definitive refresh rejection (the stored
refresh token was invalid, expired, or already rotated — i.e. reuse
detection tripped) clears all local session material immediately; a
transient failure (the device is offline, or the server is
unreachable) leaves the stored refresh token untouched so the user is
not signed out by a network blip, distinguished explicitly by
`DomainError` case, not by guessing from an HTTP status alone.

**Debug logging is redacted by construction; release builds carry no
network logging at all.** `SafeDebugLoggingInterceptor` (debug builds
only) logs method, a safe route template, HTTP status, and duration —
never a header, never a query parameter, never a request or response
body. Authorization headers, OTP codes, full email addresses, customer
or payment details, and invitation tokens are therefore structurally
unloggable, since the interceptor never reads the body or the
`Authorization` header at all, rather than attempting to redact them
after the fact. The release `OkHttpClient` build omits this interceptor
entirely — there is no logging code path to accidentally leave enabled
in a release build; body/header logging is never enabled in either
build variant.

**Cleartext HTTP is possible only in debug, only to the emulator's host
loopback, and is structurally impossible in release.** The base network
security config (`res/xml/network_security_config.xml`, shipped in
every build variant) sets `cleartextTrafficPermitted="false"`
unconditionally. A debug-source-set-only override
(`src/debug/res/xml/network_security_config.xml`) permits cleartext to
`10.0.2.2` alone, and that file is never included in a release
artifact — not disabled by a build flag, but physically absent from the
release APK's resources. `assertSafeReleaseApiBaseUrl` additionally
refuses to build any `Release`-variant task at all (checked once,
lazily, at task-graph-configuration time so it never breaks a plain
debug build or test run) unless the configured release API base URL is
non-blank, `https://`-prefixed, and not a localhost/`10.0.2.2`/
placeholder host — a release build with a broken or forgotten
production URL fails the build outright rather than shipping silently
pointed at a development server.

**A locally selected workspace is a UX convenience only, and can never
bypass a fresh membership check.** `LocalPreferences` (plain DataStore
— explicitly *not* sensitive, since it stores only a workspace choice,
never a token) remembers the last selected workspace
(`SelectedWorkspacePreference`: never-chosen, customer, or a specific
organization id) purely so a cold start can jump back to where the user
left off. Every cold start and every post-sign-in routing decision
re-fetches `GET /v1/me/workspaces` fresh and checks the locally
remembered selection against that live list before trusting it; a
selection that no longer appears (membership revoked, organization
suspended, subscription now `BLOCKED` in a way that removes it) is
cleared and the user is routed by the same rules as if nothing had ever
been selected — the mobile client never has, and is never given, the
authority to decide workspace access on its own.

**Location is requested only on explicit intent, only approximate, and
never persisted.** `ApproximateLocationProvider` is invoked only from
the "Near you" tap handler — never on app startup, never on a timer,
never in the background — and requests
`Priority.PRIORITY_BALANCED_POWER_ACCURACY` (coarse), never
`PRIORITY_HIGH_ACCURACY`. Only `ACCESS_COARSE_LOCATION` is declared;
`ACCESS_BACKGROUND_LOCATION` is never requested and never will be for
this feature. A resolved coordinate pair is sent to the discovery
search call and otherwise held only in `DiscoveryViewModel`'s in-memory
state for the current screen session — it is never written to Room,
DataStore, or a log line, and is discarded when the user leaves search
or explicitly clears "Near you". Denied, permanently-denied, and
service-unavailable outcomes all degrade to "text and category search
still work," never a dead end.

**Booking's idempotency key is a defense against duplicate financial
side effects, not merely a retry convenience.** A stable UUID is
generated once per distinct booking attempt (the service/provider/slot
triple) and reused verbatim across a client-side retry of that exact
attempt — never regenerated per HTTP call — so a dropped connection
during a request that actually succeeded server-side cannot produce a
second appointment when the app retries; the key is replaced only on a
terminal outcome (success, or a `SLOT_UNAVAILABLE` conflict, since that
specifically means the previously-targeted slot is gone and any further
attempt is necessarily a different booking). The client never computes
whether a slot is available, whether a cancellation is within policy,
or what a booking costs — every one of those figures and decisions
comes from the server response and is only ever displayed, never
derived.

**Explicitly out of scope for this stage, and not implemented on
Android:** queue commands, service-session commands, checkout, payment
recording or verification, refunds, cash-session operations, commission
management, and receipt management. No screen, button, or state in the
Android application this stage represents any of those operations as
available, and the business dashboard calls the reports endpoint at all
only for a membership that already holds `reports.read` — a membership
without it never triggers that network call, so there is no `403`
response for that case to even occur.

## 37. Business onboarding, entitlement, and privilege-escalation fixes

Found and closed while building the second Android business-side
integration stage (docs/ROADMAP.md, docs/API_SPEC.md section 33).

**A real privilege-escalation gap: any membership holding
`staff.invite` could invite a new staff member directly as `owner`.**
Ownership was never meant to be grantable through the ordinary
staff-invitation path — it is meant to be a distinct, deliberately
unimplemented future transfer workflow. `StaffInvitationService.create()`
now throws `403 OWNER_ROLE_NOT_INVITABLE` for `role.code === 'owner'`
before any other work happens, and the new
`GET .../staff-invitations/assignable-roles` endpoint excludes `owner`
from the list a client would even present. Covered by a dedicated e2e
test asserting the 403 and that no invitation row is created.

**Staff entitlement limits are now enforced atomically under
concurrency, not just checked-then-written.** Invitation creation
previously counted active memberships and pending invitations, compared
against the subscription's `staff.max` entitlement, and then wrote the
new row — three separate steps with no lock between them, so two
concurrent requests against a plan with exactly one remaining seat
could both pass the count check before either write landed, exceeding
the entitlement. The entire `create()` body now runs inside one
`$transaction` that row-locks the organization's subscription
(`SELECT id FROM organization_subscriptions WHERE organization_id = ...
FOR UPDATE`) before counting and comparing, using
`EntitlementsService.resolveForOrganization(organizationId, tx)`
against the *same* transaction client so the count is read consistently
with the lock. Exceeding the limit returns `409 STAFF_LIMIT_REACHED`.
Verified directly with a test that fires two concurrent invitation
requests against a dedicated test plan with a 2-seat staff limit and
asserts exactly one succeeds — not merely that a sequential check
works.

**Organization creation is idempotent under retry and under genuine
concurrency, following the same pattern payments/checkout/corrections
already established, not a new one.** A required `Idempotency-Key`
header, a pre-check against a per-owner-user
`OrganizationIdempotencyKey` row, and a reactive catch of the
underlying unique-constraint violation inside the same transaction
together mean a network-retried "create business" request can never
create two organizations, two owner memberships, two trial
subscriptions, or two first branches — and a genuinely different
payload attempting to reuse an old key is rejected
(`409 IDEMPOTENCY_CONFLICT`) rather than silently returning stale data
or silently succeeding twice.

**The new `GET .../branches` endpoint (docs/API_SPEC.md section 33) is
deliberately minimal and read-only, not a reopening of branch
management.** It requires only the same active-membership check every
bare organization-detail route already requires (`TenantAccessGuard`,
no additional permission), returns only branch identity fields already
non-sensitive elsewhere (`BranchDto`'s existing shape), and excludes
archived branches. It exists solely to let a client resolve a branch id
after the fact; it does not create, update, or archive anything, and
full branch CRUD remains explicitly out of scope.

## 38. Staff invitation deep link and acceptance security (Android)

The invitation-accept API contract itself
(`GET/POST /v1/staff-invitations/:token/preview|accept|reject`) already
existed before this stage and is unchanged; what is new is the Android
client that consumes it through a deep link, and the verification that
its core security property holds end to end against the real backend.

**The invited email, not any client-supplied role or branch data, is
the only thing that determines who may accept.** The deep link
(`kora://invite/{token}`) carries nothing but an opaque, high-entropy
token — never a role, a branch, or an organization id — and the server
independently re-resolves all of that from the token itself on every
call. Android never trusts anything about the invitation beyond what
`GET .../preview` and `.../accept` return in response to that token.
Verified directly: accepting while authenticated as a different email
(the organization's own owner, in a real test against a running
backend) returned `403`, the app displayed a specific "this invitation
was sent to a different email address" message rather than a generic
error, and no membership was created for that organization as a result
— confirmed by querying `organization_memberships` directly and
finding the count unchanged. Accepting after signing out, then signing
back in with the *invited* email through the ordinary passwordless OTP
flow, succeeded and created exactly one new `ACTIVE` membership with
the invited role; the invitation's own status moved from `PENDING` to
`ACCEPTED` server-side.

**The raw token is never logged, never put in analytics or crash
messages, and lives only in memory.** `MainActivity.extractInvitationToken`
reads it from the incoming `Intent` and stores it only in
`AppContainer.pendingInvitationToken` (a Compose `MutableState`, not
persisted to `LocalPreferences`, Room, or `SharedPreferences`); it is
cleared on every terminal outcome (accepted, rejected, or the user
navigates away) by the Composable layer, not by the ViewModel, keeping
the ViewModel itself Compose-free. No process-death restoration of a
pending token is attempted — a token lost to process death simply
requires reopening the link, a deliberate, documented safety choice
over persisting it anywhere durable.

**The one-time invitation-creation token receives the same
never-persisted treatment on the owner's side of the exchange.**
`CreateStaffInvitationResponseDto.rawToken` is shown to the inviting
owner exactly once, in a dialog with Copy (to the system clipboard,
under the user's own control) and Share (a standard `ACTION_SEND`
chooser, also user-directed) actions, then cleared from view-model
state on dismissal. It is never written to `LocalPreferences` or any
other persistent store, and the invitation-list endpoints
(`GET .../staff-invitations`, the team directory) never return a token
or its hash — only the database's `tokenHash` column exists after
creation, confirmed directly by inspecting the stored row (a 64-character
hex digest, not the raw value).

**The deep link is a development-only custom URI scheme, not a
production security boundary.** `kora://invite/{token}` is not a
verified Android App Link — no production domain or hosted
`assetlinks.json` exists, so Android cannot cryptographically confirm
this app is the legitimate handler for that scheme the way a verified
`https://` App Link would. This is an explicit, documented release
prerequisite (docs/ROADMAP.md), not an oversight: the token itself
remains the actual security boundary (high-entropy, single-use,
server-validated, hashed at rest) regardless of which app happens to
receive the intent, so the missing App Link verification is a
phishing/spoofing-surface concern for a future release, not a way for
an unintended party to actually accept someone else's invitation.

**Invitation status states are rendered as distinct, safe UI, not
collapsed into one generic "invalid" case.** `InvitationViewModel`
distinguishes `PENDING`, `ACCEPTED`, `DECLINED`, `REVOKED`, and expired
(`isExpired` on an otherwise-`PENDING` invitation) explicitly, so a
staff member opening a stale or already-used link sees an accurate
reason rather than a misleading generic failure.
