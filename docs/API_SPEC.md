# Kora OS API Specification

Status: Foundation baseline
Style: Versioned REST with JSON
Base path: `/v1`

## 1. Contract principles

- The backend is authoritative for identity, authorization, subscriptions, state transitions, totals, commissions, and audit events.
- Mobile clients send commands and render returned state; they do not recreate protected server decisions.
- API contracts use stable public resource shapes rather than exposing database rows.
- Breaking changes require a new API version or a backward-compatible migration period.
- OpenAPI becomes the machine-readable source for generated clients after the backend scaffold is created.

## 2. Transport

- Production traffic uses HTTPS only.
- Request and response bodies use UTF-8 JSON unless an endpoint explicitly returns a document.
- Dates and timestamps use ISO 8601. Server timestamps are UTC.
- Currency values use objects containing integer `amountMinor` and ISO `currency`.
- Resource identifiers are opaque strings.

Example money value:

```json
{
  "amountMinor": 8000,
  "currency": "GHS"
}
```

## 3. Request headers

Protected routes use:

```text
Authorization: Bearer <access-token>
X-Kora-Organization-Id: <organization-id>
X-Kora-Branch-Id: <branch-id>        optional where branch context applies
X-Request-Id: <client-request-id>     optional; server supplies one if absent
Idempotency-Key: <stable-command-id>  required for replay-sensitive commands
If-Match: <resource-version>          required for selected concurrent updates
```

The organization header selects from the authenticated user's memberships. It does not grant access by itself.

When a route already carries `:organizationId` in its path (every
organization-scoped route implemented so far does), that path param is
authoritative and the header is not needed; the header exists for routes
that are organization-scoped without the ID appearing in the path. Either
way, the ID is only ever a *selector* — TenantAccessGuard re-resolves an
active `OrganizationMembership` row for the authenticated user before any
access is granted, so a header or path value naming an organization the
caller does not belong to is rejected with `403`, not silently ignored.
The same is true of a request body: an `organizationId` field inside a
JSON body is never treated as authorization evidence.

## 4. Response shape

Single-resource response:

```json
{
  "data": {},
  "meta": {
    "requestId": "req_..."
  }
}
```

Collection response:

```json
{
  "data": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

## 5. Error shape

```json
{
  "error": {
    "code": "PAYMENT_ALREADY_RECORDED",
    "message": "A payment has already been recorded for this command.",
    "details": {},
    "fieldErrors": [],
    "retryable": false
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

Raw exceptions, SQL messages, stack traces, tokens, and provider secrets are never returned.

## 6. HTTP status usage

- `200 OK`: successful query or command returning a resource.
- `201 Created`: resource created.
- `202 Accepted`: background operation accepted.
- `204 No Content`: successful command with no response body.
- `400 Bad Request`: malformed request.
- `401 Unauthorized`: missing or invalid authentication.
- `403 Forbidden`: authenticated but not permitted.
- `404 Not Found`: resource absent or intentionally concealed across tenants.
- `409 Conflict`: invalid state transition, duplicate, or concurrency conflict.
- `412 Precondition Failed`: version precondition failed.
- `422 Unprocessable Entity`: validation rule failure.
- `429 Too Many Requests`: rate limit exceeded.
- `500 Internal Server Error`: unexpected server failure with safe error body.
- `503 Service Unavailable`: temporary dependency failure when appropriate.

## 7. Pagination, filtering, and sorting

Collections use cursor pagination:

```text
?limit=25&cursor=<opaque-cursor>
```

Default and maximum limits are server-controlled. Filters use documented query parameters such as `status`, `branchId`, `from`, `to`, and `search`. Sorting uses a bounded allowlist, for example `sort=-createdAt`.

## 8. Authentication endpoints

Kora OS uses passwordless email OTP authentication for customers,
owners, managers and staff. Kora does not store or support user
passwords. One Kora identity (`User`) carries both workspaces at once —
see section 2 of `docs/DATA_MODEL.md` for how `OrganizationMembership`
(business workspace) and `CustomerProfile` (customer workspace) both
hang off the same `User` without either being the "real" account.
`EMAIL_OTP` is the only implemented provider; `AuthIdentity.provider`
reserves `GOOGLE`, `APPLE`, `PHONE_OTP`, and `EMAIL_MAGIC_LINK` for later
without any schema change when they arrive.

### Public

- `POST /auth/email-otp/request` — body `{ email }`. Creates and emails a
  one-time code, invalidating any still-active code already outstanding
  for that email. Returns `{ challengeId, expiresAt }` — **identically
  shaped whether or not `email` already has an account**, and never
  returns the code itself. Rate-limited by both normalized email (a
  resend cooldown, plus a per-hour cap) and by request IP; either limit
  returns `429`.
- `POST /auth/email-otp/verify` — body `{ challengeId, code,
  deviceLabel? }`. The same request/verify pair is both sign-up and
  sign-in: on success, creates the `User` if `email` is new or reuses the
  existing one, marks the email verified, and returns the same session
  response `POST /auth/refresh` returns (section immediately below). An
  expired, already-consumed, invalidated, or locked challenge — and a
  wrong code — all return the same generic `401`; a challenge locks after
  a configured number of wrong attempts (`OTP_MAX_ATTEMPTS`, default 5),
  after which even the correct code is rejected. Verification and
  consumption are atomic, so two concurrent requests for the same code
  can never both succeed.
- `POST /auth/refresh`

Email/phone verification beyond what OTP itself proves (an SMS-based
phone flow, for instance) is not implemented — Kora has no SMS delivery
provider integrated (see docs/ROADMAP.md). There is no password-reset
endpoint and none is planned; there is no password to reset.

### Authenticated

- `POST /auth/logout` — revokes the current session.
- `POST /auth/logout-all` — revokes every session for the user.
- `GET /auth/me`
- `GET /auth/sessions` — every non-revoked session for the user.
- `DELETE /auth/sessions/{sessionId}` — revoke one specific session; a
  user may only revoke their own.

`PATCH /auth/me` and `GET /auth/me/memberships` are not implemented yet;
`GET /organizations` (section 9) already lists the caller's organization
memberships. Device/push registration (`PUT`/`DELETE
/me/devices/{installationId}`) has no corresponding table yet — session
rows record `deviceLabel`/`userAgent` for support and anomaly review only,
never as proof of identity, and that is deliberately as far as device
tracking goes until push notifications are built.

An access token is a short-lived signed JWT carrying only a user ID and
session ID — never roles or permissions, which are always re-resolved
from the database on the request that needs them (see section 3 and
docs/SECURITY.md). A refresh token is a long-lived, cryptographically
random opaque value; the server stores only its hash. Every refresh
rotates the token: the presented token is marked used and a new one is
issued in the same response. Presenting an already-used (or already
revoked) refresh token is treated as reuse and revokes the entire
session — every token that session ever issued stops working, not just
the reused one.

## 9. Organization onboarding

- `POST /organizations` — atomically creates the organization, owner
  membership, primary branch, trial subscription, and initial
  entitlements, and writes an audit event; rolls back entirely on any
  failure (including an unrecognized trial plan code).
- `GET /organizations` — every organization the caller has an active
  membership in.
- `GET /organizations/{organizationId}` — requires an active membership
  in that organization.

`PATCH /organizations/{organizationId}` and the separate onboarding
sub-resource are not implemented; onboarding is a single atomic command,
not a multi-step resource.

## 10. Branches

- `GET /branches`
- `POST /branches`
- `GET /branches/{branchId}`
- `PATCH /branches/{branchId}`
- `POST /branches/{branchId}/activate`
- `POST /branches/{branchId}/deactivate`

Creation checks the effective `branches.max` entitlement.

## 11. Memberships, roles, and staff

### Invitations and memberships

Staff never join a business through public discovery — only through an
invitation created by someone already holding the `staff.invite`
permission (owner and manager by default).

- `POST /organizations/{organizationId}/staff-invitations` — requires
  `staff.invite`; targets one role (`roleId`, required — a system role or
  one belonging to this organization) and optionally one branch
  (`branchId`); returns the raw token exactly once (`rawToken` in the
  response body) — it is never retrievable again, and only its SHA-256
  hash is stored. There is no email/SMS delivery yet, so surfacing that
  token to the invitee is the caller's responsibility today.
- `GET /staff-invitations/{token}` — public, token-gated rather than
  authenticated. Returns only what an invitee needs to decide (business
  name, role name, branch name, status, expiry) — never the invitation's
  target email/phone or any other organization detail. An unknown token
  returns the same 404 as any other lookup failure, so no distinction
  leaks.
- `POST /staff-invitations/{token}/accept` — requires authentication.
  Atomically creates-or-reactivates the membership, ensures a
  `StaffProfile`, assigns the invited role and (when set) branch, and
  marks the invitation accepted. Fails with 409 if the invitation is not
  pending or has expired, and 403 if the invitation targeted a specific
  email that does not match the authenticated account's.
- `POST /staff-invitations/{token}/reject` — requires authentication;
  marks the invitation declined.
- `POST /organizations/{organizationId}/staff-invitations/{invitationId}/revoke`
  — requires `staff.invite`; only a still-pending invitation can be
  revoked.

Accepting, rejecting, and revoking are all audited. Membership
suspend/reactivate/remove endpoints (`GET`/`POST`/`DELETE
/memberships/...`) are not implemented yet.

### Roles and permissions

Not implemented yet: `GET /permissions`, `GET`/`POST`/`PATCH /roles`,
`PUT /roles/{roleId}/permissions`, `PUT
/memberships/{membershipId}/roles`, `PUT
/memberships/{membershipId}/branches`. Roles and permissions are already
fully enforced server-side (see docs/SECURITY.md and
TenantAccessGuard/TenantContextService) — only the management endpoints
for authoring custom roles remain unbuilt; the seeded system roles
(owner, manager, cashier, receptionist, service_provider, accountant)
cover every role assignment today.

### Staff profiles

Not implemented yet: `GET`/`PATCH /staff`, `PUT /staff/{staffId}/services`,
staff availability, and time-off endpoints. `StaffProfile` rows already
exist (created automatically on invitation acceptance) but have no
dedicated read/update endpoints yet.

## 12. Subscriptions and entitlements

- `GET /subscription`
- `GET /subscription/plans`
- `GET /subscription/entitlements`
- `POST /subscription/checkout-session`
- `POST /subscription/restore`
- `POST /subscription/cancel`
- `POST /subscription/resume`
- `GET /subscription/events`
- `POST /billing/webhooks/{provider}`

The webhook route is provider-authenticated, signature-verified, rate-limited, and idempotent. Mobile clients never submit a subscription state directly.

Example effective subscription response:

```json
{
  "data": {
    "status": "active",
    "accessMode": "FULL",
    "planCode": "growth",
    "currentPeriodEndsAt": "2026-10-03T00:00:00Z",
    "entitlements": {
      "branches.max": 3,
      "staff.max": 20,
      "reports.advanced": true
    }
  }
}
```

## 13. Services, scheduling, and availability

All routes below require organization membership, the named permission,
and (where a `:branchId` appears) branch scope, exactly like sections 10
and 11 — enforced by `TenantAccessGuard`. `services.read`/
`services.manage` gate the service-catalogue routes; the new
`availability.read`/`availability.manage` permissions gate business
hours, schedule exceptions, booking policy, and staff availability.

### Service categories

- `GET /organizations/{organizationId}/service-categories`
- `POST /organizations/{organizationId}/service-categories`
- `PUT /organizations/{organizationId}/service-categories/{categoryId}`
- `POST /organizations/{organizationId}/service-categories/{categoryId}/archive`
- `POST /organizations/{organizationId}/service-categories/{categoryId}/restore`

### Services

- `GET /organizations/{organizationId}/services`
- `POST /organizations/{organizationId}/services`
- `PUT /organizations/{organizationId}/services/{serviceId}`
- `POST /organizations/{organizationId}/services/{serviceId}/archive`
- `POST /organizations/{organizationId}/services/{serviceId}/restore`

A service is archived, never hard-deleted, once anything references it.
Price is always integer minor units; duration is always positive whole
minutes.

### Branch service configuration and staff assignment

- `GET /organizations/{organizationId}/branches/{branchId}/services`
- `PUT /organizations/{organizationId}/branches/{branchId}/services/{serviceId}` — enable/disable at this branch, and optional price/duration/bookability overrides
- `GET /organizations/{organizationId}/branches/{branchId}/services/{serviceId}/staff`
- `POST /organizations/{organizationId}/branches/{branchId}/services/{serviceId}/staff` — assign an eligible staff member (must hold an active membership and branch assignment)
- `DELETE /organizations/{organizationId}/branches/{branchId}/services/{serviceId}/staff/{staffProfileId}`

### Business hours, schedule exceptions, and booking policy

- `GET`/`PUT /organizations/{organizationId}/branches/{branchId}/business-hours` — `PUT` replaces the branch's full recurring weekly set atomically
- `GET /organizations/{organizationId}/branches/{branchId}/schedule-exceptions?from=&to=`
- `POST /organizations/{organizationId}/branches/{branchId}/schedule-exceptions` — closed, special hours, holiday, or emergency closure for one date; always overrides that date's recurring hours
- `DELETE /organizations/{organizationId}/branches/{branchId}/schedule-exceptions/{exceptionId}`
- `GET`/`PUT /organizations/{organizationId}/branches/{branchId}/booking-policy` — slot interval, lead time, horizon, buffers, cancellation cutoff, provider-selection rules; `GET` always returns a fully resolved policy (documented defaults when nothing is configured yet)

### Staff availability

- `GET`/`PUT /organizations/{organizationId}/branches/{branchId}/staff/{staffProfileId}/availability-rules` — `PUT` replaces the recurring weekly set for that staff member at that branch atomically
- `GET /organizations/{organizationId}/branches/{branchId}/staff/{staffProfileId}/availability-exceptions?from=&to=`
- `POST .../availability-exceptions` — time off, sick leave, holiday, or added special availability, full- or partial-day
- `DELETE .../availability-exceptions/{exceptionId}`

### Availability (organization-side preview)

- `GET /organizations/{organizationId}/branches/{branchId}/availability?serviceIds=&staffProfileId=&date=` (or `fromDate`/`toDate`, bounded — see section 29) — the same deterministic engine the public discovery endpoints use (section 29), without the discovery-visibility or customer-bookability checks, for staff previewing slots before a staff-assisted booking (section 15).

## 14. Customers

- `GET /customers`
- `POST /customers`
- `GET /customers/{customerId}`
- `PATCH /customers/{customerId}`
- `GET /customers/{customerId}/history`
- `GET /customers/{customerId}/appointments`
- `GET /customers/{customerId}/transactions`

Search and contact details are always organization-scoped.

## 15. Appointments

Appointment is not a `ServiceSession`, a `Payment`, or a `Transaction`.
A successfully created appointment is always `CONFIRMED`; there is no
separate unconfirmed/requested state, and no `completed` status —
completion is a claim about work performed, which only a
`ServiceSession` (section 17) can establish (docs/SECURITY.md section
30). `CONFIRMED` can become `CANCELLED` or `NO_SHOW` through the
explicit commands below only.

Requests to a business's discovery slug (below) resolve services,
prices, durations, eligible staff, and availability entirely
server-side; **prices, durations, end times, eligible staff, and
subscription eligibility are never accepted from the client.**

### Customer (authenticated Kora session, own appointments only)

- `POST /me/appointments` — `{businessSlug, branchId, serviceIds[], staffProfileId?, startAt, idempotencyKey}`; `staffProfileId` omitted means "any available provider", assigned deterministically and reserved atomically
- `GET /me/appointments` — cursor-paginated
- `GET /me/appointments/{appointmentId}`
- `POST /me/appointments/{appointmentId}/cancel` — `{reason?}`
- `POST /me/appointments/{appointmentId}/reschedule` — `{startAt, staffProfileId?}`

A different customer's appointment id returns `404`, never `403` — its
existence is never confirmed to a caller who does not own it.

### Organization (authenticated staff, `appointments.read`/`appointments.manage`, branch-scoped)

- `GET /organizations/{organizationId}/branches/{branchId}/appointments?from=&to=&cursor=&limit=` — bounded date range, cursor-paginated
- `GET /organizations/{organizationId}/branches/{branchId}/appointments/{appointmentId}`
- `POST /organizations/{organizationId}/branches/{branchId}/appointments` — staff-assisted booking; `{serviceIds[], staffProfileId, startAt, customerProfileId | newCustomer, idempotencyKey?}` — exactly one of an existing Kora customer or a walk-in-style `newCustomer` (`{name, phoneE164?, email?}`) is required
- `POST .../appointments/{appointmentId}/cancel`
- `POST .../appointments/{appointmentId}/reschedule`
- `POST .../appointments/{appointmentId}/no-show` — only a past `CONFIRMED` appointment

A business appointment response includes only the customer information
necessary to provide the booked service — never full global customer
information or cross-organization history.

### Idempotency and conflicts

Repeating a customer booking request with the same `idempotencyKey` and
identical payload returns the original appointment (`201`, not a
duplicate); reusing the key with a different payload returns `409
IDEMPOTENCY_KEY_REUSED`. A genuine scheduling conflict — the requested
staff member and occupied time overlap an existing `CONFIRMED`
appointment, enforced by a database `EXCLUDE` constraint, never only by
a prior availability read — returns the standard error envelope with
`409 SLOT_UNAVAILABLE` and never a raw database error. A failed
reschedule leaves the original appointment completely unchanged
(docs/ARCHITECTURE.md section 6).

## 16. Walk-ins and queue

A `QueueEntry` is a customer waiting for or receiving service at a
branch *today* — distinct from an `Appointment` (a reservation) and a
`ServiceSession` (actual work performed, section 17). `QueueEntry`
itself is the durable walk-in record; there is no separate `WalkIn`
resource (docs/DATA_MODEL.md section 7).

### Intake (`queue.manage`)

- `POST /organizations/{organizationId}/branches/{branchId}/queue/walk-ins` — `{customerRecordId | newCustomer, serviceIds[], priority?, notes?}`; exactly one of an existing organization customer or a walk-in-style `newCustomer` (`{name, phoneE164?, email?}`) is required. A newly entered email/phone is never used to search for or link an existing global `CustomerProfile` — only a plain `CustomerRecord` is created.
- `POST /organizations/{organizationId}/appointments/{appointmentId}/check-in` — checks a `CONFIRMED` appointment into its own branch's queue for today; carries over its assigned provider and services. Never mutates the appointment itself, and only permitted on the appointment's own branch-local calendar date. Rejects a cancelled/no-show appointment (`409 APPOINTMENT_NOT_CHECKINABLE`) and a duplicate check-in (`409 ALREADY_CHECKED_IN`).

Both intake commands accept an `Idempotency-Key` header, scoped per
acting staff membership: a genuine retry with the same request
fingerprint returns the original queue entry; reusing the key with a
different request returns `409 IDEMPOTENCY_CONFLICT`.

### Queries (`queue.read`)

- `GET /organizations/{organizationId}/branches/{branchId}/queue?businessDate=&status=&assignedStaffProfileId=` — `businessDate` defaults to today under the branch's own timezone. Returns `{branchId, businessDate, revision, serverTime, entries[], counts}` — `revision` and `serverTime` give Android/iOS a safe polling foundation with no WebSocket or realtime vendor. `counts` always reflects the whole day regardless of the `status`/`assignedStaffProfileId` filters applied to `entries`.
- `GET /organizations/{organizationId}/queue-entries/{queueEntryId}`

### Commands (`queue.manage`)

- `POST /organizations/{organizationId}/queue-entries/{queueEntryId}/call`
- `POST /organizations/{organizationId}/queue-entries/{queueEntryId}/return-to-waiting`
- `POST /organizations/{organizationId}/queue-entries/{queueEntryId}/assign` — `{staffProfileId}`; rejects a staff member who cannot perform every requested service at this branch
- `POST /organizations/{organizationId}/queue-entries/{queueEntryId}/cancel` — `{reason?}`
- `POST /organizations/{organizationId}/queue-entries/{queueEntryId}/no-show`
- `POST /organizations/{organizationId}/queue-entries/{queueEntryId}/start-service` — `{staffProfileId?}`, omitted when the entry already carries an assigned provider; see section 17

State machine: `WAITING -> CALLED | IN_SERVICE | CANCELLED | NO_SHOW`;
`CALLED -> WAITING | IN_SERVICE | CANCELLED | NO_SHOW`. `IN_SERVICE` is
reachable only through `start-service`, and `COMPLETED` only through
`ServiceSession` completion — never a direct command. Terminal states
cannot be reopened. An invalid transition returns `409
QUEUE_ENTRY_INVALID_TRANSITION`; a stale concurrent update returns a
plain `409`. Default ordering: priority classification, then join
time, then ticket number, then id.

None of these routes are branch-scoped in the URL beyond the two intake
routes above — each command loads the entry and re-checks branch access
against the caller's own membership.

## 17. Service sessions

The operational representation of work actually performed
(docs/DATA_MODEL.md section 7). `serviceTotalMinor` is the value of
performed services, not proof that money was received — no
payment/transaction/receipt/commission field exists here or ever will
on this resource.

- `GET /organizations/{organizationId}/service-sessions?branchId=&status=&assignedStaffProfileId=&cursor=&limit=` (`service_sessions.read`) — cursor-paginated; an explicit `branchId` must be one of the caller's own assigned branches, and omitting it implicitly scopes results to those branches unless the caller holds the broad `branches.manage` permission
- `GET /organizations/{organizationId}/service-sessions/{serviceSessionId}` (`service_sessions.read`)
- `PUT /organizations/{organizationId}/service-sessions/{serviceSessionId}/items` — `{serviceIds[]}`, ordered; replaces the full item list, only while `IN_PROGRESS`; server-resolves every name/duration/price/currency snapshot, requires one currency
- `POST /organizations/{organizationId}/service-sessions/{serviceSessionId}/complete`
- `POST /organizations/{organizationId}/service-sessions/{serviceSessionId}/cancel` — `{reason, disposition}`; `disposition` is `RETURN_TO_QUEUE` (returns the queue entry to `WAITING`, releasing the provider for another session) or `CANCEL_VISIT` (cancels the queue entry too); both fields required

`start-service` (section 16) is gated by `service_sessions.start` **or**
`service_sessions.perform` **or** `service_sessions.manage` — an any-of
permission set (`@RequireAnyPermission`, the OR counterpart to the
usual AND-only `@RequirePermissions`); `PUT .../items`, `complete`, and
`cancel` are gated by `service_sessions.perform` **or**
`service_sessions.manage` only (`.start` reaches `start-service` alone,
nothing else). Each permission carries a different scope once past
that coarse gate:

- `service_sessions.manage` (owner, manager): unrestricted — may start
  service for any provider, and complete/cancel/edit any session.
- `service_sessions.perform` (service provider): may start, complete,
  cancel, and edit only a session whose `assignedStaffProfileId` is
  their own `StaffProfile` — never another provider's.
- `service_sessions.start` (receptionist, manager, owner): may start
  service only for the provider *already assigned* to the queue entry
  (via `queue.manage`'s `assign` command); redirecting the work to a
  *different* provider at start time additionally requires
  `queue.manage`. Grants no ability to complete, cancel, or edit the
  resulting session, or act as its assigned provider.

A provider can never complete or cancel another provider's session
without `.manage`, and a `.start`-only caller can never complete or
cancel any session at all.

State machine: `IN_PROGRESS -> COMPLETED` (via `complete`, requiring at
least one item) or `IN_PROGRESS -> CANCELLED` (via `cancel`). Starting a
session atomically claims the queue entry, resolves and validates the
provider, snapshots items, moves the queue entry to `IN_SERVICE`, writes
queue history, and appends the session's own initial
`ServiceSessionStatusHistory` row (`previousStatus: null, newStatus:
IN_PROGRESS`) — a failed attempt (`409 QUEUE_ENTRY_ALREADY_IN_SERVICE`
or `409 STAFF_ALREADY_SERVING`, backed by two PostgreSQL partial unique
indexes, docs/DATA_MODEL.md section 12) leaves the queue entry and
session history completely unchanged, the same all-or-nothing guarantee
appointment booking and reschedule already provide. Completion and
cancellation each atomically append their own history row the same
way — an append-only domain lifecycle ledger per session, separate
from the platform-wide audit trail (docs/DATA_MODEL.md section 7/10,
docs/SECURITY.md section 31). Replacing items never appends a history
row — only an actual status transition does. Completion atomically
freezes the total and moves the queue entry to `COMPLETED`; a queue
entry is never manually marked `COMPLETED`.

## 18. Checkout and transactions

Implemented (docs/ROADMAP.md Phase 6). See docs/ARCHITECTURE.md section 11 for why Checkout, PaymentRecord, and Transaction are separate entities rather than one mutable row.

- `POST /organizations/{organizationId}/service-sessions/{serviceSessionId}/checkout`
- `GET /organizations/{organizationId}/checkouts`
- `GET /organizations/{organizationId}/checkouts/{checkoutId}`
- `POST /organizations/{organizationId}/checkouts/{checkoutId}/adjustments`
- `POST /organizations/{organizationId}/checkouts/{checkoutId}/void`
- `GET /organizations/{organizationId}/transactions`
- `GET /organizations/{organizationId}/transactions/{transactionId}`

There is no endpoint that directly creates a Transaction — one is posted automatically, exactly once per Checkout, the moment confirmed payments exactly cover the total (see section 19). Checkout creation snapshots the completed ServiceSession's own item prices into `CheckoutLineItem` rows; it never recalculates from the live Service catalogue, and a checkout worth zero is rejected (`CHECKOUT_TOTAL_INVALID`) rather than silently settled — a deliberate `NO_CHARGE` workflow is deferred to a later phase. Concurrent duplicate creation for the same service session converges on the single existing Checkout rather than erroring; a later, non-concurrent duplicate call gets `CHECKOUT_ALREADY_EXISTS`.

Example adjustment request:

```json
{
  "type": "DISCOUNT",
  "amountMinor": 500,
  "reason": "Loyalty discount"
}
```

Adjustments are append-only (a correction is a new compensating adjustment, never an edit) and require `checkouts.adjust`; a discount can never take the total below zero. Once any PaymentRecord has ever been created against a Checkout, its line items and adjustments lock permanently, even if that payment is later voided.

## 18a. Cash controls and refund/reversal corrections

Implemented (docs/ROADMAP.md Phase 7) — see docs/ARCHITECTURE.md section 22 for the full model. Two related but independent additions: branch cash-drawer custody, and correcting a posted Transaction.

### Cash policy and registers

- `GET`/`PUT /organizations/{organizationId}/branches/{branchId}/cash-policy`
- `GET`/`POST /organizations/{organizationId}/branches/{branchId}/cash-registers`
- `PATCH /organizations/{organizationId}/branches/{branchId}/cash-registers/{registerId}`
- `POST /organizations/{organizationId}/branches/{branchId}/cash-registers/{registerId}/archive`

`PUT .../cash-policy` (`cash_registers.manage`) sets `mode` to `OPTIONAL` or `REQUIRED`; a branch with no policy configured behaves as `OPTIONAL`. `POST .../cash-registers` (`cash_registers.manage`) requires a branch-unique `code`; archiving is rejected while the register has an open session (`409 CASH_REGISTER_HAS_OPEN_SESSION`).

### Cash sessions

- `GET`/`POST /organizations/{organizationId}/cash-sessions` (`POST` at `.../cash-sessions/open`)
- `GET /organizations/{organizationId}/cash-sessions/{cashSessionId}`
- `POST /organizations/{organizationId}/cash-sessions/{cashSessionId}/movements`
- `POST /organizations/{organizationId}/cash-sessions/{cashSessionId}/close`
- `POST /organizations/{organizationId}/cash-sessions/{cashSessionId}/review`

Example open request:

```json
{ "registerId": "reg_...", "currency": "GHS", "openingFloatMinor": 5000 }
```

Opening (`cash_sessions.open`) fails `409 CASH_SESSION_ALREADY_OPEN` if the register already has an open session in that currency. `.../movements` (`cash_sessions.operate`) only ever accepts a manual `type` — `CASH_IN`, `CASH_OUT`, or `SAFE_DROP`, each requiring a non-blank `reason`; `OPENING_FLOAT`, `PAYMENT_RECEIVED`, and `REFUND_PAID` are system-written only and rejected at the request-validation level if supplied here. `.../close` (`cash_sessions.close`) accepts `countedCashMinor`, computes `expectedClosingCashMinor` from the session's own ledger entries, and transitions `OPEN` → `CLOSED` exactly once. `.../review` (`cash_sessions.reconcile`, owner/manager only) accepts an `outcome` (`MATCHED` | `ACCEPTED_VARIANCE` | `INVESTIGATION_REQUIRED`) and a `reason`, moving `CLOSED` → `REVIEWED`. A cashier may only open/operate/close a session they themselves opened, unless they additionally hold `cash_sessions.reconcile`. Recording a CASH payment (section 19) or executing a CASH refund (below) accepts an optional `cashSessionId` — required when the branch's cash policy is `REQUIRED`, validated (and its `PAYMENT_RECEIVED`/`REFUND_PAID` ledger entry created atomically) when supplied under `OPTIONAL`.

### Refund and reversal requests

- `GET /organizations/{organizationId}/transaction-corrections`
- `GET /organizations/{organizationId}/transaction-corrections/{correctionId}`
- `POST /organizations/{organizationId}/transactions/{transactionId}/refund-requests`
- `POST /organizations/{organizationId}/transactions/{transactionId}/reversal-requests`
- `POST /organizations/{organizationId}/transaction-corrections/{correctionId}/approve`
- `POST /organizations/{organizationId}/transaction-corrections/{correctionId}/reject`
- `POST /organizations/{organizationId}/transaction-corrections/{correctionId}/cancel`
- `POST /organizations/{organizationId}/transaction-corrections/{correctionId}/execute`

Example refund request (`refunds.request`, `Idempotency-Key` required):

```json
{
  "reason": "Customer dissatisfied with one service",
  "returnMethod": "CASH",
  "lines": [{ "originalTransactionLineItemId": "txli_...", "requestedAmountMinor": 2500 }]
}
```

Only `originalTransactionLineItemId` and `requestedAmountMinor` are ever consulted per line — a client-supplied price, currency, staff id, or total is never accepted, and any unrecognized field in the request body is rejected outright (`400`, global whitelist validation), not silently ignored. A requested amount exceeding that line's own remaining refundable amount is rejected (`409 CORRECTION_LINE_AMOUNT_EXCEEDS_ORIGINAL` at request time, `409 CORRECTION_EXCEEDS_REMAINING_REFUNDABLE` if a race is only caught at execution). A reversal request (`transactions.reverse`; owner/manager only, deliberately narrower than `refunds.request`) takes no line-level input at all — it always covers every original line at its full original amount — and is rejected (`409 CORRECTION_ALREADY_EXECUTED`) once any refund or reversal has already been executed against that transaction, both at request time and, defensively, again at execution.

`.../approve` and `.../reject` (`refunds.approve`) enforce separation of duties: the membership that requested a correction can never approve or reject it themselves (`403 CORRECTION_SELF_DECISION_FORBIDDEN`), with one exception — an active owner with no other membership in the organization holding `refunds.approve` may self-decide, but only by supplying a non-empty `overrideReason` (`400` without one), and the decision is recorded with `soloOwnerOverride: true` plus a separate `correction.solo_owner_override` audit event. `.../cancel` (`refunds.request`) is available to the requester themselves, or to anyone holding `refunds.approve`, only while the correction is still `REQUESTED` or `APPROVED`. `.../execute` (`refunds.execute`, `Idempotency-Key` required) is a distinct action from approval — an authorized cashier/manager/owner other than (or the same as) the approver may execute — and only ever succeeds on an `APPROVED` correction, atomically posting the immutable corrective Transaction described in docs/ARCHITECTURE.md section 22.

There is no unauthenticated or customer-facing refund endpoint anywhere — every correction action requires an authenticated business-workspace membership with the specific permission above.

## 19. Payments and verification

### Recording

- `GET /organizations/{organizationId}/checkouts/{checkoutId}/payments`
- `POST /organizations/{organizationId}/checkouts/{checkoutId}/payments`

Recording a payment requires `Idempotency-Key` (unlike Checkout creation, where it is optional — see section 25). `method` is CASH, MOBILE_MONEY, CARD, BANK_TRANSFER, or OTHER: recording categories only, with no payment-gateway integration behind any of them. Combined active (non-voided) applied amounts across every payment on a Checkout can never exceed its total (`CHECKOUT_BALANCE_EXCEEDED`); split/partial payments are supported by recording several. `tenderedAmountMinor` is accepted only for CASH and may exceed `appliedAmountMinor` — the response's `changeMinor` is derived, never itself revenue.

Example recording request:

```json
{
  "method": "CASH",
  "appliedAmountMinor": 8000,
  "tenderedAmountMinor": 10000,
  "currency": "GHS",
  "cashSessionId": "cashsess_..."
}
```

Recording a payment never creates a Transaction by itself — it only ever moves the Checkout to `AWAITING_VERIFICATION`. `cashSessionId` (section 18a) is optional unless the branch's cash policy is `REQUIRED`, and is rejected (`400`) for any non-CASH method; when supplied, its `PAYMENT_RECEIVED` `CashLedgerEntry` is created atomically alongside the `PaymentRecord` itself.

### Verification

- `GET /organizations/{organizationId}/payment-verifications/pending` — records assigned to the *authenticated* provider only, never every branch payment
- `POST /organizations/{organizationId}/payments/{paymentId}/confirm`
- `POST /organizations/{organizationId}/payments/{paymentId}/dispute`
- `POST /organizations/{organizationId}/payments/{paymentId}/void`

Confirming and disputing both require `payments.verify_own`, and only the ServiceSession's assigned provider may act on a given payment — never a different provider, and never the recorder confirming their own claim (`PAYMENT_SELF_CONFIRMATION_FORBIDDEN`). An owner/manager holding `payments.resolve` may instead confirm directly as a management override, but only with an explicit `reason`:

```json
{ "reason": "Provider unreachable, confirmed against till slip" }
```

Disputing requires a non-empty `reason`. Voiding a still-`RECORDED` (not yet confirmed) payment — the correction path for a data-entry mistake — requires `payments.resolve`.

### Dispute resolution

- `GET /organizations/{organizationId}/payment-disputes`
- `GET /organizations/{organizationId}/payment-disputes/{disputeId}`
- `POST /organizations/{organizationId}/payment-disputes/{disputeId}/resolve`

Resolution requires `payments.resolve` and a `resolution` of `CONFIRM_PAYMENT` or `REJECT_PAYMENT`:

```json
{
  "resolution": "REJECT_PAYMENT",
  "resolutionNote": "Confirmed with the customer: never paid"
}
```

A rejected payment moves to VOIDED and the Checkout's status is recalculated to the correct derived state (typically back to `OPEN`), safely allowing a replacement payment to be recorded. Resolving an already-resolved dispute returns `PAYMENT_DISPUTE_ALREADY_RESOLVED`.

## 20. Commissions

Implemented (docs/ROADMAP.md Phase 7). Commission *rules* (the policy) and commission *accruals* (the immutable calculated result) are managed and read through entirely separate permission-gated endpoints — see docs/ARCHITECTURE.md section 21.

- `GET /organizations/{organizationId}/commission-rules`
- `GET /organizations/{organizationId}/commission-rules/{ruleId}`
- `POST /organizations/{organizationId}/commission-rules`
- `POST /organizations/{organizationId}/commission-rules/{ruleId}/supersede`
- `POST /organizations/{organizationId}/commission-rules/{ruleId}/deactivate`
- `GET /organizations/{organizationId}/commissions`
- `GET /organizations/{organizationId}/me/earnings`

Example rule creation:

```json
{
  "type": "PERCENTAGE",
  "rateBasisPoints": 1000,
  "basis": "GROSS_LINE",
  "staffProfileId": "staff_..."
}
```

`rateBasisPoints` (0-10000) is required and exclusive for `PERCENTAGE`; `fixedAmountMinor`/`fixedCurrency` are required and exclusive for `FIXED`; a `NONE`-type rule takes neither. `branchId`/`staffProfileId`/`serviceId` are each independently optional — the eight-level precedence this enables is documented in docs/ARCHITECTURE.md section 21. A rule is never edited in place: `.../supersede` closes the current rule and creates a new one with the given terms at the same scope; `.../deactivate` closes it with no replacement. Only one current rule may exist per exact scope (`409 COMMISSION_RULE_SCOPE_CONFLICT`); acting on a rule that is already superseded or deactivated returns `409 COMMISSION_RULE_NOT_CURRENT`.

`GET .../commissions` (org-wide, `commissions.read_all`) supports `branchId`, `staffProfileId`, `source` (POLICY/NO_POLICY), `from`/`to`, and pagination filters. `GET .../me/earnings` (`commissions.read_own`) always resolves the caller's own StaffProfile server-side — a client-supplied staff id is never accepted — and returns line-level accrual detail enriched with the originating transaction's reference and the service name.

There is no endpoint to create, edit, or delete a `CommissionAccrual` directly — every row is written only by the internal posting flow described in section 18, or (as of docs/ROADMAP.md Phase 7) the correction-execution flow in section 18a. Every accrual now carries a `kind` (`EARNED` | `REFUNDED` | `REVERSED`); a REFUNDED/REVERSED row's `originalAccrualId` points back at the EARNED accrual it adjusts, and both `GET .../commissions` and `GET .../me/earnings` return it like any other row — a client aggregates earned/refunded/reversed/net per currency from the `kind` field, or reads the pre-aggregated breakdown on `GET .../reports/staff-performance`/`.../reports/commissions` (section 22).

## 21. Receipts

Implemented (docs/ROADMAP.md Phase 7) — a plain, immutable service receipt, not a statutory VAT or tax invoice (no TIN, no tax calculation, no compliance claim). Issued automatically and atomically the moment a Transaction posts; there is no endpoint to create one directly.

- `GET /organizations/{organizationId}/receipts`
- `GET /organizations/{organizationId}/receipts/{receiptId}`
- `GET /me/receipts`
- `GET /me/receipts/{receiptId}`

The business-side routes (`receipts.read`) are organization-scoped like every other endpoint in this document. The customer-side routes carry no `organizationId` at all — a receipt is visible to `/me/receipts` only when its `customerRecordId` is linked to the authenticated user's own `CustomerProfile`; a walk-in customer with no linked Kora account is visible only through the business-side routes, never through `/me/receipts`, and a customer can never see another customer's receipt (`404`, not `403`, either way — existence is never confirmed to a caller who cannot see it).

As of docs/ROADMAP.md Phase 7, a receipt's `kind` is `SALE_RECEIPT`, `REFUND_RECEIPT`, or `REVERSAL_RECORD` — the latter two issued automatically, exactly once, the moment a `TransactionCorrection` executes (section 18a), through the identical business-side/customer-side access rules above. A corrective receipt additionally carries `originalReceiptId`/`originalReceiptNumber`/`originalTransactionReference` (pointing back at the sale it corrects), `correctionReason`, and — for a `REFUND_RECEIPT` only — `remainingRefundableMinor`. It is never called a statutory tax invoice or credit note, matching the plain-receipt stance above.

## 22. Reports

Implemented (docs/ROADMAP.md Phase 7), owner/manager only (`reports.read`). Every figure is derived from an already-POSTED Transaction and its snapshots — see docs/ARCHITECTURE.md section 21 and docs/SECURITY.md section 34 for the full authority model, including exactly which figures count as revenue.

- `GET /organizations/{organizationId}/reports/overview`
- `GET /organizations/{organizationId}/reports/revenue`
- `GET /organizations/{organizationId}/reports/staff-performance`
- `GET /organizations/{organizationId}/reports/services`
- `GET /organizations/{organizationId}/reports/payment-methods`
- `GET /organizations/{organizationId}/reports/commissions`
- `GET /organizations/{organizationId}/reports/cash-reconciliation` (docs/ROADMAP.md Phase 7)

Every endpoint requires `from` and `to` (ISO date-times, `to` not before `from`, span capped at 366 days) and accepts an optional `branchId`. `revenue` additionally buckets by calendar day: a branch-scoped request groups by that branch's own local date automatically; an organization-wide request (no `branchId`) requires an explicit, IANA-validated `timezone` query parameter instead of silently picking one branch's zone or mixing ambiguous local-day boundaries (`400` without it). `staff-performance`, `services`, `payment-methods`, `commissions`, and `cash-reconciliation` return a paginated list of aggregated entries (`cursor`/`limit`); every monetary figure across every endpoint is grouped strictly by currency — two currencies are never summed into one total.

Example overview response shape:

```json
{
  "postedRevenue": [{ "currency": "GHS", "amountMinor": 850000 }],
  "transactionCount": 17,
  "averageTransactionValue": [{ "currency": "GHS", "amountMinor": 50000 }],
  "completedServiceCount": 21,
  "commissionAccrued": [{ "currency": "GHS", "amountMinor": 85000 }],
  "pendingPaymentClaimCount": 2,
  "disputedPaymentClaimCount": 0,
  "grossPostedSales": [{ "currency": "GHS", "amountMinor": 850000 }],
  "refundAmount": [{ "currency": "GHS", "amountMinor": 25000 }],
  "reversalAmount": [],
  "netPostedRevenue": [{ "currency": "GHS", "amountMinor": 825000 }],
  "refundTransactionCount": 1,
  "reversalTransactionCount": 0
}
```

`pendingPaymentClaimCount`/`disputedPaymentClaimCount` describe RECORDED/DISPUTED `PaymentRecord`s — operational metrics, never revenue, and never combined with `postedRevenue` into one number. As of docs/ROADMAP.md Phase 7, `postedRevenue`/`transactionCount`/`averageTransactionValue`/`commissionAccrued` keep their original gross-SALE-only meaning unchanged, and every endpoint below gains an explicit gross/refunded/reversed/net split without redefining any existing field:

- `staff-performance` entries keep `revenue`/`commissionAccrued` (gross SALE / EARNED only) and add `refundedRevenue`/`reversedRevenue`/`netRevenue`/`commissionRefunded`/`commissionReversed`/`netCommission`.
- `services` entries keep `revenue`/`serviceCount` (gross SALE only, SALE-line count) and add `refundedAmount`/`reversedAmount`/`netAmount`.
- `payment-methods` entries keep `total`/`count` (collections only) and add `returnedTotal`/`returnedCount`/`netTotal` (recorded returns).
- `commissions` entries keep `policyAccrued`/`noPolicyAccrued` (EARNED only) and add `refunded`/`reversed`/`net`.

`GET .../reports/cash-reconciliation` returns one entry per `CashSession` in range: `openingFloatMinor`, `paymentReceivedMinor`, `cashInMinor`, `cashOutMinor`, `safeDropMinor`, `cashRefundMinor`, `expectedClosingCashMinor`, `countedCashMinor`, `varianceMinor`, and `reviewOutcome` — every figure derived only from that session's own immutable `CashLedgerEntry` rows and close snapshot, described only as physical cash custody and never as revenue or bank settlement (docs/ARCHITECTURE.md section 22).

## 23. Notifications and audit

- `GET /notifications`
- `POST /notifications/{notificationId}/read`
- `POST /notifications/read-all`
- `GET /audit-events`
- `GET /audit-events/{auditEventId}`

Audit routes are read-only to application users. Business commands create audit events internally.

## 24. Realtime contract

Authenticated clients may subscribe to organization and authorized branch topics. Events contain resource IDs, event type, revision, and occurred time—not full sensitive records. The client refetches authoritative data after relevant events.

Example event:

```json
{
  "type": "payment.verification.disputed",
  "organizationId": "org_...",
  "branchId": "branch_...",
  "resourceId": "verification_...",
  "revision": 4,
  "occurredAt": "2026-09-03T20:44:03Z"
}
```

## 25. Idempotency behavior

For an idempotent command:

1. The client generates one stable key before the first attempt.
2. Retries reuse the same key and identical request body.
3. The server fingerprints the request.
4. A completed duplicate returns the stored result.
5. An in-progress duplicate returns a retryable conflict or waits within a bounded policy.
6. The same key with a different fingerprint returns `409 IDEMPOTENCY_CONFLICT`.

Implemented for appointment booking, queue intake, and — as of docs/ROADMAP.md Phase 6 — recording a payment (`Idempotency-Key` required) and, defensively, creating a Checkout (`Idempotency-Key` not required, since `Checkout.serviceSessionId` is itself unique: a concurrent duplicate creation converges on the same existing row without needing a client-supplied key at all). The financial-domain keys are stored in one generic, operation-discriminated table (`FinancialIdempotencyKey`, docs/DATA_MODEL.md section 8) scoped by organization, membership, operation, and key — rather than one narrow table per command.

## 26. Optimistic concurrency

Mutable state-machine resources expose a `version`. Commands submit that version or an `If-Match` value. Stale commands return a conflict containing the current safe resource version so the client can refresh rather than overwrite newer work.

## 27. Initial permission vocabulary

- `organization.read`, `organization.update`
- `branches.read`, `branches.manage`
- `subscriptions.read`, `subscriptions.manage`
- `staff.read`, `staff.manage`, `staff.invite`
- `roles.read`, `roles.manage`
- `services.read`, `services.manage`
- `availability.read`, `availability.manage`
- `customers.read`, `customers.manage`
- `appointments.read`, `appointments.manage`
- `queue.read`, `queue.manage`
- `service_sessions.read`, `service_sessions.start`, `service_sessions.perform`, `service_sessions.manage`
- `checkouts.read`, `checkouts.create`, `checkouts.adjust`, `checkouts.void`
- `payments.read`, `payments.record`, `payments.verify_own`, `payments.resolve`
- `transactions.read`, `transactions.reverse`
- `commissions.read_own`, `commissions.read_all`, `commissions.manage`, `commissions.manage_rules`
- `receipts.read`
- `cash_registers.read`, `cash_registers.manage`
- `cash_sessions.read`, `cash_sessions.open`, `cash_sessions.operate`, `cash_sessions.close`, `cash_sessions.reconcile`
- `refunds.read`, `refunds.request`, `refunds.approve`, `refunds.execute`
- `reconciliation.perform`, `reconciliation.approve`
- `reports.read`, `reports.basic`, `reports.advanced`
- `audit.read`
- `business_profile.manage`

`checkouts.*`, `payments.read`/`payments.record`/`payments.verify_own`/`payments.resolve`, and `transactions.read` are implemented as of docs/ROADMAP.md Phase 6; `commissions.read_own`/`commissions.read_all`/`commissions.manage`, `receipts.read`, `reports.read`, `cash_registers.*`, `cash_sessions.*`, `refunds.*`, and `transactions.reverse` are implemented as of Phase 7 — see sections 27a, 27b, and 27c below for the exact role grants. A handful of additional codes seeded ahead of their own future phase (`transactions.create`, `transactions.cancel`, `payments.void`, `payments.refund`, `verifications.*`, `commissions.manage_rules`, `reconciliation.*`, `reports.basic`, `reports.advanced`) exist in the permission vocabulary but are not yet wired to any route — `commissions.manage_rules` and `reports.basic`/`reports.advanced` in particular predate, and are superseded for this stage's purposes by, the newer `commissions.manage` and `reports.read` codes actually enforced below; `payments.refund` similarly predates, and is superseded by, the newer `refunds.*` codes actually enforced in section 27c.

### 27a. Financial-domain role grants (Phase 6)

| Permission | OWNER | MANAGER | CASHIER | RECEPTIONIST | SERVICE_PROVIDER |
| --- | --- | --- | --- | --- | --- |
| `checkouts.read` | ✓ | ✓ | ✓ | ✓ | |
| `checkouts.create` | ✓ | ✓ | ✓ | ✓ | |
| `checkouts.adjust` | ✓ | ✓ | | | |
| `checkouts.void` | ✓ | ✓ | | | |
| `payments.read` | ✓ | ✓ | ✓ | | |
| `payments.record` | ✓ | ✓ | ✓ | | |
| `payments.verify_own` | ✓ | ✓ | | | ✓ |
| `payments.resolve` | ✓ | ✓ | | | |
| `transactions.read` | ✓ | ✓ | ✓ | | |

A membership's effective permissions are the union across every role it holds (e.g. a receptionist additionally granted the cashier role gets both roles' grants). `payments.verify_own` only ever authorizes acting on a record assigned to the caller's *own* StaffProfile — holding the permission grants no blanket authority over every payment (see docs/SECURITY.md section 12 and docs/ARCHITECTURE.md section 12).

### 27b. Commission, receipt, and reporting role grants (Phase 7)

| Permission | OWNER | MANAGER | CASHIER | RECEPTIONIST | SERVICE_PROVIDER |
| --- | --- | --- | --- | --- | --- |
| `commissions.read_own` | ✓ | | | | ✓ |
| `commissions.read_all` | ✓ | ✓ | | | |
| `commissions.manage` | ✓ | ✓ | | | |
| `receipts.read` | ✓ | ✓ | ✓ | ✓ | |
| `reports.read` | ✓ | ✓ | | | |

`commissions.read_own` only ever returns accruals belonging to the caller's own StaffProfile, resolved server-side — never a client-supplied staff id (`GET .../me/earnings`). A service provider deliberately has neither `receipts.read` nor `reports.read` by default.

### 27c. Cash control and refund/reversal role grants (Phase 7)

| Permission | OWNER | MANAGER | CASHIER | RECEPTIONIST | SERVICE_PROVIDER |
| --- | --- | --- | --- | --- | --- |
| `cash_registers.read` | ✓ | ✓ | ✓ | ✓ | |
| `cash_registers.manage` | ✓ | ✓ | | | |
| `cash_sessions.read` | ✓ | ✓ | ✓ | ✓ | |
| `cash_sessions.open` | ✓ | ✓ | ✓ | | |
| `cash_sessions.operate` | ✓ | ✓ | ✓ | | |
| `cash_sessions.close` | ✓ | ✓ | ✓ | | |
| `cash_sessions.reconcile` | ✓ | ✓ | | | |
| `refunds.read` | ✓ | ✓ | ✓ | ✓ | |
| `refunds.request` | ✓ | ✓ | ✓ | ✓ | |
| `refunds.approve` | ✓ | ✓ | | | |
| `refunds.execute` | ✓ | ✓ | ✓ | | |
| `transactions.reverse` | ✓ | ✓ | | | |

A cashier may open/operate/close only a cash session they themselves opened unless additionally holding `cash_sessions.reconcile` (owner/manager only); the same override permission is required to review a closed session at all. The correction workflow's separation of duties (docs/ARCHITECTURE.md section 22) sits on top of this table, not instead of it: holding `refunds.approve` is necessary but never sufficient to approve a specific correction, since the requester can never approve their own request regardless of which permissions they hold, and `refunds.approve`/`refunds.execute` are deliberately separate actions even when the same manager holds both. A receptionist may request a refund but never approve, execute, or reverse one; a service provider holds none of the permissions in this table.

Permission codes are seeded and stable. Roles map to permissions and may later be customized by authorized organizations.

## 28. Contract testing

- OpenAPI validates request and response shapes.
- Integration tests cover every command's success, validation, authorization, state conflict, and tenant-isolation paths.
- Consumer tests verify Android parsing against representative responses.
- Financial contract tests repeat the same idempotency key and simulate uncertain network outcomes.
- Backward compatibility is checked before API releases used by published mobile versions.

## 29. Public business discovery

Every route below is public — no `Authorization` header, no organization
context, reachable by a customer-workspace user or an anonymous visitor
equally. See section 30 for how discovery relates to the rest of the
platform, and docs/DATA_MODEL.md's discovery section for the underlying
`PublicBusinessProfile`/`Branch` fields.

- `GET /discovery/businesses` — search. Query params: `text` (matched
  against display name and search keywords), `category` (a
  `BusinessCategory.code`), `city`, `region`, `country`,
  `verificationStatus`, `nearLat`/`nearLng`/`radiusKm` (an approximate
  bounding-box filter — not a distance sort, and no "distance" value is
  ever returned; see docs/DATA_MODEL.md for why), `limit` (1–50, default
  20), `cursor`. Only `PUBLIC`, published profiles appear here.
- `GET /discovery/businesses/{slug}` — resolves `PUBLIC` or `LINK_ONLY`
  published profiles by exact slug (a `LINK_ONLY` business is reachable
  by whoever has its link, just not by browsing); `PRIVATE` or
  unpublished profiles return `404`, identically to an unknown slug.
- `GET /discovery/businesses/{slug}/branches` — that business's
  discoverable branches (`Branch.isDiscoverable = true`) only.
- `GET /discovery/categories` — the seeded category vocabulary.

### Services and availability, per business branch

Reachable the same way as the routes above — public, no session, subject
to the same `PUBLIC`/`LINK_ONLY`/`PRIVATE` visibility rule (a `LINK_ONLY`
or `PUBLIC` business's branch works; a `PRIVATE` one, or an unpublished
one, returns `404` identically to an unknown slug or branch).

- `GET /discovery/businesses/{slug}/branches/{branchId}/services` — the
  branch's customer-bookable services (name, description, effective
  price/duration accounting for any branch override, currency, pricing
  type, category id).
- `GET .../services/{serviceId}/providers` — eligible, active providers
  for that service at that branch (id and display name only — no
  membership, role, or other internal detail).
- `GET .../availability?serviceIds=&staffProfileId=&date=` (or
  `fromDate`/`toDate`) — the deterministic availability engine
  (docs/ARCHITECTURE.md section 6): resolves the business, verifies
  visibility, verifies the branch and every requested service, resolves
  effective price/duration, resolves eligible providers, intersects
  branch hours with staff availability, applies exceptions, lead time,
  horizon, and buffers, and removes occupied time — returning only
  slots that are genuinely bookable right now. `serviceIds` is an
  ordered, comma-separated list (sequential services, one provider).
  Omitting `staffProfileId` means "any available provider"; each
  returned slot still names the specific provider it is for. A date
  range is capped at a safe maximum (currently 14 days) regardless of
  the branch's own configured booking horizon.

**These results are advisory only.** They reflect current state at query
time; nothing about calling this endpoint reserves anything. Creating an
appointment (section 15) revalidates everything from scratch, atomically,
against a database-enforced double-booking constraint — a slot shown
here can still fail at booking time if another request wins the race.

Collection responses use the standard cursor shape (section 4): `page`
is a sibling of `data`, not nested inside it. The cursor is an opaque,
`id`-ordered value — stable (a page never skips or repeats a result as
more pages are fetched) but not a meaningful sort key on its own; do not
parse it.

Duplicate business names are allowed and expected (e.g. two unrelated
"Empowerment Salon" businesses) — `PublicBusinessProfile.slug` is what
is actually unique, and what a customer should bookmark, share, or open
a deep link with. A future mobile deep link such as
`kora://business/{slug}` (opening the app directly to that business's
profile, with a web fallback resolved later if a companion site exists)
is anticipated by this slug design but not implemented in this phase —
no website is being built.

`organizationId` and each branch's `branchId` in these responses are the
same stable internal identifiers used everywhere else in the API. The
booking flow (section 15) reads a business by slug for display, then
uses these IDs — plus the service IDs from "Services and availability"
above — to actually create an appointment; see section 30.

Authorized management (owner/manager, via the `business_profile.manage`
permission):

- `GET`/`PUT /organizations/{organizationId}/business-profile` — view or
  upsert the profile (`slug`, `displayName`, `description`,
  `logoImageUrl`, `coverImageUrl`, `visibility`, `searchKeywords`,
  `categoryCodes`).
- `POST /organizations/{organizationId}/business-profile/publish` —
  fails with `422`-equivalent validation (`400`) unless at least one
  branch is marked discoverable; a published profile with nowhere to
  visit would be meaningless.
- `POST /organizations/{organizationId}/business-profile/unpublish`
- `PUT /organizations/{organizationId}/branches/{branchId}/discovery` —
  the one branch-scoped route in this phase (`latitude`, `longitude`,
  `publicPhone`, `publicEmail`, `openingHoursNote`, `isDiscoverable`).

## 30. Customer workspace vs. business workspace, and the booking boundary

One Kora account, two workspaces:

- **Customer workspace**: discover businesses (section 29) and book
  appointments (section 15) — receipts and richer favorites/CRM remain a
  later phase. Grounded in `CustomerProfile` — one row per `User`,
  created the first time that user acts as a customer, with a
  self-service `GET`/`PATCH /me/customer-profile` (display name, phone,
  city/area, and location only when explicitly provided, with its own
  consent timestamp). No organization membership is required to use it.
- **Business workspace**: operate one or more organizations as an owner
  or staff member. Grounded in `OrganizationMembership` — see section 8.

The same `User.id` can appear in both roles simultaneously (an owner of
one salon can also be a customer of another), and the two are otherwise
unrelated: a customer's discovery activity is never visible to a
business, and a business's internal data is never visible through
discovery (section 29 and docs/SECURITY.md).

`CustomerRecord` — one organization's private, per-organization knowledge
of a customer (docs/DATA_MODEL.md) — is created (or reused) automatically
on a customer's first booking with that organization; no separate
creation endpoint exists or is needed. The booking reference chain is:
`Organization` → `Branch` (from section 29's discovery response) →
`Service` (section 13, resolved through section 29's per-branch
services/availability) → `CustomerRecord`/`CustomerProfile` → the
`Appointment` itself (section 15), reserved atomically against a
database-enforced double-booking constraint with a client-generated
idempotency key. That chain is done; the next data-model boundary is
Walk-in/Queue → Service Session (docs/ROADMAP.md).

## 31. Safe workspace projection

`GET /v1/organizations` (section 8) returns only `{id, name, slug,
status, membershipId}` per organization — enough to list memberships,
not enough to safely route a mobile client between a customer home
screen, a single business workspace, or a chooser between several. `GET
/v1/me/workspaces` closes that gap with a deliberately minimal,
additive, read-only projection built for exactly that decision, added
for the first Android integration stage (docs/ROADMAP.md):

```json
{
  "data": {
    "customerWorkspaceAvailable": true,
    "organizations": [
      {
        "organizationId": "org_...",
        "membershipId": "mem_...",
        "name": "Urban Crown Salon",
        "slug": "urban-crown",
        "logoUrl": "https://.../logo.png",
        "roleCodes": ["owner"],
        "permissionCodes": ["reports.read", "branches.manage", "..."],
        "accessMode": "FULL",
        "membershipStatus": "ACTIVE",
        "branches": [{ "branchId": "branch_...", "name": "Main Branch" }]
      }
    ]
  },
  "meta": { "requestId": "..." }
}
```

Rules, all enforced server-side regardless of what a client later does
with the response:

- Only `ACTIVE` memberships are listed; suspended or inactive ones are
  omitted entirely rather than marked non-selectable, since there is
  nothing safe to select.
- `branches` lists every `ACTIVE` branch when the membership holds the
  broad `branches.manage` permission (the same rule `TenantAccessGuard`
  already applies), otherwise only the branches the membership has an
  explicit `BranchAssignment` for.
- `accessMode` comes from `SubscriptionAccessService.resolveAccessMode`
  and defaults to `BLOCKED` when the organization has no subscription
  row at all — never `FULL` by omission.
- `roleCodes`/`permissionCodes` are read fresh from the database on
  every call. This endpoint is a UI-routing convenience only; it grants
  nothing, and every protected request downstream is still independently
  authorized by `TenantAccessGuard` regardless of what this endpoint
  most recently returned. A client must never cache this response as an
  access decision, and must never let a locally remembered organization
  selection bypass a fresh membership check on the next protected call
  (docs/SECURITY.md section 36).
- `customerWorkspaceAvailable` is currently always `true` for an
  authenticated user (every signed-in user can act as a customer); it is
  modeled as a field rather than assumed so a future restriction (e.g. a
  staff-only account type) has somewhere to express `false`.
- No subscription internals, audit data, staff-private fields, or
  financial figures beyond `accessMode` itself are ever included.

This is additive and backward-compatible: `GET /v1/organizations`
is unchanged, and nothing about organization creation, staff invitation,
or existing RBAC enforcement changes. Covered by
`apps/api/test/workspaces.e2e-spec.ts`.

## 32. Customer favorites

A customer may save and unsave a public business profile. Grounded in
the pre-existing `CustomerFavorite` model (`customerProfileId`,
`organizationId`, unique together), which had a schema but no
application-layer code before this stage:

- `GET /v1/me/favorites` → `ApiSuccessEnvelope<DiscoveryBusinessSummaryDto[]>`,
  the same public-safe shape discovery search already returns (section
  29). Re-filters visibility on every read: a business that was PUBLIC
  or LINK_ONLY when favorited but has since turned PRIVATE simply no
  longer appears — no cleanup job, no stale-reference error.
- `POST /v1/me/favorites/:organizationId` → `{favorited: true}`.
  Idempotent (an `upsert` on the composite key): favoriting an
  already-favorited business is not an error. 404s if the organization's
  `PublicBusinessProfile` is not PUBLIC/LINK_ONLY and published — the
  same visibility rule discovery itself enforces (section 29), so a
  PRIVATE business can never be favorited even by its own future
  customer.
- `DELETE /v1/me/favorites/:organizationId` → `{favorited: false}`.
  Idempotent (`deleteMany`): unfavoriting something never favorited, or
  already removed, is not an error.

All three require an authenticated customer (`CustomerProfileService.
getOrCreateId(userId)` creates the `CustomerProfile` row on first use,
matching how a first booking already does). Favorites are strictly
per-customer: one customer's favorites are never visible to, or
affected by, another's, and never cross into business-workspace data.
Covered by `apps/api/test/favorites.e2e-spec.ts`.

## 33. Business onboarding contract, setup status, and staff-invitation security

Added for the second Android business-side integration stage
(docs/ROADMAP.md): a resumable onboarding contract, plus closing real
gaps found while building the mobile client against it.

**`POST /v1/organizations` now requires an `Idempotency-Key` header**
(400 if missing) — this endpoint is the entry point to
`OnboardingService.onboardOrganization`, which atomically creates the
organization, owner membership, first branch, and trial subscription
in one transaction. A pre-check (`findUnique` by `[ownerUserId,
idempotencyKey]`) plus a reactive catch of the unique-constraint
violation inside the transaction both defer to a shared
replay-or-conflict routine: an identical retry (same fingerprint of
the semantically-relevant request fields) replays the original
201/200 result; a *different* payload reusing the same key is rejected
with `409 IDEMPOTENCY_CONFLICT`. A slug collision is mapped to a clean
`409 ORGANIZATION_SLUG_TAKEN` rather than an unhandled 500. Scoped per
owner user (`OrganizationIdempotencyKey`), not per-organization, since
no organization exists yet on the first attempt.

**`GET /v1/organizations/:organizationId/setup-status`** (any active
membership, no specific permission) computes seven booleans purely
from current database state — never from anything the client claims:
`organizationCreated` (always true), `firstBranchCreated`,
`businessProfileConfigured`, `serviceCreated` (non-archived count > 0),
`branchHoursConfigured`, `staffInvitationSent` (any invitation, any
status), `profilePublicationEligible` (mirrors
`BusinessProfileService`'s actual publish prerequisite: a profile row
exists and at least one branch is discoverable). This is the sole
authority a resumed mobile onboarding session may trust.

**`GET /v1/organizations/:organizationId/branches`** (any active
membership) lists non-archived branches as `{id, organizationId, name,
code, countryCode, timeZone, currency, status}`. Read-only — this is
*not* the branch CRUD contract section 10 describes (that remains
unimplemented; only the onboarding-created primary branch exists per
organization). Added specifically because no other endpoint lets a
client resolve a branch id after the fact, which had silently broken
Android's resumed-session business-hours save and staff-invitation
branch assignment (docs/ARCHITECTURE.md section 24).

**Staff invitations can no longer grant the `owner` role.**
`StaffInvitationService.create()` now throws `403
OWNER_ROLE_NOT_INVITABLE` for `role.code === 'owner'` — previously any
membership holding `staff.invite` could invite someone directly as
owner, a real, previously-unguarded privilege-escalation gap
(docs/SECURITY.md section 37). Ownership transfer remains a distinct,
unimplemented future workflow.

**Staff invitation creation is now transactional and enforces the
subscription's staff entitlement atomically under concurrent
requests.** The whole `create()` body runs inside `$transaction`,
row-locking the organization's subscription
(`SELECT ... FOR UPDATE`) before counting ACTIVE memberships plus
PENDING invitations against `EntitlementsService`'s resolved `staff.max`
for that same transaction — two concurrent invitation requests against
a plan with one remaining seat can no longer both succeed. Returns
`409 STAFF_LIMIT_REACHED` when exceeded (not 403, so the client's
generic-Conflict path surfaces the specific server message rather than
a misleading permission error).

**`GET /v1/organizations/:organizationId/staff-invitations/assignable-roles`**
(`staff.invite`) lists every invitable role (system roles plus any
org-specific custom role) *except* `owner`, as `{id, code, name}[]` —
added because no endpoint previously let a client resolve a role's
database-generated id from its code.

**`GET /v1/organizations/:organizationId/staff-invitations`**
(`staff.read`, optional `?status=` filter) lists every invitation
regardless of status as `{id, email, phone, roleId, roleName, roleCode,
branchId, branchName, status, expiresAt, createdAt}` — the token hash
is never included.

**`GET /v1/organizations/:organizationId/staff`** (`staff.read`) is a
new team-directory endpoint built from `OrganizationMembership` (not
`StaffProfile`), since an owner — created through onboarding, not
invitation — has no `StaffProfile` row but does have real role and
branch assignments. Only `ACTIVE`/`SUSPENDED` memberships are included;
`REMOVED` is excluded. Response per entry: `{membershipId, displayName,
status, roleNames[], branches[], services[]}` — no OTP data, session
tokens, audit metadata, other staff's earnings, or invitation tokens.

**`GET /v1/organizations/:organizationId/subscription`**
(`subscriptions.read`) returns `{planCode, planName, status,
accessMode, trialEndsAt, currentPeriodEndsAt, entitlements,
usage: {branchesUsed, branchesMax, staffUsed, staffMax}}`, computed
fresh on every call — no invented prices, no checkout, no payment
fields.

**`defaultCurrency` was added to the safe workspace projection**
(section 31) — a small, additive, non-sensitive field (the
organization's own already-stored default currency) so the Android
Services tab never has to guess a currency before a separate
`OrganizationDto` fetch completes.

The invitation-acceptance contract itself (`GET/POST .../invitations/
:token/preview|accept|reject` — already implemented before this stage)
is unchanged; see docs/SECURITY.md sections 37-38 for the security
properties Android's deep-link flow depends on and verified against a
running backend.

Covered by `apps/api/test/organizations-and-invitations.e2e-spec.ts`
(idempotency, setup-status, assignable-roles, OWNER-role block,
staff-limit including a concurrent-request test, invitation listing,
team directory, subscription detail) and
`apps/api/test/onboarding.e2e-spec.ts`.
