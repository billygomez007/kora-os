# Kora API

The Kora OS backend: a modular NestJS monolith serving the Android app
(and, later, iOS) over a versioned REST API under `/v1`. See
`../../docs/` for the full product, architecture, data model, API, and
security specifications — this file only covers running and testing this
package.

## Setup

Requires Node 24.19+, pnpm 11.21+, and Docker (for local PostgreSQL).

```bash
# from the repository root
pnpm install
pnpm db:up          # starts PostgreSQL 18.6 and Mailpit in Docker
```

`pnpm db:up` also starts [Mailpit](https://mailpit.axllent.org/), a
local, credential-free SMTP catcher bound to `127.0.0.1` only
(web UI + API on 8025, SMTP on 1025) — never used in production. Copy
`.env.example` (repository root) to `.env` and fill in the three
signing secrets, which are never committed and have no default value
(the `EMAIL_DELIVERY_MODE`/`SMTP_*` values are already filled in with
Mailpit's non-secret local defaults):

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # REFRESH_TOKEN_PEPPER
openssl rand -base64 48   # OTP_PEPPER
```

Then apply the schema and seed reference data (permissions, system roles,
plan shells, discovery categories):

```bash
pnpm prisma:migrate:deploy
pnpm prisma:seed
```

## Running

```bash
pnpm api:dev     # watch mode, from the repository root
# or, from apps/api:
pnpm start:dev
```

The API listens on `PORT` (default 3000) under the `API_PREFIX` (default
`v1`), so `GET http://localhost:3000/v1/health` should return `200`.

## Testing

```bash
pnpm --dir apps/api test        # unit tests (mocked dependencies)
pnpm --dir apps/api test:e2e    # integration tests against the real
                                 # local PostgreSQL container
```

E2E tests boot a real Nest application per test file (some boot one per
test) against the same database `pnpm db:up` starts — no mocking of
Prisma. Each spec file tracks and deletes the rows it creates.

## Authentication in one paragraph

Kora OS uses passwordless email OTP authentication for customers,
owners, managers and staff. Kora does not store or support user
passwords. `POST /v1/auth/email-otp/request` emails a one-time code;
`POST /v1/auth/email-otp/verify` (challenge ID + code) is both sign-up
and sign-in — it creates the account on first use and signs the same
account in every time after — and returns a short-lived signed access
token plus a long-lived opaque refresh token. A Kora account (`User`) is
global: the same account can hold business memberships
(`OrganizationMembership`, one business workspace per organization) and
a customer profile (`CustomerProfile`, the single customer workspace) at
once. The refresh token rotates on every use, and reusing an
already-rotated one revokes the whole session. Send the access token as
`Authorization: Bearer <token>`. Organization-scoped requests
additionally need either an `X-Kora-Organization-Id` header or an
`:organizationId` route param — that ID only *selects* which membership
to check, it never grants access by itself. See `docs/API_SPEC.md` and
`docs/SECURITY.md` for the full model. No code is ever written to any
application log — there is no console/stdout sender, in any
environment. There is no real production email provider wired in yet;
locally, `pnpm db:up` also starts a Mailpit container
(`infrastructure/compose.yaml`) and codes are delivered to it over real
SMTP — read them at http://127.0.0.1:8025 (see `EmailOtpModule` and
`SmtpEmailOtpSender`).

## Services, availability, and booking in one paragraph

An organization's `Service` catalogue (grouped by `ServiceCategory`) is
enabled per branch through `BranchService`, which may override price,
duration, or customer-bookability there — the effective price and
duration a customer sees is always computed server-side, never accepted
from a client. `StaffServiceAssignment` connects an eligible,
branch-assigned staff member to a service. `BranchBusinessHours` /
`BranchScheduleException` (branch) and `StaffAvailabilityRule` /
`StaffAvailabilityException` (staff) are deliberately separate — a
provider is bookable only where both intersect — combined by
`AvailabilityEngineService` into concrete UTC slots, exposed publicly
under `/v1/discovery/businesses/:slug/branches/:branchId/*` (respecting
the same `PUBLIC`/`LINK_ONLY`/`PRIVATE` visibility as the rest of
discovery) and to authenticated staff under
`/v1/organizations/:organizationId/branches/:branchId/availability`.
Availability results are advisory; `POST /v1/me/appointments` (customer)
and `POST /v1/organizations/:organizationId/branches/:branchId/appointments`
(staff-assisted) are the atomic reservation, protected by a PostgreSQL
`EXCLUDE` constraint on the assigned staff member and the occupied UTC
time range (`btree_gist`) so two concurrent requests for the same
provider and time can never both succeed, plus a client-generated
idempotency key so a retried request returns the original appointment
rather than a duplicate. An `Appointment` is not a `ServiceSession`, a
`Payment`, or a `Transaction` — a `CONFIRMED` appointment is a
reservation only, never itself proof that work happened. See
`docs/ARCHITECTURE.md` section 6 and `docs/SECURITY.md` section 30 for
the full model.

## Walk-ins, queue, and service sessions in one paragraph

A customer arrives one of two ways: a genuine walk-in
(`POST /v1/organizations/:organizationId/branches/:branchId/queue/walk-ins`,
resolving or creating an organization-scoped `CustomerRecord` — a
newly entered email/phone is never used to link an existing global
`CustomerProfile`) or checking a `CONFIRMED` appointment into today's
queue (`POST /v1/organizations/:organizationId/appointments/:appointmentId/check-in`,
which never mutates the appointment itself). Either way, a `QueueEntry`
is created in `WAITING` with an atomically issued, per-branch,
per-branch-local-business-date ticket number (`BranchQueueDay`, a
single native `INSERT ... ON CONFLICT DO UPDATE`) and moves through an
explicit state machine (`GET`/`POST /v1/organizations/:organizationId/{branches/:branchId/queue,queue-entries/:id/{call,return-to-waiting,assign,cancel,no-show}}`)
— `IN_SERVICE` and `COMPLETED` are reachable only by starting and
completing a `ServiceSession`, never a direct command. Starting service
(`POST .../queue-entries/:queueEntryId/start-service`) is one
transaction: claim the queue entry, resolve and validate the provider,
snapshot the requested services as `ServiceSessionItem` rows, move the
entry to `IN_SERVICE`. Two partial PostgreSQL unique indexes (`WHERE
status = 'IN_PROGRESS'`) guarantee at most one active session per staff
member and per queue entry at the database level, so a failed start
(`409 STAFF_ALREADY_SERVING` / `409 QUEUE_ENTRY_ALREADY_IN_SERVICE`)
leaves the queue entry completely unchanged, and appends a
`ServiceSessionStatusHistory` row (`previousStatus`/`newStatus`) inside
that same transaction — the session's own append-only lifecycle ledger,
separate from the platform-wide `AuditEvent` trail. A provider acts on
their own session only (`service_sessions.perform`) unless granted
`service_sessions.manage`; a receptionist may additionally hold
`service_sessions.start`, which starts service for a queue entry's
already-assigned provider only and grants nothing else (not complete,
cancel, or item replacement) — `start-service` accepts any of the
three via `@RequireAnyPermission`, with the specific rule each one
carries applied in `ServiceSessionsService`. A completed `ServiceSession`
is not a `Payment`, `Transaction`, `Receipt`, or `Commission` —
`serviceTotalMinor` is the value of performed services, not proof
money was received; `Receipt` and `Commission` do not exist in this
codebase yet, but `Checkout`, `PaymentRecord`, and `Transaction` do —
see the next paragraph. See `docs/ARCHITECTURE.md` section 6 and
`docs/SECURITY.md` sections 31-32 for the full service-session model.

## Checkout, payments, and transactions in one paragraph

`POST .../service-sessions/:id/checkout` turns one *completed*
`ServiceSession` into exactly one `Checkout` (`checkouts.create`) —
immutable line-item snapshots and a server-computed total, never
recalculated from the live `Service` catalogue; a zero-value checkout
is rejected rather than silently settled, since no `NO_CHARGE`
workflow exists yet. Owners/managers may append discount/surcharge
`CheckoutAdjustment`s (`checkouts.adjust`, append-only — a correction
is a new compensating adjustment, never an edit) or void the checkout
(`checkouts.void`) before it settles. `POST .../checkouts/:id/payments`
(`payments.record`, `Idempotency-Key` required) records a
`PaymentRecord` — a staff member's *claim* that money was received,
manually entered as CASH/MOBILE_MONEY/CARD/BANK_TRANSFER/OTHER with no
payment-gateway integration behind any of them — never itself revenue,
and never able to push the checkout's combined active applied amount
past its total. The ServiceSession's own assigned provider must then
confirm or dispute each claim (`payments.verify_own`,
`POST .../payments/:id/{confirm,dispute}`) — a recorder who is also
the assigned provider can never self-confirm their own claim; the one
exception is a solo owner/provider, who may confirm via
`payments.resolve` as an explicitly reasoned, separately audited
management override. An owner/manager resolves a dispute
(`payments.resolve`, `POST .../payment-disputes/:id/resolve`) by
confirming or rejecting the disputed payment, returning the checkout
to its correct derived state either way. The moment confirmed applied
payments exactly equal the checkout's total, an immutable `Transaction`
is posted automatically and atomically — there is no endpoint that
creates one directly — inside the same database transaction that
confirms or resolves the final required payment, behind a
`SELECT ... FOR UPDATE` lock on the `Checkout` row that every payment
mutation acquires first, which is what makes exactly one `Transaction`
ever get posted per `Checkout` true even under concurrent confirmations
(proven in `test/transaction-posting-and-concurrency.e2e-spec.ts`). A
posted `Transaction` is the only thing a future reporting phase may
ever count as business revenue; it cannot be edited or deleted through
any public route — refunding or reversing it (see the "Cash controls
and refund/reversal corrections" paragraph below) always posts a
*separate*, new immutable Transaction instead, never an edit to this
one. Payment-gateway integration remains deliberately unimplemented —
but commissions, receipts, reports, cash controls, and corrections (the
next two paragraphs) are now built. See `docs/ARCHITECTURE.md` sections
11-12 and `docs/SECURITY.md` section 33 for the full model.

## Commissions, receipts, and reports in one paragraph

The moment a `Transaction` posts (previous paragraph), `Commission
AccrualService` and `ReceiptService` run inside that exact same
database transaction — the full chain (payment confirmation → posted
`Transaction` → `CommissionAccrual` rows → `Receipt`) commits or rolls
back together, never partially. A `CommissionRule` (`commissions.manage`
— owner/manager) is `PERCENTAGE`, `FIXED`, or `NONE`, independently
scoped by branch/staff/service across an eight-level precedence (most
specific combination down to the bare organization default), and is
never edited in place — changing one always supersedes it with a new
row or explicitly deactivates it, and only one *current* rule may exist
per exact scope, enforced by a hand-written `NULLS NOT DISTINCT`
partial unique index (Prisma's schema DSL has no stable declarative
support for it). A rule is resolved as of the Transaction's own
`postedAt`, and every accrual snapshots the exact terms it used, so a
later rule change never touches an already-created accrual. Percentage
commissions round half-up using exact `BigInt` arithmetic; a
`NET_LINE_AFTER_ADJUSTMENTS`-basis rule allocates a checkout's discount
or surcharge across line items by the largest-remainder method, so the
allocated amounts always sum to exactly the posted total. No matching
rule still posts the Transaction — it creates an explicit zero-value
`NO_POLICY` accrual (`commissions.read_own`/`.read_all`,
`GET .../commissions`, `GET .../me/earnings` — the latter always
resolves the caller's own StaffProfile server-side, never a
client-supplied id). A `Receipt` (`receipts.read`) is not a tax
invoice — a plain, fully immutable snapshot with a
`{branchCode}-{year}-{sequence}` number from an atomic per-branch/year
counter (the same pattern queue ticket numbers already use), visible to
authorized business users (`GET .../receipts{,/:id}`) and, separately,
to the linked customer only (`GET /me/receipts{,/:id}` — ownership
proven by `CustomerRecord.customerProfileId`, a walk-in with no linked
account reachable only through the business side). Owner/manager
reports (`reports.read`, `GET .../reports/{overview,revenue,staff-
performance,services,payment-methods,commissions}`) derive every figure
from these same immutable records — a RECORDED or DISPUTED payment
claim never inflates revenue, appearing only as a separate operational
counter, and every monetary total stays strictly separated by currency.
Payouts and any "paid" status for a commission remain deliberately
unimplemented — but cash-session reconciliation, refunds, and reversals
(the next paragraph) are now built. See `docs/ARCHITECTURE.md` section
21 and `docs/SECURITY.md` section 34 for the full model.

## Cash controls and refund/reversal corrections in one paragraph

A per-branch `BranchCashPolicy` (OPTIONAL by default — a branch that
never configures one behaves exactly as before this stage existed, or
REQUIRED) governs whether recording a CASH payment or executing a CASH
refund needs an open `CashSession` on a named `CashRegister`
(`cash_registers.*`, `POST .../branches/:branchId/cash-registers`). At
most one OPEN session may exist per register+currency, enforced by a
hand-written partial unique index (proven under five concurrent open
attempts); every `CashLedgerEntry` (OPENING_FLOAT/PAYMENT_RECEIVED/
CASH_IN/CASH_OUT/SAFE_DROP/REFUND_PAID) is append-only and always a
positive magnitude, with a `BEFORE INSERT` database trigger rejecting
any entry against a non-OPEN session as a hard backstop behind
`CashSessionsService`'s own row lock — confirmed against a real
PostgreSQL instance with the application layer bypassed entirely.
Closing (`cash_sessions.close`) computes `expectedClosingCashMinor`
(opening float + cash payments + manual cash in − manual cash out −
safe drops − cash refunds) from the session's own immutable entries and
transitions OPEN → CLOSED exactly once; reviewing
(`cash_sessions.reconcile`, owner/manager only) records a MATCHED/
ACCEPTED_VARIANCE/INVESTIGATION_REQUIRED outcome without ever touching
that snapshot. None of this is revenue — it is physical drawer custody
only, surfaced separately via `GET .../reports/cash-reconciliation`.
Separately, a `TransactionCorrection` (`POST .../transactions/:id/
{refund,reversal}-requests`) requests a REFUND (partial or full,
cumulative-capped against each line's own remaining refundable amount)
or a REVERSAL (one full negation, only before any prior refund/reversal
against that sale) against a posted SALE Transaction — never mutating
or deleting it. The workflow (REQUESTED → APPROVED/REJECTED/CANCELLED,
APPROVED → EXECUTED/CANCELLED) enforces separation of duties: the
requester can never approve or reject their own request
(`refunds.approve`), except a solo owner with no other eligible
approver in the organization, who may do so only with an explicit,
separately audited override reason. Executing (`refunds.execute`, a
distinct action and permission from approval) locks the correction and
then the *original* sale Transaction — a higher-level aggregate root —
before recomputing what remains from every other executed correction
against that sale, then atomically posts one immutable REFUND/REVERSAL
Transaction (`Transaction.kind`, non-negative magnitude with the sign
always derived from `kind`, never stored), its own corrective
`CommissionAccrual` rows (calculated only from the *original* EARNED
accrual's own snapshot, never the current `CommissionRule`), a
corrective `Receipt` (`REFUND_RECEIPT`/`REVERSAL_RECORD`, referencing
the original sale receipt, never called a tax invoice or credit note),
and — for cash — one `REFUND_PAID` ledger entry: all inside one database
transaction that commits or rolls back completely, proven exactly-once
under five concurrent execution attempts. Reports gain explicit
`grossPostedSales`/`refundAmount`/`reversalAmount`/`netPostedRevenue`
fields and per-source refunded/reversed/net breakdowns everywhere,
while every previously existing field keeps its original gross-SALE-only
meaning unchanged. See `docs/ARCHITECTURE.md` section 22 and
`docs/SECURITY.md` section 35 for the full model.

## Workspaces and favorites in one paragraph

Two small, additive modules exist solely to let the Android app answer
"what can this signed-in person see?" and "what has this customer saved?"
without ever putting authorization authority on the client. `GET
/v1/me/workspaces` (`WorkspacesModule`) returns
`{customerWorkspaceAvailable, organizations: [{organizationId,
membershipId, name, slug, logoUrl, roleCodes, permissionCodes,
accessMode, membershipStatus, branches}]}` — only ACTIVE memberships,
`accessMode` from `SubscriptionAccessService.resolveAccessMode`
(`BLOCKED` if no subscription row exists at all), and `branches` limited
to the membership's own `BranchAssignment` rows unless it holds the
broad `branches.manage` permission (mirroring `TenantAccessGuard`'s own
rule), in which case every ACTIVE branch is listed. No subscription,
audit, staff-private, or financial detail beyond that safe projection is
ever included, and roles/permissions still come from the database on
every call — nothing here is cached into a token or trusted from the
client on a later request. `GET`/`POST`/`DELETE
/v1/me/favorites[/:organizationId]` (`FavoritesModule`) lets an
authenticated customer save and unsave a `PublicBusinessProfile`;
`add()` re-validates the organization is PUBLIC or LINK_ONLY and
published before upserting (404 otherwise), `remove()` is an idempotent
delete, and `list()` re-filters visibility on every read so a business
that turned PRIVATE after being favorited simply disappears from the
list with no cleanup job required. Both endpoints are covered by
dedicated tenant/security e2e suites
(`test/workspaces.e2e-spec.ts`, `test/favorites.e2e-spec.ts`). See
`docs/API_SPEC.md` sections 31-32 and `docs/SECURITY.md` section 36.

## Useful root-level scripts

Run from the repository root (see the root `package.json` for the full
list):

- `pnpm db:up` / `db:down` / `db:status` / `db:logs` — local PostgreSQL container
- `pnpm prisma:format` / `prisma:validate` / `prisma:generate`
- `pnpm prisma:migrate:dev` / `prisma:migrate:deploy` / `prisma:migrate:status`
- `pnpm prisma:studio` / `prisma:seed`
- `pnpm api:build` / `api:dev` / `api:lint` / `api:test` / `api:test:e2e`
