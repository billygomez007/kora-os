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

Current limitations:

- Room is the only working data store and contains demonstration-oriented local behavior.
- There is no production API, PostgreSQL database, authentication, multi-device synchronization, or tenant enforcement.
- Current roles are simulated locally and are not security controls.
- Payments and subscriptions are not connected to an authoritative backend.
- Android is the only implemented client.

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

Deliverables:

- Registration, login, refresh, logout, recovery, and verification flows.
- Rotating revocable device sessions.
- Owner organization creation transaction.
- First branch, owner membership, roles, and eligible trial created atomically.
- Staff invitation creation, acceptance, decline, revoke, and expiry.
- Android authentication and organization-selection screens.
- Secure Android credential storage.

Critical tests:

- Token replay and revoked sessions are rejected.
- Invitation tokens are single-use, scoped, hashed, and expiring.
- One identity can join two organizations without data leakage.
- Failed onboarding does not leave partial tenant records.

Exit gate:

- Two real emulator installations can sign in as different users and observe only their authorized organizations.
- Local role simulation is no longer treated as security.

## 8. Phase 4 — Staff, roles, branches, and services

Deliverables:

- Multiple role assignment and branch scope.
- Staff profile, services, availability, and time-off.
- Branch create, update, activate, and deactivate.
- Service categories and service catalog.
- Service-provider assignment.
- Initial commission rule configuration.
- Android owner and manager configuration flows.

Critical tests:

- Cashiers cannot edit commission rules.
- Branch-restricted staff cannot access another branch.
- Staff and branch entitlement limits cannot be bypassed concurrently.
- Historical line-item prices remain unaffected by catalog edits.

Exit gate:

- An owner can configure a real business and invite a working team without seed data.

## 9. Phase 5 — Customers, scheduling, queue, and service sessions

Deliverables:

- Organization-scoped customer profiles and search.
- Provider availability calculation.
- Appointment create, confirm, check-in, cancel, and no-show.
- Walk-in creation and live branch queue.
- Queue call, assign, move, start, complete, and cancel actions.
- Service-session aggregate and provider attribution.
- Android operational screens connected to the API with cached reads.

Critical tests:

- Conflicting provider bookings are rejected.
- Walk-ins work without appointments.
- Appointments do not require payment records.
- Service sessions preserve the staff member who performed each item.
- Concurrent queue changes resolve through revisions or conflicts.

Exit gate:

- A receptionist and provider on separate emulator sessions can complete the operational flow through service completion.

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

After the six foundation documents are committed, scaffold `apps/api` with strict configuration, health and readiness endpoints, environment validation, standard errors, request IDs, tests, and local PostgreSQL and Redis dependencies. No salon feature module is implemented until that engineering foundation is green.
