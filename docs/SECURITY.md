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
