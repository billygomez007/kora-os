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
- Walk-in intake, appointment check-in, a live branch queue, and service sessions (`BranchQueueDay`, `QueueEntry`, `QueueEntryService`, `QueueEntryStatusHistory`, `ServiceSession`, `ServiceSessionItem`, `ServiceSessionStatusHistory`) under `/v1/organizations/:organizationId/branches/:branchId/queue/walk-ins`, `.../appointments/:appointmentId/check-in`, `.../queue`, `.../queue-entries/:id/*`, and `.../service-sessions{,/:id,/:id/items,/:id/complete,/:id/cancel}` (docs/API_SPEC.md sections 16-17), gated by `queue.read`/`queue.manage` and `service_sessions.read`/`.start`/`.perform`/`.manage`. Ticket numbers are issued atomically per branch-local business date; at most one active service session per staff member and per queue entry is enforced by two partial PostgreSQL unique indexes, not only an application check. `ServiceSessionStatusHistory` is the session's own append-only lifecycle ledger, distinct from and complementing the platform-wide `AuditEvent` trail. `service_sessions.start` lets a receptionist start service for a queue entry's already-assigned provider without granting the ability to complete, cancel, or edit that session — a least-privilege permission checked via a new `@RequireAnyPermission` guard mechanism plus a fine-grained service-layer rule. `Appointment` is a reservation, `QueueEntry` is a customer present at a branch, and `ServiceSession` is work actually performed — kept strictly separate, with no `Payment`, `Transaction`, `Receipt`, or `Commission` concept anywhere in this phase (docs/SECURITY.md sections 31-32).
- The financial-integrity core: `Checkout` (turns one completed `ServiceSession` into an amount due, with append-only adjustments and voiding), `PaymentRecord` (a staff member's *claim* that money was received, manually recorded — CASH/MOBILE_MONEY/CARD/BANK_TRANSFER/OTHER, no payment-gateway integration), provider confirmation and dispute (`PaymentVerificationEvent`, `PaymentDispute`), owner/manager dispute resolution, and an immutable, automatically-posted `Transaction` — the only thing a future reporting phase may count as revenue. Endpoints under `.../service-sessions/:id/checkout`, `.../checkouts{,/:id,/:id/adjustments,/:id/void,/:id/payments}`, `.../payments/:id/{confirm,dispute,void}`, `.../payment-verifications/pending`, `.../payment-disputes{,/:id,/:id/resolve}`, and `.../transactions{,/:id}` (docs/API_SPEC.md sections 18-19), gated by the new `checkouts.*`/`payments.read`/`.record`/`.verify_own`/`.resolve`/`transactions.read` permissions. A recorder who is also the assigned provider can never self-confirm their own claim; a solo owner/provider's only way past that deadlock is an explicitly reasoned, separately audited management override. Exactly one `Transaction` is ever posted per `Checkout`, even under concurrent confirmations, via a `SELECT ... FOR UPDATE` lock on the `Checkout` row that every payment mutation acquires first (docs/SECURITY.md section 33, docs/ARCHITECTURE.md sections 11-12). Refunds and reconciliation remain unimplemented — deferred to a later phase.
- Commission accrual, service receipts, and owner/manager reporting — the stage after a `Transaction` posts. Versioned `CommissionRule`s (PERCENTAGE/FIXED/NONE, independently scoped by branch/staff/service, an eight-level precedence, superseded rather than edited in place, unique-per-scope enforced by a partial `NULLS NOT DISTINCT` database index) resolve to an immutable `CommissionAccrual` per line item — a zero-value `NO_POLICY` accrual when nothing matches, never a blocked posting. An immutable `Receipt` (`{branchCode}-{year}-{sequence}` numbering, an atomic per-branch/year counter) is issued in the same database transaction as the accruals and the `Transaction` itself — the full chain commits or rolls back together. Endpoints under `.../commission-rules{,/:id,/:id/supersede,/:id/deactivate}`, `.../commissions`, `.../me/earnings`, `.../receipts{,/:id}`, `/me/receipts{,/:id}`, and `.../reports/{overview,revenue,staff-performance,services,payment-methods,commissions}` (docs/API_SPEC.md sections 20-22), gated by the new `commissions.read_own`/`.read_all`/`.manage`, `receipts.read`, and `reports.read` permissions. Every report figure derives only from a POSTED `Transaction` and its snapshots — a RECORDED/DISPUTED payment claim never inflates revenue, and every monetary total stays strictly separated by currency (docs/SECURITY.md section 34, docs/ARCHITECTURE.md section 21).
- Branch cash controls, refund/reversal corrections, commission adjustments, corrective receipts, and gross/net reporting — the stage after commissions/receipts/reports. A per-branch `BranchCashPolicy` (OPTIONAL by default, or REQUIRED) governs whether recording a CASH payment or a CASH refund needs an open `CashSession` on a named `CashRegister`; every session's append-only `CashLedgerEntry` rows (OPENING_FLOAT/PAYMENT_RECEIVED/CASH_IN/CASH_OUT/SAFE_DROP/REFUND_PAID, always a positive magnitude) compute a physical drawer-custody `expectedClosingCashMinor` at close time (opening float + cash payments + manual cash in − manual cash out − safe drops − cash refunds) — a variance from the counted amount, reviewed with a MATCHED/ACCEPTED_VARIANCE/INVESTIGATION_REQUIRED outcome, never itself revenue. A `TransactionCorrection` (REFUND, partial or full, cumulative-capped against the remaining refundable line amounts; or REVERSAL, one full negation, only before any prior refund/reversal) moves REQUESTED → APPROVED/REJECTED/CANCELLED → EXECUTED, with the requester barred from approving or rejecting their own request except a solo owner's explicitly reasoned, separately audited override; execution locks the original SALE `Transaction` and every other correction against it before recomputing what remains, then atomically posts one immutable REFUND/REVERSAL `Transaction` (a new `kind` column, `SALE`/`REFUND`/`REVERSAL`, direction always derived from `kind` since every stored amount stays a non-negative magnitude), its own corrective `CommissionAccrual` rows (REFUNDED/REVERSED, calculated only from the original EARNED accrual's own immutable snapshot — never the current `CommissionRule`), a corrective `Receipt` (`REFUND_RECEIPT`/`REVERSAL_RECORD`, referencing the original sale receipt, never called a tax invoice or credit note), and a `REFUND_PAID` cash-ledger entry when returned in cash. Reports add explicit `grossPostedSales`/`refundAmount`/`reversalAmount`/`netPostedRevenue` fields and per-source refunded/reversed/net breakdowns everywhere, while every previously existing report field (`postedRevenue`, `revenue`, `commissionAccrued`, `total`, `policyAccrued`, ...) keeps its original gross-SALE-only meaning unchanged; a new `GET .../reports/cash-reconciliation` surfaces the same per-session physical-custody figures as the cash-session model, never described as revenue or bank settlement. Endpoints under `.../branches/:branchId/{cash-policy,cash-registers{,/:registerId,/:registerId/archive}}`, `.../cash-sessions{,/:id,/open,/:id/{movements,close,review}}`, `.../transaction-corrections{,/:id,/:id/{approve,reject,cancel,execute}}`, `.../transactions/:id/{refund,reversal}-requests`, and `.../reports/cash-reconciliation`, gated by the new `cash_registers.*`/`cash_sessions.*`/`refunds.*`/`transactions.reverse` permissions (docs/API_SPEC.md sections 18a, 20, 22, 27c). Payment-gateway integration, external settlement matching, payouts, commission "paid" status, subscription billing, statutory tax invoicing, and receipt PDF/email delivery remain unimplemented — deferred to a later phase.
- The first production Android integration: real passwordless email-OTP sign-in (Keystore-encrypted refresh-token storage, single-flight refresh rotation, never a stored access token), session restoration, secure workspace selection (`GET /v1/me/workspaces`, a new safe read-only projection — accessMode, role/permission codes, assigned branches — added specifically because `GET /v1/organizations` alone was not enough to route a mobile client safely), a real customer home screen (branded search, categories, "Near you" approximate-location discovery, upcoming appointment), business/branch/service discovery, real availability, atomic appointment booking with a stable client-generated idempotency key, appointment management (list/detail/cancel/reschedule), customer favorites (`GET`/`POST`/`DELETE /v1/me/favorites[/:organizationId]`, a second new endpoint — the `CustomerFavorite` model existed with no application code before this stage), and an initial permission-gated business dashboard (org/branch identity, role names, subscription-access state, and a `reports.read`-gated overview report). The entire old Google-AI-Studio-origin demo UI (local Room-backed POS simulation, zero networking) was replaced except the already-correct Kora visual system and logo. Queue, service-session, checkout, payment, refund, cash-session, and commission operations remain unreachable from Android — deferred to the next Android integration stage on purpose, matching this document's own original phase-14 scope boundary even though the *timing* of starting Android work was moved earlier than item 14's original position in the sequence below (see docs/ARCHITECTURE.md section 23, docs/SECURITY.md section 36, docs/API_SPEC.md sections 31-32).
- A second Android integration stage: resumable business owner onboarding (organization + first branch + trial subscription in one idempotent atomic call, services, weekly business hours, optional staff invitation, revalidated against `GET .../setup-status` on every resume rather than trusted from local state), post-onboarding business-profile/service-catalogue/business-hours/team management, and a full staff-invitation lifecycle including deep-link acceptance (`kora://invite/{token}`, a development-only custom scheme — a verified HTTPS Android App Link remains a release prerequisite, see "Current limitations" below). Closed a real privilege-escalation gap (invitations could grant `owner`), added atomic concurrent staff-limit enforcement, and added a minimal read-only `GET .../branches` endpoint. Verified end to end against a running backend on an existing emulator: organization creation, resumability across a full app restart, business-hours persistence, service creation, staff invitation creation with role and branch assignment, the invitation deep link, the email-mismatch rejection, and a full sign-in-and-accept into the workspace with the correct role — all confirmed directly against the database, not only the UI. Found and fixed four real bugs this way (a resume-time branch-resolution gap, the invitation token being discarded instead of shown to the owner, a FloatingActionButton silently not rendering when nested inside two `Scaffold`s, and bottom-navigation content rendering underneath the nav bar) — see docs/ARCHITECTURE.md section 24, docs/SECURITY.md sections 37-38, docs/API_SPEC.md section 33.
- A third Android integration stage: the entire remaining day-to-day business-operations surface — branch-service enablement and staff-service assignment (permission-gated, server-calculated effective price/duration only); staff-assisted appointment check-in and walk-in intake into the live queue; the live branch queue itself (near-real-time, foreground-only, jittered 10-20s polling with exponential backoff on failure, never a WebSocket or background service); service sessions (start/replace items/complete/cancel, elapsed-time display derived purely locally from the server's own `startedAt` and never sent back); checkout (create-or-recover with a stable idempotency key, adjustments with a required reason, void); manual payment recording (CASH/MOBILE_MONEY/CARD/BANK_TRANSFER/OTHER exactly as the backend defines them, integer minor units throughout, a stable idempotency key, a per-branch cash policy honored client-side — REQUIRED is never bypassed, only a different method is offered instead); provider payment confirmation and dispute (self-confirmation forbidden, never confirmed optimistically, every conflict reloads the authoritative state); owner/manager dispute resolution (mandatory reason to reject, a prominent warning before any solo-owner override, the resolved dispute state read back only from what the server actually returned); read-only Transaction and Receipt views (POSTED-only for revenue, immutable server snapshots, never recalculated, never called a tax invoice); staff earnings (today/this-week/custom range, a dedicated server-computed summary — never a client-side sum of a paged line list); and owner/manager reports (revenue by day, staff/service/payment-method/commission breakdowns, currency-separated, gross/refund/reversal/net kept distinct from cash-session custody). A single permission-driven bottom-navigation shell (Overview plus up to four more destinations this membership actually holds real permission for, ranked by priority, everything else — plus setup/catalogue/team management and account actions — in a "More" list) replaced the previous fixed Overview/Setup/Services/Team/More tab set, built as a real nested Navigation-Compose graph (not a hand-rolled per-tab stack) so hardware back and deep multi-screen drill-down (Queue → entry → active service → checkout → record payment) come from the same proven mechanism the customer-facing graph already used. Six small, additive, narrowly-scoped backend endpoints/fields were added to close real mobile-contract gaps found while building this (a `staffProfileId` field on the team directory so a provider can resolve their own identity for "My Work" without a new endpoint; a `serviceSessionId` filter on the checkout list; a `transactionId` filter on the receipt list; a base `GET .../payment-verifications` endpoint returning a provider's own pending/disputed/resolved history in one call; an embedded `payment` summary on every returned `PaymentDispute`; and a `GET .../me/earnings/summary` endpoint reusing the owner/manager commissions-report aggregation, scoped to the caller's own staff profile) — every one covered by a new e2e test, none duplicating existing domain logic. Verified against a real running backend on the existing emulator: cold install and launch under the unchanged `applicationId`/package, the permission-driven navigation shell rendering the correct destinations for a real seeded Manager membership (including the ones that overflow into "More"), the Reports and Queue screens loading real (here, honestly empty) data with no fabricated placeholder values, and no crash across the session. A full multi-role, twenty-step real-money journey with direct PostgreSQL cross-checks (walk-in → queue → service session → checkout → payment → provider confirmation → owner resolution → posted Transaction/Receipt/CommissionAccrual → staff earnings/owner reports) was not completed this stage — the seeded test organization used for manual verification had no enabled branch service to check a walk-in in against, and building a fresh fixture plus driving four separate role sign-ins through emulator UI automation was judged out of scope for this pass; see "Current limitations" below. Two deliberate, disclosed scope reductions: a manual refresh `IconButton` stands in for a Compose `PullToRefreshBox` (uncertain availability on the pinned Compose BOM), and the bottom-navigation bar caps at four permission-derived destinations plus Overview and More (Material accessibility guidance against clipped labels on a crowded bar), with every destination beyond that cap still fully reachable, unrestricted, from the More list. Compose UI tests, Roborazzi screenshot coverage, and most of the previously-deferred Stage-5 screen tests remain unwritten — only 26 new Android unit tests were added this stage (payment idempotency and cash-policy enforcement, walk-in idempotency, provider self-confirmation handling, solo-owner override requirements, and checkout conflict recovery), bringing the Android unit-test count to 143; the backend e2e count grew from 469 to 474.

- A visual redesign and gap-filling pass over the customer marketplace built in the first Android integration stage (docs/ARCHITECTURE.md section 26, docs/design/mobile-customer/): a real bottom-navigation shell for the customer workspace (Home/Search/Appointments/Favorites/Profile, no permission gating — every customer has identical access), provider selection moved into its own step of the booking wizard (was previously embedded in service selection, a correctness fix since eligible providers can change if the customer revisits the step after changing service or date), an honest customer home-screen greeting sourced from the real `CustomerProfile` (never hardcoded), and three additive `AppointmentView` fields (`businessName`, `businessSlug`, `providerDisplayName`) so the appointment list/detail screens can show a real business and provider name — computed from relations every appointment query already loaded, introducing no new authorization surface (docs/SECURITY.md section 40). `kora-customer-ai-voice-search-reference.png` was committed as an approved future design reference only; no functional voice-search entry point exists, matching this document's own "AI-assisted voice search" entry under "Post-V1 extensions" below.

- Kora Customer Marketplace — Live Acceptance and Hardening: closed the live-verification gap the previous entry disclosed. A standalone, idempotent, production-guarded development fixture (`pnpm db:seed:marketplace-demo`, docs/ARCHITECTURE.md section 27, apps/api/README.md "Development marketplace fixture") creates one fully bookable demonstration business and one deliberately unpublished decoy, so the entire customer journey — search, business profile, service/provider/availability selection, atomic booking, viewing the appointment, rescheduling, and cancelling — was driven live against the real backend and PostgreSQL on the existing Pixel 8 emulator, with every material step cross-checked directly in the database (`appointments`, `appointment_items`, `appointment_status_history`, `appointment_idempotency_keys`, `audit_events`). Also verified live: repeated rapid taps on "Confirm booking" produce exactly one booking request; the server's own lead-time and availability rules are surfaced honestly rather than silently retried; the decoy business is invisible to public search and direct slug lookup; cold-relaunch restores the session; system back from Home exits rather than exposing auth. This pass found and fixed one real Android bug — `HomeViewModel` did not cancel a previous in-flight load before starting a new one (e.g. on "Retry"), so a late, superseded response could overwrite a newer one's already-applied result — and one real session-cache staleness bug — the Profile screen kept showing a customer's pre-change display name after a profile update, since nothing told the cached session state about the change. Both are fixed and covered by new regression tests (docs/ARCHITECTURE.md section 27), bringing the Android unit-test count from 206 to 212.

Current limitations:
- Android no longer uses Room as its data store for the screens this stage covers, and the old demonstration-oriented local behavior has been removed (see the Android-integration bullet above); Room is not used at all in this stage, kept only as a future option for carefully-defined caching, never as an authoritative store.
- No real email delivery provider is integrated yet (`EmailOtpSender` fails closed in production; development delivers through a local, credential-free Mailpit container over SMTP — see docs/SECURITY.md section 6); phone OTP and any external identity provider (Apple, Google) remain unimplemented.
- Role/permission *management* endpoints (creating custom roles, editing a membership's roles or branches) are not implemented; every role assignment today comes from the seeded system roles via staff invitation.
- Android now calls the real API for three vertical slices — customer discovery/booking plus an initial business dashboard, business owner onboarding/team management, and the full day-to-day operations surface (see all three Android-integration bullets above): discovery, availability, appointments, favorites, workspaces, organization onboarding, business profile, service catalogue (create/archive), branch-service enablement, staff-service assignment, weekly business hours, staff invitations, appointment check-in, walk-in intake, the live queue, service sessions, checkout, manual payment recording, provider payment confirmation/dispute, owner/manager dispute resolution, transactions, receipts, staff earnings, and owner/manager reports. Still not called from Android: refund/reversal corrections, cash-session opening/movement/close/review (only the existing per-branch cash *policy* is read, to gate the payment form), commission-rule management, commission payout, schedule exceptions, booking policy, staff availability rules/exceptions, invitation resend/reissue, custom-role management, and branch create/deactivate.
- No production domain or hosted `assetlinks.json` exists yet, so the staff-invitation deep link (`kora://invite/{token}`) is a development-only custom URI scheme, not a verified HTTPS Android App Link — shipping a verified App Link is a release prerequisite (docs/SECURITY.md section 38).
- No full branch CRUD exists; only the onboarding-created primary branch exists per organization (the new `GET .../branches` endpoint this stage is read-only, added solely to fix a resume-time bug — docs/API_SPEC.md section 33).
- No automated invitation-delivery email exists; the owner must Copy or Share the one-time invitation link manually.
- Subscriptions are not connected to an authoritative billing backend, and no billing provider is integrated. Customer service payments (Checkout/PaymentRecord/Transaction, now implemented) remain a completely separate domain from organization subscription billing (still unimplemented) — Kora does not hold, transfer, or settle customer money in this phase.
- Branch cash-session reconciliation and refund/reversal corrections are implemented on the backend (see the "cash controls" bullet above) but not reachable from Android yet, by design — full mobile cash-session management, refunds, and reversals were explicitly out of scope for the third Android integration stage; payouts, commission "paid"/settlement status, payment-gateway integration, and external settlement matching do not exist anywhere yet.
- Android push notifications, background synchronization, and iOS remain entirely unimplemented.
- Compose UI tests and Roborazzi screenshot coverage exist as build infrastructure only (`finalizeTestRoborazziDebug` runs and is skipped when no screenshot test invokes it) — almost no screen in the app, old or new, has a written Compose UI or screenshot test yet; this remains open work regardless of which phase's screens are involved.
- A full multi-role, real-money, twenty-step operational journey (walk-in through posted Transaction, Receipt, CommissionAccrual, staff earnings, and owner reports, cross-checked directly in PostgreSQL) has not been run end-to-end on Android; only individual screens have been spot-verified against a live backend on an existing emulator (see the third Android-integration bullet above).

### Implementation sequence for the remaining work

Kept intentionally concise — each item expands into its own phase below once it starts, and is not built ahead of that phase. Items 1–8 (authentication/sessions/staff invitations; organization-scoped RBAC, branch authorization, and subscription enforcement; services, staff availability, and customer appointment booking; walk-ins/live queue; service sessions; checkout and line items; payments, provider verification, and disputes; commissions, receipts, and reports) and public business discovery are done — see "Current baseline" above. Item 14, Android API integration, was deliberately started ahead of items 9–13 by explicit product direction, but only for the slice this document's Android-integration bullet above describes (customer discovery/booking/appointments plus an initial business dashboard) — it is not fully done, and items 9–13 remain the backend's own next boundary regardless of Android's head start:

1. ~~Authentication, sessions, and staff invitations.~~ Done.
2. ~~Organization-scoped RBAC and branch authorization.~~ Done, including subscription-access-mode enforcement.
3. ~~Services, staff availability, and atomic customer appointment booking.~~ Done — see "Current baseline" above. Role/permission *management* endpoints (as opposed to RBAC *enforcement*, already done in item 2) remain a carry-over gap.
4. ~~Walk-ins and live queues.~~ Done — see "Current baseline" above.
5. ~~Service sessions representing actual work performed — the first thing allowed to imply an appointment was fulfilled.~~ Done — see "Current baseline" above.
6. ~~Checkout, line items, and immutable posted transactions.~~ Done — see "Current baseline" above.
7. ~~Payments, provider verification, and disputes.~~ Done — see "Current baseline" above.
8. ~~Commission accrual, service receipts, owner/manager reports, branch cash-session reconciliation, and refund/reversal corrections.~~ Done — see "Current baseline" above.
9. Subscription billing-provider integration.
10. Real-time owner dashboard and notifications.
11. Kora Team business messaging.
12. Public customer booking — builds directly on the discovery slugs/branch IDs already returned today.
13. Offline mobile synchronization.
14. Android API integration. **Started, out of sequence order, ahead of items 9–13** — see all three Android-integration bullets under "Current baseline" above for exactly what is and is not connected. Remaining for this item: refund/reversal and cash-session operations on Android; commission-rule management and payout; schedule exceptions, booking policy, staff availability rules/exceptions; invitation resend/reissue; custom-role management; branch create/deactivate; Compose UI and Roborazzi screenshot test coverage; a verified HTTPS Android App Link for the invitation deep link; automated invitation-email delivery; push notifications; offline synchronization.
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
- Appointment create, confirm, check-in, cancel, and no-show. Create,
  cancel, and no-show are done. Check-in is done: `POST /v1/organizations/
  :organizationId/appointments/:appointmentId/check-in` creates a
  `QueueEntry` from a CONFIRMED appointment without mutating the
  appointment itself, only on its own branch-local calendar date.
- Walk-in creation and live branch queue. Done —
  `POST /v1/organizations/:organizationId/branches/:branchId/queue/
  walk-ins`, `GET .../queue`, and per-entry `queue-entries/:id/*`
  commands (docs/API_SPEC.md section 16). `QueueEntry` itself is the
  durable walk-in record; no separate `WalkIn` table exists.
- Queue call, assign, return-to-waiting, cancel, no-show, and
  start-service actions. Done. ("Move"/reorder is deliberately not
  built — ordering is deterministic by priority, join time, and ticket
  number.)
- Service-session aggregate and provider attribution. Done —
  `ServiceSession`/`ServiceSessionItem`, one primary provider per
  session in V1, snapshotted name/duration/price/currency per item,
  immutable once `COMPLETED`. A CONFIRMED `Appointment` remains a
  reservation only; only `ServiceSession` completion establishes that
  work happened (docs/SECURITY.md section 30/31). Every transition
  additionally appends a `ServiceSessionStatusHistory` row, the
  session's own append-only lifecycle ledger complementing (not
  replacing) the platform-wide `AuditEvent` trail (docs/SECURITY.md
  section 32).
- Least-privilege receptionist access to service sessions. Done —
  `service_sessions.start` lets a receptionist start service for a
  queue entry's already-assigned provider without granting the
  ability to complete, cancel, or edit that session; a service
  provider (`service_sessions.perform`) remains restricted to their
  own assigned session (docs/SECURITY.md section 32).
- Android operational screens connected to the API with cached reads. Done for the "connected" half — appointment check-in, walk-in intake, the live queue, and service sessions are all reachable from Android (see the third Android-integration bullet in "Current baseline" above); there is no local cache of any of it — every screen reads live from the API on each load/refresh, matching this stage's "never a background service or cached authoritative store" constraint.

Critical tests:

- Conflicting provider bookings are rejected. Done — a PostgreSQL
  `EXCLUDE` constraint (`appointments_no_staff_double_booking`,
  `btree_gist`) on the assigned staff member and the occupied UTC time
  range, proven under real concurrent requests
  (`test/appointment-booking.e2e-spec.ts`: 6 simultaneous identical
  booking requests, exactly 1 succeeds).
- Walk-ins work without appointments. Done — a walk-in creates its own
  `CustomerRecord` and `QueueEntry` with no `Appointment` at all
  (`test/queue-intake-and-commands.e2e-spec.ts`).
- Appointments do not require payment records. Done — `Appointment` has
  no relationship to any payment/transaction concept, which do not exist
  yet either.
- Service sessions preserve the staff member who performed each item. Done — `ServiceSessionItem.staffProfileId` is snapshotted per item at start/replace time.
- Concurrent queue changes resolve through revisions or conflicts. Done — `BranchQueueDay.revision` bumps atomically on every mutation; two partial PostgreSQL unique indexes (`WHERE status = 'IN_PROGRESS'`) prove at most one active session per staff member and per queue entry under real concurrent requests (`test/service-sessions.e2e-spec.ts`).
- Concurrent completion attempts append exactly one history row. Done — several simultaneous completion requests on the same session resolve to exactly one successful transition and exactly one appended `COMPLETED` `ServiceSessionStatusHistory` row (`test/service-session-status-history-and-permissions.e2e-spec.ts`).
- Receptionist least-privilege access is enforced server-side. Done — a receptionist can read a session and start it for its already-assigned provider, but cannot complete, cancel, or replace its items, and cannot use the start permission to bypass provider eligibility or branch assignment (`test/service-session-status-history-and-permissions.e2e-spec.ts`).

Exit gate:

- A receptionist and provider on separate emulator sessions can complete the operational flow through service completion. The backend half (booking, walk-in intake, appointment check-in, queue commands, and service-session start/items/complete/cancel) is done and tested, and Android now calls all of it; a real two-emulator, two-role run of this exact flow has not been performed (see docs/ROADMAP.md section 2 "Current limitations": the twenty-step journey has not been run end-to-end).

## 10. Phase 6 — Financial core and verification

**Status: done** (backend only — see docs/ROADMAP.md section 2 "Current baseline" and docs/SECURITY.md section 33 for the full implementation). Delivered with a narrower, more precise shape than originally sketched here: `Checkout`/`PaymentRecord`/`Transaction` as three separate entities rather than one mutable "transaction," and void (not refund) as this phase's correction mechanism — see below.

Deliverables:

- ~~Authoritative checkout preview and transaction creation.~~ Delivered as `Checkout` (amount due for a completed ServiceSession, immutable line-item snapshots) and an automatically-posted `Transaction` (no direct-create endpoint at all — see docs/API_SPEC.md section 18).
- ~~Multi-line transactions with price snapshots.~~ Delivered via `CheckoutLineItem`/`TransactionLineItem`, snapshotted from `ServiceSessionItem`.
- ~~Manual cash, mobile money, card, transfer, online, and other payment recording.~~ Delivered as CASH/MOBILE_MONEY/CARD/BANK_TRANSFER/OTHER — recording categories only, no gateway integration behind any of them ("online" dropped as a category, since it implies a gateway).
- ~~Transaction, payment, and verification state machines.~~ Delivered — see docs/ARCHITECTURE.md sections 11-12.
- ~~Provider confirmation and dispute.~~ Delivered, including the self-confirmation prohibition (docs/SECURITY.md section 33).
- ~~Manager resolution.~~ Delivered, including the solo-owner/provider management-override path.
- ~~Refund and void foundations.~~ Delivered: voiding a `Checkout` (before settlement) and voiding a mistaken `PaymentRecord` (before confirmation) were both implemented in this phase; refunding or reversing a posted `Transaction` was delivered in Phase 7 below, as the `TransactionCorrection` workflow.
- ~~Financial idempotency and optimistic concurrency.~~ Delivered — `FinancialIdempotencyKey` plus a `SELECT ... FOR UPDATE` Checkout-row lock every payment mutation acquires first, proven exactly-once under real concurrent load.
- Android checkout, verification, dispute, and transaction history connected to the API. **Delivered** in the third Android integration stage (see docs/ROADMAP.md section 2 "Current baseline") — checkout creation/adjustment/void, manual payment recording, provider confirmation/dispute, owner/manager resolution, and read-only Transaction views are all reachable from Android now.

Critical tests (`apps/api/test/checkouts.e2e-spec.ts`, `payments.e2e-spec.ts`, `payment-verifications-and-disputes.e2e-spec.ts`, `transaction-posting-and-concurrency.e2e-spec.ts`):

- ~~Cashier records payment; provider confirms; transaction confirms once.~~ Proven, including under five simultaneous confirmation attempts.
- Provider dispute prevents commission finalization. **Not applicable yet** — commissions do not exist until Phase 7; proven instead that a dispute prevents Transaction posting.
- ~~Manager resolution requires permission and reason.~~ Proven.
- ~~Repeated payment commands return the original result without duplicates.~~ Proven.
- Lost network responses do not produce a second payment. Proven via the Idempotency-Key replay path.
- ~~Cross-tenant payment access is denied.~~ Proven — `404`, never a raw database error.
- ~~Refunds create explicit reversal history.~~ Delivered in Phase 7 below as the `TransactionCorrection`/`TransactionCorrectionStatusHistory` workflow, alongside the refund/reversal concept itself.

Exit gate:

- ~~Every financial outcome is reconstructable through records, versions, state transitions, idempotency evidence, and audit events.~~ Met for everything this phase actually delivers (Checkout → PaymentRecord → verification/dispute → posted Transaction); reconstructing a *refund* is met in Phase 7 below, once the `TransactionCorrection` workflow exists.

## 11. Phase 7 — Commissions, receipts, reconciliation, and reports

**Status: done** — commissions, receipts, reports, branch cash-session reconciliation, and refund/reversal corrections are all implemented (backend only — see docs/ROADMAP.md section 2 "Current baseline" and docs/SECURITY.md sections 34-35 for the full implementation). Delivered with a narrower rule-shape than originally sketched: `PERCENTAGE`/`FIXED`/`NONE` commission types (not "service-specific" or "tiered" as distinct strategies — a service-specific rate is expressed as a service-scoped `PERCENTAGE`/`FIXED` rule instead, via the same eight-level precedence every other scope dimension uses), and cash-session reconciliation is a physical-drawer-custody calculation only, never itself a revenue figure.

Deliverables:

- Percentage, fixed, service-specific, and tiered commission strategies. **Delivered as PERCENTAGE/FIXED/NONE rule types plus branch/staff/service scoping** (not "tiered" as a distinct calculation strategy) — see docs/ARCHITECTURE.md section 21 for the eight-level precedence.
- ~~Finalized and reversed commission records with calculation snapshots.~~ Delivered as immutable `CommissionAccrual` rows (`kind`: EARNED/REFUNDED/REVERSED), each snapshotting the exact rule terms and calculation basis used; a REFUNDED/REVERSED row is calculated only from the original EARNED accrual's own immutable snapshot, never the current `CommissionRule` — see docs/ARCHITECTURE.md section 22.
- ~~Stable receipt numbering and receipt snapshots.~~ Delivered — an atomic per-branch/year sequence (`{branchCode}-{year}-{sequence}`) and a fully immutable snapshot of business/branch/customer/line/payment details, extended with a corrective `REFUND_RECEIPT`/`REVERSAL_RECORD` kind that references the original sale receipt.
- Digital receipt viewing and safe sharing foundation. **Partially delivered**: `GET .../receipts`, `GET /me/receipts` return a canonical JSON receipt payload; PDF generation, email delivery, and public share links are deliberately deferred.
- ~~Cash-session opening, submission, variance, approval, and rejection.~~ Delivered as `CashRegister`/`CashSession`/`CashLedgerEntry`/`CashSessionReview` — a physical-custody model (opening float, manual cash in/out, safe drops, cash payments/refunds, expected vs. counted variance) gated by a per-branch `BranchCashPolicy`, never itself a revenue calculation — see docs/ARCHITECTURE.md section 22.
- ~~Owner dashboard and basic daily reports backed by verified server data.~~ Delivered as `GET .../reports/{overview,revenue,staff-performance,services,payment-methods,commissions,cash-reconciliation}` — a real-time query API, now gross/net-aware; no push/scheduled dashboard delivery mechanism exists (that is Phase 9's "real-time owner dashboard"). Reachable from Android since the third Android integration stage (overview, revenue, staff performance, services, payment methods, and commissions; cash-reconciliation is not surfaced on Android, since full mobile cash-session management is out of scope there too), along with `.../me/earnings` and the new `.../me/earnings/summary`, and `.../receipts`/`/me/receipts`.

Critical tests (`apps/api/test/commission-rules.e2e-spec.ts`, `commission-accrual-posting.e2e-spec.ts`, `commission-adjustments.e2e-spec.ts`, `receipts.e2e-spec.ts`, `reports.e2e-spec.ts`, `cash-controls.e2e-spec.ts`, `transaction-corrections.e2e-spec.ts`):

- ~~Only verified transaction value produces finalized commission.~~ Proven — an accrual is created only inside the same database transaction that posts a Transaction, never for a merely-recorded or disputed payment claim.
- ~~Refunds reverse affected commission correctly.~~ Proven — a PERCENTAGE refund/reversal recomputes the adjustment from the refunded basis using the original snapshotted rate; a FIXED one reverses the full remaining amount on a full correction or prorates on a partial one; cumulative adjustments across several partial refunds never exceed the original accrual; changing or deactivating the `CommissionRule` after the original Transaction posted never changes the correction's result.
- ~~Expected cash is server-calculated.~~ Proven — `calculateExpectedClosingCashMinor` is a pure, unit-tested function over a session's own immutable ledger entries; a database trigger independently rejects any ledger entry against a non-OPEN session, confirmed by a real-PostgreSQL smoke test bypassing the application layer entirely.
- ~~Receipt history does not change after service or staff edits.~~ Proven — a receipt's line items are immutable snapshots, unaffected by a later Service catalogue price change.
- ~~Reports separate recorded, verified, disputed, refunded, and outstanding value.~~ Proven — the overview report's `pendingPaymentClaimCount`/`disputedPaymentClaimCount` stay strictly separate from `postedRevenue`, and every report now additionally separates gross/refunded/reversed/net figures (`grossPostedSales`/`refundAmount`/`reversalAmount`/`netPostedRevenue` and their per-staff/service/method/commission-source equivalents) while every previously existing field keeps its original gross-SALE-only meaning.

Exit gate:

- ~~An owner can remotely reconcile a branch day and trace every displayed figure to source transactions.~~ Met: every report figure traces back to a POSTED Transaction and its snapshots, and `GET .../reports/cash-reconciliation` reconciles a branch day in the cash-session sense (expected vs. counted cash, per session) from each session's own immutable ledger entries.

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
- AI-assisted voice search for customer discovery (docs/design/mobile-customer/`kora-customer-ai-voice-search-reference.png` is an approved future design; the current customer home screen shows only an inert, honestly-labeled teaser — no microphone capture, no model-provider integration, no functional voice entry point exists yet).

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
catalogue, branch/staff scheduling, the availability engine, atomic
customer and staff-assisted appointment booking (with database-enforced
double-booking prevention and idempotent booking commands), walk-in
intake, appointment check-in, the live branch queue, service sessions
(with database-enforced single-active-session-per-staff/per-queue-entry
protection and idempotent intake commands), checkout/payments/posted
transactions, commission accrual/receipts/reports, and branch cash
controls/refund-and-reversal corrections (this document's Phases 6-7)
are done — see "Current baseline" above. Three Android integration
stages are also done for the slices they cover: passwordless sign-in
through an initial business dashboard; business owner onboarding and
team management; and, most recently, the full day-to-day operations
surface — branch-service/staff-service configuration, appointment
check-in, walk-in intake, the live queue, service sessions, checkout,
manual payment recording, provider confirmation/dispute, owner/manager
dispute resolution, transactions, receipts, staff earnings, and
owner/manager reports, behind one permission-driven navigation shell —
all started ahead of items 9-13 in the implementation sequence by
explicit product direction, not because the backend's own remaining
boundary changed. The next backend step remains item 9 of the
implementation sequence: subscription billing-provider integration. The
next Android step is either finishing what item 14 still leaves open
(refund/reversal and cash-session controls, commission-rule management,
Compose UI and screenshot test coverage, a real multi-role end-to-end
run with PostgreSQL cross-checks — see "Current limitations" above) or
proceeding to push notifications and offline synchronization (items
10-13) once its turn in the sequence is reached. No further feature
module is implemented until each prior one's quality gates (tests, lint,
build, migration status) are green, per this document's delivery
principle.
