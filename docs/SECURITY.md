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

- Money uses integer minor units and explicit currency codes.
- Server code calculates prices, discounts, taxes, totals, commissions, and expected reconciliation values.
- Client-submitted totals are never trusted as authoritative.
- Payment recording, refund, void, verification, and dispute-resolution commands require stable idempotency keys.
- The server fingerprints idempotent requests and rejects key reuse with different content.
- Financial state changes use database transactions, validated state machines, optimistic concurrency, audit events, and transactional outbox records.
- Confirmed financial facts are corrected with reversals or adjustments, not hidden edits.
- Commission is finalized only after a verified outcome and reversed explicitly when necessary.
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
