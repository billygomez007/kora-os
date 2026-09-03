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

## 3. Roles

- Owner: subscriptions, branches, staff, services, reports, and disputes.
- Manager: permitted branch operations and selected financial controls.
- Cashier: checkout, payment recording, receipts, and reconciliation.
- Receptionist: customers, appointments, walk-ins, and queues.
- Service provider: assigned work, service completion, and payment verification.
- Accountant: authorized reports, commissions, refunds, and reconciliation.

A person may hold multiple roles. Access is determined by organization
membership, branch assignment, roles, and permissions—not one role string.

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

- Users can register, sign in, sign out, and recover access.
- Owners can create organizations and branches.
- Owners invite staff without creating or sharing staff passwords.
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

### Appointments and operations

- Appointments support requested, confirmed, checked-in, in-service, completed,
  canceled, and no-show states.
- The server prevents provider scheduling conflicts.
- Walk-ins can be assigned to providers and placed in a branch queue.
- Queue entries support waiting, called, in-service, completed, and canceled.
- Actual work is represented by an independent service session.

### Transactions and payments

- Transactions support multiple line items.
- Currency values use integer minor units, never floating-point database values.
- Payments are separate records from transactions.
- The model supports cash, mobile money, card, transfer, online, and other.
- The data model supports partial and multiple payments.
- Financial commands require idempotency keys to prevent duplicates.
- Refunds and voids create reversing records; history is not silently replaced.

### Verification

- Recording payment does not immediately create verified revenue when staff
  verification is required.
- The responsible provider can confirm or dispute the payment.
- Disputed payments do not finalize commission.
- Managers or owners receive disputes for resolution.
- Manager resolution requires a reason and creates an audit event.
- A server-side state machine validates every financial transition.

### Commission, reconciliation, receipts, and reporting

- Commission rules can be percentage, fixed, service-specific, or tiered.
- Commission is finalized only from verified transaction value.
- Cash sessions record opening, expected, actual, variance, cashier, and branch.
- Confirmed transactions receive stable receipt numbers.
- Reports distinguish recorded, verified, disputed, refunded, and outstanding.
- Owners can monitor live branch activity from the mobile dashboard.

### Notifications and audit

- Business logic publishes notification requests through channel-neutral APIs.
- V1 supports in-app and push notifications.
- SMS, WhatsApp, and email are future delivery adapters.
- Important mutations create append-only audit events.
- Audit events include actor, tenant, branch, action, entity, request ID,
  timestamp, and safe metadata.
