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

### Public

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/password/forgot`
- `POST /auth/password/reset`
- `POST /auth/verification/send`
- `POST /auth/verification/confirm`

### Authenticated

- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /me`
- `PATCH /me`
- `GET /me/memberships`
- `GET /me/sessions`
- `DELETE /me/sessions/{sessionId}`
- `PUT /me/devices/{installationId}`
- `DELETE /me/devices/{installationId}`

Refresh tokens are rotated. A detected reuse revokes the affected session family.

## 9. Organization onboarding

- `POST /organizations`
- `GET /organizations/{organizationId}`
- `PATCH /organizations/{organizationId}`
- `GET /organizations/{organizationId}/onboarding`
- `POST /organizations/{organizationId}/onboarding/complete`

Creating an organization atomically creates its owner membership, first branch, baseline roles, and eligible trial subscription.

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

- `GET /staff-invitations`
- `POST /staff-invitations`
- `POST /staff-invitations/{invitationId}/revoke`
- `GET /staff-invitations/acceptance/{token}`
- `POST /staff-invitations/acceptance/{token}/accept`
- `POST /staff-invitations/acceptance/{token}/decline`
- `GET /memberships`
- `GET /memberships/{membershipId}`
- `POST /memberships/{membershipId}/suspend`
- `POST /memberships/{membershipId}/reactivate`
- `DELETE /memberships/{membershipId}`

Invitation tokens are accepted in request bodies only where necessary and are not logged.

### Roles and permissions

- `GET /permissions`
- `GET /roles`
- `POST /roles`
- `PATCH /roles/{roleId}`
- `PUT /roles/{roleId}/permissions`
- `PUT /memberships/{membershipId}/roles`
- `PUT /memberships/{membershipId}/branches`

### Staff profiles

- `GET /staff`
- `GET /staff/{staffId}`
- `PATCH /staff/{staffId}`
- `PUT /staff/{staffId}/services`
- `GET /staff/{staffId}/availability`
- `PUT /staff/{staffId}/availability`
- `GET /staff/{staffId}/time-off`
- `POST /staff/{staffId}/time-off`

Staff creation is completed through invitation acceptance and checks `staff.max` entitlement.

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
- `staff.read`, `staff.manage`
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

Permission codes are seeded and stable. Roles map to permissions and may later be customized by authorized organizations.

## 28. Contract testing

- OpenAPI validates request and response shapes.
- Integration tests cover every command's success, validation, authorization, state conflict, and tenant-isolation paths.
- Consumer tests verify Android parsing against representative responses.
- Financial contract tests repeat the same idempotency key and simulate uncertain network outcomes.
- Backward compatibility is checked before API releases used by published mobile versions.
