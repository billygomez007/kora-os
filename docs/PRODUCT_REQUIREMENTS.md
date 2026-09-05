# Kora OS Product Requirements

Status: Foundation baseline
Product: Kora OS
Initial market: Ghana
Primary client: Native mobile application

## 1. Product vision

Kora OS is a multi-tenant operating system for service businesses. It enables
owners to run one or more branches remotely while staff manage appointments,
walk-ins, queues, services, checkout, payment verification, commissions, and
operations from the same mobile application.

Kora is not only a booking application. Its core uses generic organizations,
branches, staff, services, service sessions, transactions, and payments so it
can expand beyond salons and barbershops.

## 2. Product surfaces

### V1

- Native Android application with role-aware workspaces.
- Secure backend API shared by all organizations and devices.
- PostgreSQL database with strict organization isolation.
- Push and in-app notifications for important events.

### Future

- iOS application using the same backend and business contracts.
- Public customer booking without initially requiring an account.
- Customer mobile experience for bookings, receipts, payments, and loyalty.
- Platform administration console for subscriptions and support.

Kora remains a mobile product. Any future web surface is only a supporting
customer-booking or administration channel.

### Customer workspace and business workspace

One Kora account carries two independent workspaces:

- **Customer workspace**: discover businesses (a customer can search for a
  business such as Empowerment Salon, open its public profile, and select
  a branch), and in a later phase, book appointments, view receipts, and
  manage favorites. Requires no organization membership to use.
- **Business workspace**: the roles in section 3 below — owners and staff
  operating one or more organizations and branches.

The same person can be a customer of one business and staff at another
using the same account; the two workspaces never share data with each
other (see docs/SECURITY.md section 29 for how discovery stays isolated
from tenant data). Public business search is available today
(`GET /v1/discovery/businesses` and related endpoints); booking, receipts,
and loyalty remain future work per the "Future" list above.

## 3. Roles (business workspace)

- Owner: subscriptions, branches, staff, services, reports, and disputes.
- Manager: permitted branch operations and selected financial controls.
- Cashier: checkout, payment recording, receipts, and reconciliation.
- Receptionist: customers, appointments, walk-ins, and queues. Can start service for a queue entry's already-assigned provider, but never complete, cancel, or edit a service session, and never act as its assigned provider.
- Service provider: assigned work, service completion, and payment verification — restricted to sessions assigned to that provider's own StaffProfile; never another provider's.
- Accountant: authorized reports, commissions, refunds, and reconciliation.

A person may hold multiple roles. Access is determined by organization
membership, branch assignment, roles, and permissions—not one role string.
The receptionist's ability to start a queue entry's service without also
being able to complete or cancel it is a deliberate least-privilege
example of this: one workflow step, two different permissions
(`service_sessions.start` vs. `.perform`/`.manage`), each independently
enforced server-side (docs/SECURITY.md section 32).

## 4. Core lifecycle

1. Owner creates an organization and first branch.
2. Owner selects a subscription or starts an eligible trial.
3. Owner invites staff and assigns branches, roles, and services.
4. Receptionist creates an appointment or walk-in.
5. Customer enters the queue and checks in.
6. Provider starts and completes a service session.
7. Cashier creates checkout and records payment.
8. Kora requests verification from the service provider.
9. Provider confirms or disputes the payment.
10. Confirmation finalizes commission and receipt information.
11. Owner reports and dashboard update.
12. Every important transition creates an append-only audit event.

Appointments, service sessions, transactions, and payments are separate
records. A walk-in can exist without an appointment, and an appointment may
never result in a payment.

## 5. V1 requirements

### Identity and organizations

Kora OS uses passwordless email OTP authentication for customers, owners,
managers and staff. Kora does not store or support user passwords.

- Users sign in by entering an email address, receiving a one-time code
  by email, and entering that code — the same flow for a first-time
  sign-up and a returning sign-in; there is no separate password-based
  registration.
- Owners can create organizations and branches.
- Owners invite staff without creating or sharing any password — an
  invited staff member signs in with the same passwordless email OTP
  flow as everyone else and accepts the invitation once authenticated.
- One identity may belong to multiple isolated organizations.
- Every business record is scoped to an organization.
- Staff access can be restricted to assigned branches.
- Backend authorization never relies only on hidden mobile controls.

### Subscriptions

- The organization, not an employee, owns the subscription.
- Supported states include trialing, active, past due, grace period,
  read-only, canceled, and expired.
- Entitlements control branch, staff, reporting, integration, and module limits.
- Subscription expiration never immediately deletes business data.
- Prices and limits are managed by the backend, not hard-coded in the app.
- Billing providers remain outside core business logic through an adapter.

### Services and customers

- Authorized users manage services, prices, durations, providers, and status.
- Customers are isolated within each organization.
- Authorized users can search customers and view their operational history.
- Prices are captured on transaction line items so historical totals do not
  change when a service price changes later.

The first two lines are implemented: a service catalogue (with
organization-owned categories, branch-level price/duration/bookability
overrides, and eligible-provider assignment scoped to an active branch
assignment) and tenant-scoped `CustomerRecord`s, created automatically on
a customer's first booking with an organization. A dedicated
authorized-user customer search/history endpoint, and transaction line
items (which do not exist yet), remain future work; appointment booking
already captures its own price/duration snapshot per booked service so a
later catalogue edit cannot change a past appointment's record.

### Appointments and operations

- Appointments support requested, confirmed, checked-in, in-service, completed,
  canceled, and no-show states.
- The server prevents provider scheduling conflicts.
- Walk-ins can be assigned to providers and placed in a branch queue.
- Queue entries support waiting, called, in-service, completed, and canceled.
- Actual work is represented by an independent service session.

A customer- or staff-created appointment is `CONFIRMED` on creation
(there is no separate "requested" step to confirm later) and can become
`CANCELLED` or `NO_SHOW`; "checked-in", "in-service", and "completed"
are deliberately not appointment states at all — an appointment is a
reservation, and only a `ServiceSession` can establish that work
actually happened (docs/SECURITY.md section 30/31). The server-prevented
scheduling conflict is a database-enforced constraint, not only an
application check (docs/ARCHITECTURE.md section 6).

Walk-ins, the live branch queue, and service sessions are now
implemented: a walk-in or a checked-in appointment becomes a
`QueueEntry` (waiting, called, in-service, completed, cancelled, or
no-show); starting service creates a `ServiceSession` with its own
snapshot of the services actually performed, attributed to the provider
who performed them, and completing it is the only way work is ever
recorded as done. Checkout and payments — what happens *immediately
after* a `ServiceSession` completes — are now implemented too (see the
next two sections); commissions and receipts remain future work
(docs/ROADMAP.md item 8).

### Transactions and payments

- Transactions support multiple line items.
- Currency values use integer minor units, never floating-point database values.
- Payments are separate records from transactions.
- The model supports cash, mobile money, card, transfer, online, and other.
- The data model supports partial and multiple payments.
- Financial commands require idempotency keys to prevent duplicates.
- Refunds and voids create reversing records; history is not silently replaced.

Implemented with a narrower, more precise shape than this list
originally sketched: a `Checkout` (not a mutable "transaction") carries
the multi-line-item amount due for one completed `ServiceSession`, with
`PaymentRecord`s recorded separately against it — CASH, MOBILE_MONEY,
CARD, BANK_TRANSFER, or OTHER, recording categories only with no
payment-gateway integration ("online" dropped as a category, since it
implies a gateway that does not exist). Every `*_minor` amount is an
integer, validated for overflow before it ever reaches the database.
Partial/split payments are supported; recording one requires an
`Idempotency-Key`. Voiding is implemented for both a `Checkout` (before
settlement) and a mistaken `PaymentRecord` (before confirmation) —
*refunding* or *reversing* a posted `Transaction` is implemented too,
as the `TransactionCorrection` workflow described in the "Commission,
reconciliation, receipts, and reporting" section below, since a
correction posts its own new immutable Transaction rather than editing
or voiding the original. See docs/API_SPEC.md sections 18-19, 18a and
docs/DATA_MODEL.md section 8.

### Verification

- Recording payment does not immediately create verified revenue when staff
  verification is required.
- The responsible provider can confirm or dispute the payment.
- Disputed payments do not finalize commission.
- Managers or owners receive disputes for resolution.
- Manager resolution requires a reason and creates an audit event.
- A server-side state machine validates every financial transition.

Implemented: a `PaymentRecord` is a claim only (`RECORDED`) until the
`ServiceSession`'s own assigned provider confirms or disputes it. A
recorder who is also the assigned provider can never self-confirm their
own claim — the one exception is a solo owner/provider, who may confirm
via a separately audited, explicitly reasoned management override.
"Disputed payments do not finalize commission" cannot yet be verified
directly (commissions do not exist), but is proven at the layer below
it: a disputed payment never contributes to, and can never trigger,
posting a `Transaction`. Manager resolution requires both a permission
(`payments.resolve`) and — for a rejection — a resolution note, and
writes both a `PaymentVerificationEvent` and an `AuditEvent`. See
docs/ARCHITECTURE.md section 12 and docs/SECURITY.md section 33.

### Commission, reconciliation, receipts, and reporting

- Commission rules can be percentage, fixed, service-specific, or tiered.
- Commission is finalized only from verified transaction value.
- Cash sessions record opening, expected, actual, variance, cashier, and branch.
- Confirmed transactions receive stable receipt numbers.
- Reports distinguish recorded, verified, disputed, refunded, and outstanding.
- Owners can monitor live branch activity from the mobile dashboard.

Commissions, receipts, reports, and cash-session reconciliation are all
implemented. Commission rules are PERCENTAGE, FIXED, or NONE — not
distinct "service-specific" or "tiered" strategies as such, but a
service-specific (or staff-specific, or branch-specific) rate is
expressed as a scoped PERCENTAGE/FIXED rule through the same eight-level
precedence every scope dimension shares (docs/ARCHITECTURE.md section
21). "Commission is finalized only from verified transaction value" is
implemented literally: a `CommissionAccrual` is created only inside the
same database transaction that posts a Transaction, never for a
merely-recorded or disputed payment claim — there is no separate
"finalized" step, since posting itself is the only trigger. Receipt
numbers are a stable `{branchCode}-{year}-{sequence}` format, atomically
issued from a per-branch/year counter. "Cash sessions record opening,
expected, actual, variance, cashier, and branch" is implemented as a
`CashRegister`/`CashSession`/`CashLedgerEntry`/`CashSessionReview` model
— opening float, cash payments/refunds, manual cash in/out, safe drops,
and a server-calculated expected-vs-counted variance, reviewed with a
MATCHED/ACCEPTED_VARIANCE/INVESTIGATION_REQUIRED outcome — described
throughout as physical drawer custody, never itself a revenue figure
(docs/ARCHITECTURE.md section 22). A posted `Transaction` can now be
corrected: a `TransactionCorrection` (REFUND, partial or full and
cumulative-capped; or REVERSAL, one full negation before any prior
refund/reversal) goes through a REQUESTED → APPROVED/REJECTED/CANCELLED
→ EXECUTED workflow with separation of duties (the requester cannot
approve their own request, except a solo owner's explicitly reasoned,
audited override) before atomically posting an immutable, non-editable
REFUND/REVERSAL Transaction, its own commission adjustment, and a
corrective receipt — the original SALE Transaction, its receipt, and
its commission accrual are never mutated. Reports distinguish posted
revenue from RECORDED/DISPUTED payment claims
(`pendingPaymentClaimCount`/`disputedPaymentClaimCount`, explicitly
never summed into revenue) and now also separate gross posted sales,
refunded amount, reversed amount, and net posted revenue — "refunded"
reporting is implemented; "outstanding" (an unpaid balance concept)
does not apply to Kora's cash/claim model and remains not applicable.
"Owners can monitor live branch activity from the mobile dashboard"
remains future work — the reporting endpoints exist as a real-time
query API (`GET .../reports/*`), but no push/scheduled dashboard
delivery mechanism or Android integration exists yet. See
docs/API_SPEC.md sections 18a, 20-22, 27c and docs/SECURITY.md
sections 34-35.

### Notifications and audit

- Business logic publishes notification requests through channel-neutral APIs.
- V1 supports in-app and push notifications.
- SMS, WhatsApp, and email are future delivery adapters.
- Important mutations create append-only audit events.
- Audit events include actor, tenant, branch, action, entity, request ID,
  timestamp, and safe metadata.
