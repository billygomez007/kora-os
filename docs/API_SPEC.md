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

## 13. Services

- `GET /services`
- `POST /services`
- `GET /services/{serviceId}`
- `PATCH /services/{serviceId}`
- `POST /services/{serviceId}/activate`
- `POST /services/{serviceId}/deactivate`
- `GET /service-categories`
- `POST /service-categories`
- `PATCH /service-categories/{categoryId}`

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

- `GET /appointments`
- `POST /appointments`
- `GET /appointments/{appointmentId}`
- `PATCH /appointments/{appointmentId}`
- `POST /appointments/{appointmentId}/confirm`
- `POST /appointments/{appointmentId}/check-in`
- `POST /appointments/{appointmentId}/cancel`
- `POST /appointments/{appointmentId}/no-show`
- `GET /availability`

Appointment commands return `409` when the requested provider and time conflict with current authoritative availability.

## 16. Walk-ins and queue

- `GET /queue`
- `POST /queue/walk-ins`
- `GET /queue/{queueEntryId}`
- `POST /queue/{queueEntryId}/call`
- `POST /queue/{queueEntryId}/assign`
- `POST /queue/{queueEntryId}/move`
- `POST /queue/{queueEntryId}/cancel`

Queue mutation responses return the updated entry and a queue revision so clients can refresh after concurrent changes.

## 17. Service sessions

- `GET /service-sessions`
- `POST /service-sessions`
- `GET /service-sessions/{sessionId}`
- `POST /service-sessions/{sessionId}/start`
- `POST /service-sessions/{sessionId}/complete`
- `POST /service-sessions/{sessionId}/cancel`
- `POST /service-sessions/{sessionId}/reassign`

Start, complete, cancel, and reassign are commands with explicit permissions and valid-state checks.

## 18. Checkout and transactions

- `POST /checkouts/preview`
- `POST /transactions`
- `GET /transactions`
- `GET /transactions/{transactionId}`
- `POST /transactions/{transactionId}/cancel`
- `GET /transactions/{transactionId}/timeline`

Checkout preview calculates totals without persisting financial state. Creating a transaction captures line-item descriptions, prices, discounts, taxes, provider assignments, and currency.

Example transaction creation request:

```json
{
  "branchId": "branch_...",
  "customerId": "customer_...",
  "serviceSessionId": "session_...",
  "items": [
    {
      "type": "service",
      "sourceId": "service_...",
      "providerStaffId": "staff_...",
      "quantity": 1
    }
  ],
  "discount": {
    "type": "fixed",
    "amountMinor": 0
  }
}
```

The server loads authoritative catalog prices and calculates totals. Client-submitted totals are never trusted.

## 19. Payments and verification

### Payments

- `GET /transactions/{transactionId}/payments`
- `POST /transactions/{transactionId}/payments`
- `GET /payments/{paymentId}`
- `POST /payments/{paymentId}/void`
- `POST /payments/{paymentId}/refunds`
- `GET /payments/{paymentId}/refunds`

Creating, voiding, and refunding payments requires `Idempotency-Key`.

### Verification

- `GET /payment-verifications`
- `GET /payment-verifications/{verificationId}`
- `POST /payment-verifications/{verificationId}/confirm`
- `POST /payment-verifications/{verificationId}/dispute`
- `POST /payment-verifications/{verificationId}/resolve`

Example dispute command:

```json
{
  "reasonCode": "AMOUNT_MISMATCH",
  "note": "The customer paid GH₵70, not GH₵80.",
  "version": 1
}
```

The authenticated provider must be the assigned verifier unless an explicit management permission applies. Resolution requires a manager or owner permission and an explanatory reason.

## 20. Commissions

- `GET /commission-rules`
- `POST /commission-rules`
- `GET /commission-rules/{ruleId}`
- `PATCH /commission-rules/{ruleId}`
- `POST /commission-rules/{ruleId}/activate`
- `POST /commission-rules/{ruleId}/retire`
- `GET /commissions`
- `GET /staff/{staffId}/commissions`

The API returns calculation snapshots but does not allow direct editing of finalized commission amounts.

## 21. Receipts and reconciliation

### Receipts

- `GET /transactions/{transactionId}/receipt`
- `GET /receipts/{receiptId}`
- `POST /receipts/{receiptId}/share`

### Cash sessions

- `GET /cash-sessions`
- `POST /cash-sessions/open`
- `GET /cash-sessions/{cashSessionId}`
- `POST /cash-sessions/{cashSessionId}/submit`
- `POST /cash-sessions/{cashSessionId}/approve`
- `POST /cash-sessions/{cashSessionId}/reject`

Expected values are calculated by the server. Submitted actual cash and notes are captured as explicit facts.

## 22. Dashboard and reports

- `GET /dashboard/summary`
- `GET /reports/revenue`
- `GET /reports/services`
- `GET /reports/staff`
- `GET /reports/payments`
- `GET /reports/appointments`

Report access is permission and entitlement controlled. Date ranges are interpreted using the selected branch or organization reporting time zone.

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
6. The same key with a different fingerprint returns `409 IDEMPOTENCY_KEY_REUSED`.

## 26. Optimistic concurrency

Mutable state-machine resources expose a `version`. Commands submit that version or an `If-Match` value. Stale commands return a conflict containing the current safe resource version so the client can refresh rather than overwrite newer work.

## 27. Initial permission vocabulary

- `organization.read`, `organization.update`
- `branches.read`, `branches.manage`
- `subscriptions.read`, `subscriptions.manage`
- `staff.read`, `staff.manage`, `staff.invite`
- `roles.read`, `roles.manage`
- `services.read`, `services.manage`
- `customers.read`, `customers.manage`
- `appointments.read`, `appointments.manage`
- `queue.read`, `queue.manage`
- `service_sessions.read`, `service_sessions.perform`, `service_sessions.manage`
- `transactions.read`, `transactions.create`, `transactions.cancel`
- `payments.read`, `payments.record`, `payments.void`, `payments.refund`
- `verifications.read`, `verifications.respond`, `verifications.resolve`
- `commissions.read_own`, `commissions.read_all`, `commissions.manage_rules`
- `reconciliation.perform`, `reconciliation.approve`
- `reports.basic`, `reports.advanced`
- `audit.read`
- `business_profile.manage`

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
same stable internal identifiers used everywhere else in the API. A
future booking flow reads a business by slug for display, then uses
these IDs (plus a service ID, once services exist) to actually create an
appointment — see section 30.

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

- **Customer workspace**: discover businesses (section 29), and in a
  later phase, book appointments, view receipts, and manage favorites.
  Grounded in `CustomerProfile` — one row per `User`, created the first
  time that user acts as a customer. No organization membership is
  required to use it.
- **Business workspace**: operate one or more organizations as an owner
  or staff member. Grounded in `OrganizationMembership` — see section 8.

The same `User.id` can appear in both roles simultaneously (an owner of
one salon can also be a customer of another), and the two are otherwise
unrelated: a customer's discovery activity is never visible to a
business, and a business's internal data is never visible through
discovery (section 29 and docs/SECURITY.md).

`CustomerRecord` — one organization's private, per-organization knowledge
of a customer, for future booking/CRM history — is modeled
(docs/DATA_MODEL.md) but nothing creates one yet, since there is no
booking or walk-in flow. When that flow exists, it will follow this
reference chain: `Organization` → `Branch` (from section 29's discovery
response, or an authenticated staff listing once branches have their own
endpoint) → `CustomerRecord`/`CustomerProfile` → `Service` (not modeled
yet) → the appointment itself. That chain, not any new identity concept,
is the next phase's data-model boundary: Services → Availability →
Booking → Walk-in/Queue → Service Session (docs/ROADMAP.md).
