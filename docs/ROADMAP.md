# Kora OS Delivery Roadmap

Status: Foundation baseline

## 1. Delivery principle

Kora is developed as a sequence of working, testable vertical foundations. A phase is complete only when its code, database behavior, authorization, error handling, tests, documentation, and operational evidence meet the stated exit gate.

Calendar promises are not assigned until the backend foundation is measured. Sequence and quality gates take priority over artificial dates.

## 2. Current baseline

Completed:

- Private GitHub repository with `main` and `develop` branches.
- Original Google AI Studio Android project preserved in Git history.
- Gradle wrapper restored.
- Exported unit tests repaired.
- Application rebranded from Chairside to Kora OS internally and visually.
- Google Play `applicationId` preserved for update continuity.
- Official Kora logo integrated.
- Kora dark navy and gold design tokens established.
- Bottom navigation and dashboard hierarchy refined.
- Android compilation, unit tests, debug assembly, emulator installation, and launch verified.
- `apps/api` NestJS scaffold with strict TypeScript, environment validation, standard response/error contracts, request IDs, and health/readiness endpoints.
- Local PostgreSQL 18.6 development environment (Docker, `kora-postgres`).
- Prisma 7 foundation: `prisma.config.ts`, the full identity/tenancy/workforce/subscription/audit schema, the first migration (`foundation_identity_tenancy_subscriptions`), and an idempotent seed for permissions, system roles, entitlement definitions, and the Starter/Growth/Business/Enterprise plan shells (no commercial prices set).
- `/v1/readiness` reports real database connectivity alongside API liveness.
- Internal tenancy services (organization onboarding, entitlement resolution, subscription access-mode resolution, append-only audit/subscription-event recording) now sit behind real authenticated, authorized HTTP endpoints — see the next three items.
- Passwordless email OTP authentication (Kora OS does not store or support user passwords — a brief development-only password implementation was replaced before any production use; see the `remove_password_authentication` migration): a cryptographically random, at-least-6-digit code stored only as a keyed HMAC-SHA256 digest, scoped to a provider-neutral `AuthIdentity` (ready for phone OTP, email magic-link, Apple, and Google later without a schema change), short-lived JWT access tokens carrying no role/permission claims, rotating opaque refresh tokens with reuse detection that revokes the affected session, and rate limiting by both normalized email and request IP. The request/verify pair is both sign-up and sign-in. Routes: `POST /v1/auth/email-otp/{request,verify}`, `POST /v1/auth/refresh`, `POST /v1/auth/{logout,logout-all}`, `GET /v1/auth/{me,sessions}`, `DELETE /v1/auth/sessions/:sessionId`.
- Organization-scoped RBAC and subscription enforcement, applied per route via `TenantAccessGuard`: active membership, the union of permissions across every role a membership holds, explicit branch assignment (or the broad `branches.manage` permission), and the organization's subscription access mode (`BLOCKED` denies everything, `READ_ONLY` denies mutations) — all resolved fresh from the database on every request, never cached or trusted from a token or request body.
- Authenticated organization management (`POST`/`GET /v1/organizations`, `GET /v1/organizations/:organizationId`) and staff invitations (create/view/accept/reject/revoke under `/v1/organizations/:organizationId/staff-invitations` and `/v1/staff-invitations/:token`) — invitation tokens are single-use, hashed, organization- and role-specific, and optionally branch-specific.
- Public business discovery (`GET /v1/discovery/businesses`, `/businesses/:slug`, `/businesses/:slug/branches`, `/categories`) backed by `PublicBusinessProfile`/`BusinessCategory`/branch discovery fields, plus owner/manager profile-management endpoints under `/v1/organizations/:organizationId/business-profile`.
- Service catalogue (`ServiceCategory`, `Service`, `BranchService` branch-level overrides, `StaffServiceAssignment`) with full CRUD under `/v1/organizations/:organizationId/service-categories`, `/services`, and `/branches/:branchId/services{,/:serviceId/staff}`, gated by `services.read`/`services.manage`. A service is archived, never hard-deleted, once anything references it; every appointment keeps its own name/duration/price/currency snapshot regardless of later catalogue edits.
- Branch business hours (`BranchBusinessHours`, weekly recurring), specific-date exceptions (`BranchScheduleException`: closed, special hours, holiday, emergency closure), and a centralized per-branch `BranchBookingPolicy` (slot interval, lead time, horizon, buffers, cancellation cutoff, provider-selection rules) under `/v1/organizations/:organizationId/branches/:branchId/{business-hours,schedule-exceptions,booking-policy}`, gated by the new `availability.read`/`availability.manage` permissions. `Branch.timeZone` (already IANA-identified since the tenancy foundation) is now format-validated at organization creation.
- Staff availability (`StaffAvailabilityRule` weekly recurring per branch, `StaffAvailabilityException` for time off/sick leave/holiday/added special availability, full- or partial-day) under `.../staff/:staffProfileId/availability-{rules,exceptions}` — deliberately separate from branch hours; a provider is bookable only where both intersect.
- A deterministic availability engine (`AvailabilityEngineService`) resolving effective price/duration, eligible providers, the branch/staff schedule intersection, exceptions, lead time, horizon, and buffers into concrete UTC slots — exposed publicly (`GET /v1/discovery/businesses/:slug/branches/:branchId/{services,services/:serviceId/providers,availability}`, respecting PUBLIC/LINK_ONLY/PRIVATE visibility the same way the rest of discovery does) and to authenticated staff (`GET /v1/organizations/:organizationId/branches/:branchId/availability`). Results are advisory; booking creation revalidates atomically.
- The customer workspace is now self-service: `GET`/`PATCH /v1/me/customer-profile` (display name, phone, city/area, and location only when the customer explicitly provided it, with its own consent timestamp).
- Atomic appointment booking (`Appointment`, `AppointmentItem` snapshots, `AppointmentStatusHistory`, `AppointmentIdempotencyKey`) for both the customer app (`POST`/`GET /v1/me/appointments`, `/:id`, `/:id/cancel`, `/:id/reschedule`) and staff-assisted bookings (`.../branches/:branchId/appointments{,/:id,/:id/cancel,/:id/reschedule,/:id/no-show}`, gated by `appointments.read`/`appointments.manage`). Double-booking is prevented at the database level by a PostgreSQL `EXCLUDE` constraint (`btree_gist`) on the assigned staff member and the occupied UTC time range, not only by the availability screen; a client-generated idempotency key makes repeated/retried booking requests return the original appointment rather than a duplicate. Server-resolved price, duration, staff eligibility, and subscription state are never accepted from the client.

Current limitations:

- Room is still the only working data store on Android and contains demonstration-oriented local behavior.
- No real email delivery provider is integrated yet (`EmailOtpSender` fails closed in production; development delivers through a local, credential-free Mailpit container over SMTP — see docs/SECURITY.md section 6); phone OTP and any external identity provider (Apple, Google) remain unimplemented.
- Role/permission *management* endpoints (creating custom roles, editing a membership's roles or branches) are not implemented; every role assignment today comes from the seeded system roles via staff invitation.
- Current Android roles are simulated locally and are not security controls, and Android does not yet call this API at all.
- Payments and subscriptions are not connected to an authoritative backend, and no billing provider is integrated.
- Walk-ins/live queue, service sessions, and everything downstream of them (checkout, payments, commissions, receipts) do not exist yet. A CONFIRMED appointment is a reservation only — it is not a ServiceSession, a Payment, or a Transaction, and is never treated as proof that work happened or that revenue was earned; that connection is a future phase's job (docs/SECURITY.md section 30).
- Android is the only implemented client, and does not yet call any of the service-catalogue, availability, or appointment endpoints above.

### Implementation sequence for the remaining work

Kept intentionally concise — each item expands into its own phase below once it starts, and is not built ahead of that phase. Items 1–3 (authentication/sessions/staff invitations; organization-scoped RBAC, branch authorization, and subscription enforcement; services, staff availability, and customer appointment booking) and public business discovery are done — see "Current baseline" above — so the active boundary starts at item 4:

1. ~~Authentication, sessions, and staff invitations.~~ Done.
2. ~~Organization-scoped RBAC and branch authorization.~~ Done, including subscription-access-mode enforcement.
3. ~~Services, staff availability, and atomic customer appointment booking.~~ Done — see "Current baseline" above. Role/permission *management* endpoints (as opposed to RBAC *enforcement*, already done in item 2) remain a carry-over gap.
4. Walk-ins and live queues — the next boundary. Appointments already exist (item 3); this item is specifically the unscheduled, same-day operational flow and the branch queue built around it.
5. Service sessions representing actual work performed — the first thing allowed to imply an appointment was fulfilled.
6. Transactions, line items, and checkout.
7. Payments, provider verification, and disputes.
8. Commissions, reconciliation, and receipts.
9. Subscription billing-provider integration.
10. Real-time owner dashboard and notifications.
11. Kora Team business messaging.
12. Public customer booking — builds directly on the discovery slugs/branch IDs already returned today.
13. Offline mobile synchronization.
14. Android API integration.
15. iOS mobile application.
16. Production hardening, monitoring, backups, and tenant-isolation testing.

## 3. Branch and release workflow

- `main` represents releasable production history.
- `develop` contains integrated development work.
- Short-lived feature branches may be introduced once concurrent work begins.
- Every integration requires green checks and an understandable commit.
- Release tags identify tested mobile and API combinations.
- Database migrations are versioned with the backend release that requires them.

## 4. Phase 0 — Product and architecture baseline

Deliverables:

- `PRODUCT_REQUIREMENTS.md`
- `ARCHITECTURE.md`
- `DATA_MODEL.md`
- `API_SPEC.md`
- `SECURITY.md`
- `ROADMAP.md`

Exit gate:

- All core lifecycle, subscription, tenant, financial, offline, and audit requirements have an implementation destination.
- Deferred provider choices do not block schema or module boundaries.
- Documentation contains no contradiction that would force a major rewrite.

## 5. Phase 1 — Repository and backend engineering foundation

Deliverables:

- `apps/api` modular backend scaffold.
- TypeScript strict configuration.
- Environment validation with safe examples and no secrets.
- Health, readiness, version, and request-ID infrastructure.
- Standard response and error contracts.
- Structured logging and sensitive-value redaction.
- Unit and integration test harnesses.
- Local PostgreSQL and Redis development environment.
- CI checks for Android and API compilation, tests, formatting, and secret scanning.

Exit gate:

- A fresh clone can start required local dependencies and run all documented checks.
- API health and readiness accurately reflect dependency state.
- No production credential is required for local development.
- Android remains green and unchanged in behavior.

## 6. Phase 2 — Database, tenancy, and subscription foundation

Deliverables:

- Initial reviewed PostgreSQL migration.
- Identity, organization, branch, membership, role, permission, subscription, audit, outbox, and idempotency tables.
- Tenant-scoped repository interfaces.
- Baseline system roles and permission seed data.
- Configurable Starter, Growth, Business, and Enterprise plan records.
- Trial and effective-access-mode policies.
- Database transaction and outbox helpers.

Critical tests:

- Same-tenant relationships succeed.
- Cross-tenant relationships and queries fail.
- Concurrent branch or staff creation cannot exceed entitlements.
- Subscription expiration changes access mode without deleting data.
- Audit events cannot be updated through application access.

Exit gate:

- Migrations apply to an empty database and a representative previous schema.
- Tenant-isolation tests pass at repository and API-policy layers.
- Subscription limits are server-enforced.

## 7. Phase 3 — Identity and organization onboarding

Status: backend deliverables done; Android deliverables not started (this
phase's Android work is intentionally deferred until item 14 of the
implementation sequence above — API integration — rather than built
ahead of a client that would consume it).

Deliverables:

- Passwordless email OTP sign-up/sign-in, refresh, logout, and rotating revocable sessions. Done — see docs/SECURITY.md section 6; there is no password-based registration or login, and none is planned.
- Real email delivery for the OTP code. Not done — `EmailOtpSender` fails closed in production until a provider is integrated (no email/SMS provider integrated yet).
- Owner organization creation transaction. Done.
- First branch, owner membership, roles, and eligible trial created atomically. Done.
- Staff invitation creation, acceptance, decline (implemented as reject), revoke, and expiry. Done.
- Android authentication and organization-selection screens. Not started.
- Secure Android credential storage. Not started.

Critical tests:

- Token replay and revoked sessions are rejected. Done (`test/auth.e2e-spec.ts`).
- Invitation tokens are single-use, scoped, hashed, and expiring. Done (`test/organizations-and-invitations.e2e-spec.ts`).
- One identity can join two organizations without data leakage. Done (`test/organizations-and-invitations.e2e-spec.ts`, plus the original onboarding coverage in `test/onboarding.e2e-spec.ts`).
- Failed onboarding does not leave partial tenant records. Done (`test/onboarding.e2e-spec.ts`).

Exit gate:

- Two real emulator installations can sign in as different users and observe only their authorized organizations. Blocked on Android API integration (item 14).
- Local role simulation is no longer treated as security. Still true locally until Android switches over; the backend itself already treats only server-resolved roles/permissions as authoritative.

## 8. Phase 4 — Staff, roles, branches, and services

Deliverables:

- Multiple role assignment and branch scope. Done — enforcement
  (`TenantAccessGuard`) and assignment (via staff invitation acceptance)
  both exist; authoring custom roles or editing an existing membership's
  roles/branches after acceptance does not yet have an endpoint.
- Staff profile, services, availability, and time-off. `StaffProfile` is
  created automatically on invitation acceptance. Services (`Service`,
  `ServiceCategory`, `BranchService` overrides) and staff availability
  (`StaffAvailabilityRule` recurring, `StaffAvailabilityException` for
  time off/sick leave/holiday/special availability) are done. Time-off
  is the `StaffAvailabilityException` types above, not a separate model.
- Branch create, update, activate, and deactivate. Branches are created
  once, atomically, during organization onboarding; standalone branch
  management endpoints do not exist yet. Branch *discovery* fields, and
  now branch business hours/schedule exceptions/booking policy, do have
  dedicated update endpoints (see docs/API_SPEC.md sections 10 and 13).
- Service categories and service catalog. Done —
  `/v1/organizations/:organizationId/service-categories` and `/services`,
  archival instead of hard delete, branch-level price/duration/
  bookability overrides via `/branches/:branchId/services/:serviceId`.
- Service-provider assignment. Done —
  `/v1/organizations/:organizationId/branches/:branchId/services/:serviceId/staff`,
  refused unless the staff member holds an active membership and an
  explicit assignment to that branch.
- Initial commission rule configuration. Not started.
- Android owner and manager configuration flows. Not started.

Critical tests:

- Cashiers cannot edit commission rules. Not yet applicable — no commission rules exist.
- Branch-restricted staff cannot access another branch. Done (`test/organizations-and-invitations.e2e-spec.ts`, plus every branch-scoped route added in this phase — `test/service-catalogue.e2e-spec.ts`, `test/scheduling-and-availability.e2e-spec.ts`).
- Staff and branch entitlement limits cannot be bypassed concurrently. Entitlement resolution itself is done and tested (Phase 5, `EntitlementsService`); enforcing `staff.max`/`branches.max` against invitation acceptance and branch creation is not wired up yet.
- Historical line-item prices remain unaffected by catalog edits. Done (`test/service-catalogue.e2e-spec.ts`: an `AppointmentItem` snapshot is provably unchanged after the underlying `Service` is edited).

Exit gate:

- An owner can configure a real business and invite a working team without seed data.

## 9. Phase 5 — Customers, scheduling, queue, and service sessions

Deliverables:

- Organization-scoped customer profiles and search. `CustomerRecord` is
  created (or reused) automatically on a customer's first booking with an
  organization; a dedicated search/list endpoint is not built yet — see
  docs/ROADMAP.md item 4 (walk-ins/queue) and the future CRM item in
  post-V1 extensions. The global customer workspace itself
  (`GET`/`PATCH /v1/me/customer-profile`) is done.
- Provider availability calculation. Done — `AvailabilityEngineService`
  (docs/ARCHITECTURE.md section 6), exposed publicly through discovery
  and to authenticated staff.
- Appointment create, confirm, check-in, cancel, and no-show. Create is
  always CONFIRMED (there is no separate unconfirmed/requested state);
  cancel and no-show are done. Check-in does not exist yet — it belongs
  to the walk-in/queue phase below, where an appointment's customer
  actually arrives.
- Walk-in creation and live branch queue. Not started (item 4 of the
  implementation sequence).
- Queue call, assign, move, start, complete, and cancel actions. Not
  started — depends on the queue above.
- Service-session aggregate and provider attribution. Not started.
  Deliberately: a CONFIRMED `Appointment` is a reservation only, never
  treated as evidence that work happened or that revenue was earned
  (docs/SECURITY.md section 30) — only a future `ServiceSession` can
  establish that.
- Android operational screens connected to the API with cached reads. Not started.

Critical tests:

- Conflicting provider bookings are rejected. Done — a PostgreSQL
  `EXCLUDE` constraint (`appointments_no_staff_double_booking`,
  `btree_gist`) on the assigned staff member and the occupied UTC time
  range, proven under real concurrent requests
  (`test/appointment-booking.e2e-spec.ts`: 6 simultaneous identical
  booking requests, exactly 1 succeeds).
- Walk-ins work without appointments. Not yet applicable — walk-ins do not exist yet.
- Appointments do not require payment records. Done — `Appointment` has
  no relationship to any payment/transaction concept, which do not exist
  yet either.
- Service sessions preserve the staff member who performed each item. Not yet applicable — service sessions do not exist yet.
- Concurrent queue changes resolve through revisions or conflicts. Not yet applicable — the queue does not exist yet. (`Appointment.version` already provides the same optimistic-concurrency pattern for reschedule/cancel races.)

Exit gate:

- A receptionist and provider on separate emulator sessions can complete the operational flow through service completion. Blocked on Android API integration (item 14) and the walk-in/queue/service-session work above; the backend booking half (create, cancel, reschedule, no-show, double-booking prevention, idempotency) is done and tested.

## 10. Phase 6 — Financial core and verification

Deliverables:

- Authoritative checkout preview and transaction creation.
- Multi-line transactions with price snapshots.
- Manual cash, mobile money, card, transfer, online, and other payment recording.
- Transaction, payment, and verification state machines.
- Provider confirmation and dispute.
- Manager resolution.
- Refund and void foundations.
- Financial idempotency and optimistic concurrency.
- Android checkout, verification, dispute, and transaction history connected to the API.

Critical tests:

- Cashier records payment; provider confirms; transaction confirms once.
- Provider dispute prevents commission finalization.
- Manager resolution requires permission and reason.
- Repeated payment commands return the original result without duplicates.
- Lost network responses do not produce a second payment.
- Cross-tenant payment access is denied.
- Refunds create explicit reversal history.

Exit gate:

- Every financial outcome is reconstructable through records, versions, state transitions, idempotency evidence, and audit events.

## 11. Phase 7 — Commissions, receipts, reconciliation, and reports

Deliverables:

- Percentage, fixed, service-specific, and tiered commission strategies.
- Finalized and reversed commission records with calculation snapshots.
- Stable receipt numbering and receipt snapshots.
- Digital receipt viewing and safe sharing foundation.
- Cash-session opening, submission, variance, approval, and rejection.
- Owner dashboard and basic daily reports backed by verified server data.

Critical tests:

- Only verified transaction value produces finalized commission.
- Refunds reverse affected commission correctly.
- Expected cash is server-calculated.
- Receipt history does not change after service or staff edits.
- Reports separate recorded, verified, disputed, refunded, and outstanding value.

Exit gate:

- An owner can remotely reconcile a branch day and trace every displayed figure to source transactions.

## 12. Phase 8 — Mobile synchronization and resilience

Deliverables:

- Repository separation between API, Room cache, domain, and UI.
- Organization-safe cached services, customers, appointments, queues, and summaries.
- Pending-command store and synchronization worker for approved operations.
- Explicit pending, synchronized, retryable failure, rejected, and conflict UI states.
- Connectivity-aware refresh and bounded retry policies.
- Migration away from destructive Room fallback behavior.

Critical tests:

- Organization switching cannot reveal prior cached data.
- Offline reads show clear freshness information.
- Retried commands preserve their idempotency key.
- Session revocation clears protected cached access.
- Schema migration preserves supported local data.

Exit gate:

- Core non-financial work survives temporary connectivity loss, and supported financial retries cannot create duplicates.

## 13. Phase 9 — Notifications, realtime operations, and focused communication

Deliverables:

- Transactional outbox processing.
- In-app and push notification delivery.
- Payment verification, dispute, appointment, queue, invitation, and subscription notification policies.
- Realtime queue and dashboard invalidation events.
- Delivery attempts, retries, dead-letter handling, and diagnostics.
- Focused organization announcements and transaction-linked discussion if included in the first commercial release.

Exit gate:

- Failure of a delivery provider never corrupts business state.
- Authorized devices receive relevant events without cross-tenant leakage.
- Reconnection refreshes authoritative state.

## 14. Phase 10 — Subscription billing integration

Deliverables:

- Selected billing-provider adapter.
- Store-policy-compliant mobile purchase or account-management experience.
- Signed and idempotent webhook processing.
- Upgrade, downgrade, renewal, cancellation, grace, and restoration flows.
- Billing reconciliation and support evidence.
- Usage-based accounting hooks for separately charged communication services.

Critical tests:

- Forged and replayed provider events fail.
- Out-of-order events converge to the correct subscription state.
- Mobile clients cannot grant themselves entitlements.
- Past-due and expired access modes preserve permitted recovery and export paths.

Exit gate:

- A test organization can complete the complete subscription lifecycle in provider sandbox environments.

## 15. Phase 11 — Production hardening and Android launch

Deliverables:

- Staging and production environments.
- Managed PostgreSQL backups and tested restoration.
- Monitoring, alerting, error tracking, and operational dashboards.
- Rate limits, abuse controls, and security headers.
- Privacy, retention, export, and deletion procedures.
- Accessibility, performance, device, and poor-network test passes.
- Independent security review before meaningful financial volume.
- Play Store release signed as an update to the existing application ID.
- Rollout, rollback or forward-fix, support, and incident-response runbooks.

Exit gate:

- All critical tests pass in staging.
- Recovery and incident procedures are rehearsed.
- No unresolved critical security or financial-integrity finding remains.
- A controlled pilot group can run real daily operations.

## 16. Phase 12 — iOS foundation

This phase may begin earlier after API contracts and shared boundaries stabilize, but it must not delay Android production foundations.

Deliverables:

- Proven shared Kotlin Multiplatform boundary for contracts, domain types, and networking where it reduces risk.
- Final decision between Compose Multiplatform UI and native SwiftUI presentation.
- iOS secure storage, session, networking, push, cache, and accessibility implementations.
- Equivalent tenant, subscription, operational, and financial behavior.
- App Store signing, policy, privacy, and release preparation.

Exit gate:

- Critical workflows pass the same contract and state-transition suites as Android.
- Platform-specific security and accessibility checks pass.

## 17. Post-V1 extensions

- Public customer booking.
- Customer mobile account and receipt history.
- SMS, WhatsApp, and email delivery providers.
- Inventory, suppliers, stock movements, and product sales.
- Loyalty, memberships, deposits, and richer CRM.
- Advanced reporting and data warehouse pipeline.
- Platform administration and support tooling.
- Additional service-business vertical templates.
- Controlled AI business intelligence over authorized structured APIs.

## 18. Decisions required at phase boundaries

- Before Phase 3: authentication and verification delivery provider.
- Before Phase 9: push and external communication providers.
- Before Phase 10: subscription provider, countries, prices, tax handling, and mobile-store obligations.
- Before Phase 11: production hosting region, recovery objectives, retention periods, and support ownership.
- Before Phase 12: iOS presentation technology after a small technical proof.

These are deliberate decision points, not reasons to weaken the current foundation.

## 19. Program-level release gates

Every release candidate must pass:

- Android and API compilation.
- Unit and integration tests.
- Tenant-isolation and permission tests.
- Financial state-machine and idempotency tests where applicable.
- Database migration verification.
- Secret and dependency scanning.
- Accessibility and representative-device smoke tests.
- Documentation and runbook review for changed behavior.

## 20. Immediate next step

Historical: after the six foundation documents were committed, `apps/api`
was scaffolded with strict configuration, health and readiness endpoints,
environment validation, standard errors, request IDs, tests, and a local
PostgreSQL dependency (Redis has not been needed yet — nothing built so
far requires bounded caching, job queues, or realtime coordination).

Current: the database/tenancy foundation (this document's Phase 2),
authentication and sessions, organization-scoped RBAC and subscription
enforcement, staff invitations, public business discovery, the service
catalogue, branch/staff scheduling, the availability engine, and atomic
customer and staff-assisted appointment booking (with database-enforced
double-booking prevention and idempotent booking commands) are done —
see "Current baseline" above. The next step is item 4 of the
implementation sequence: walk-ins and the live branch queue, the last
piece Phase 5 above needs before service sessions (item 5) — the first
concept allowed to imply an appointment was actually fulfilled — can
begin. No further feature module is implemented until each prior one's
quality gates (tests, lint, build, migration status) are green, per this
document's delivery principle.
