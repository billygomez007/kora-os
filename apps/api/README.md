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
ever count as business revenue; it cannot be edited, deleted, reversed,
or refunded through any public route yet. Commissions, receipts,
reporting, refunds, reconciliation, and payment-gateway integration
remain deliberately unimplemented. See `docs/ARCHITECTURE.md` sections
11-12 and `docs/SECURITY.md` section 33 for the full model.

## Useful root-level scripts

Run from the repository root (see the root `package.json` for the full
list):

- `pnpm db:up` / `db:down` / `db:status` / `db:logs` — local PostgreSQL container
- `pnpm prisma:format` / `prisma:validate` / `prisma:generate`
- `pnpm prisma:migrate:dev` / `prisma:migrate:deploy` / `prisma:migrate:status`
- `pnpm prisma:studio` / `prisma:seed`
- `pnpm api:build` / `api:dev` / `api:lint` / `api:test` / `api:test:e2e`
