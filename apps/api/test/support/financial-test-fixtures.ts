import { randomUUID } from 'node:crypto';
import { MembershipStatus } from '../../src/generated/prisma/client.js';
import type { BookableFixture } from './appointment-test-fixtures.js';
import { authed, signInWithEmailOtp, type TestApp } from './otp-test-helpers.js';
import { assignSystemRole } from './queue-test-fixtures.js';

export interface PostedTransactionResult {
  serviceSessionId: string;
  customerRecordId: string;
  checkoutId: string;
  checkoutTotalMinor: number;
  paymentId: string;
  transactionId: string;
}

export interface FinancialActor {
  accessToken: string;
  userId: string;
  membershipId: string;
}

async function createActor(
  testApp: TestApp,
  fixture: BookableFixture,
  roleCode: string,
  label: string,
): Promise<FinancialActor> {
  const signedIn = await signInWithEmailOtp(testApp, `${label}-${randomUUID()}@example.test`);
  const membership = await testApp.prisma.organizationMembership.create({
    data: {
      organizationId: fixture.organizationId,
      userId: signedIn.userId,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });
  await testApp.prisma.branchAssignment.create({
    data: { organizationId: fixture.organizationId, membershipId: membership.id, branchId: fixture.branchId },
  });
  await assignSystemRole(testApp.prisma, fixture.organizationId, membership.id, roleCode);
  return { accessToken: signedIn.accessToken, userId: signedIn.userId, membershipId: membership.id };
}

export async function createManagerActor(testApp: TestApp, fixture: BookableFixture): Promise<FinancialActor> {
  return createActor(testApp, fixture, 'manager', 'manager');
}

export async function createCashierActor(testApp: TestApp, fixture: BookableFixture): Promise<FinancialActor> {
  return createActor(testApp, fixture, 'cashier', 'cashier');
}

export async function createReceptionistActor(testApp: TestApp, fixture: BookableFixture): Promise<FinancialActor> {
  return createActor(testApp, fixture, 'receptionist', 'receptionist');
}

/**
 * A membership with an org-scoped custom role holding zero permissions
 * — the safe way to test "lacks permission X" in this suite. Never
 * delete a RolePermission row from a *system* role (organizationId:
 * null, e.g. 'receptionist' or 'cashier') to simulate this instead: that
 * role's grants are global and shared by every organization and test in
 * the whole suite, so mutating them corrupts every other test that
 * relies on the seeded role matrix until the seed is re-applied.
 */
export async function createNoPermissionActor(testApp: TestApp, fixture: BookableFixture): Promise<FinancialActor> {
  const signedIn = await signInWithEmailOtp(testApp, `noperm-${randomUUID()}@example.test`);
  const membership = await testApp.prisma.organizationMembership.create({
    data: {
      organizationId: fixture.organizationId,
      userId: signedIn.userId,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });
  await testApp.prisma.branchAssignment.create({
    data: { organizationId: fixture.organizationId, membershipId: membership.id, branchId: fixture.branchId },
  });
  const emptyRole = await testApp.prisma.role.create({
    data: {
      organizationId: fixture.organizationId,
      code: `no-permission-${randomUUID().slice(0, 8)}`,
      name: 'No permission (test fixture)',
      isSystem: false,
    },
  });
  await testApp.prisma.membershipRole.create({
    data: { organizationId: fixture.organizationId, membershipId: membership.id, roleId: emptyRole.id },
  });
  return { accessToken: signedIn.accessToken, userId: signedIn.userId, membershipId: membership.id };
}

/**
 * Walk-in -> start-service (as the fixture's own provider) -> complete,
 * entirely through the real HTTP API, so the resulting ServiceSession
 * (and its ServiceSessionItem snapshots) are indistinguishable from one
 * a genuine front-desk flow produced — exactly what
 * `CheckoutsService.create` expects to find. `fixture.servicePriceMinor`
 * is the resulting Checkout's expected subtotal for a single-service
 * session using the fixture's default service.
 */
export async function createCompletedServiceSession(
  testApp: TestApp,
  fixture: BookableFixture,
  receptionistAccessToken: string,
  overrides: { serviceIds?: string[] } = {},
): Promise<{ serviceSessionId: string; queueEntryId: string; customerRecordId: string }> {
  const walkIn = await authed(testApp, receptionistAccessToken)
    .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue/walk-ins`)
    .send({ newCustomer: { name: 'Checkout Customer' }, serviceIds: overrides.serviceIds ?? [fixture.serviceId] })
    .expect(201);
  const queueEntryId: string = walkIn.body.data.id;
  const customerRecordId: string = walkIn.body.data.customerRecordId;

  const started = await authed(testApp, fixture.providerAccessToken)
    .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${queueEntryId}/start-service`)
    .send({ staffProfileId: fixture.providerStaffProfileId })
    .expect(201);
  const serviceSessionId: string = started.body.data.id;

  await authed(testApp, fixture.providerAccessToken)
    .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${serviceSessionId}/complete`)
    .expect(201);

  return { serviceSessionId, queueEntryId, customerRecordId };
}

/**
 * The full chain end to end, through the real HTTP API: walk-in ->
 * start-service -> complete -> checkout -> record a single full-amount
 * CASH payment -> the assigned provider confirms it, which atomically
 * posts the Transaction (and, as of the commission/receipt stage, its
 * CommissionAccrual rows and Receipt). Every commission/receipt/report
 * e2e test builds on this as its starting point rather than
 * re-deriving the chain itself.
 */
export async function createPostedTransaction(
  testApp: TestApp,
  fixture: BookableFixture,
  receptionistAccessToken: string,
  cashierAccessToken: string,
  overrides: { serviceIds?: string[] } = {},
): Promise<PostedTransactionResult> {
  const { serviceSessionId, customerRecordId } = await createCompletedServiceSession(
    testApp,
    fixture,
    receptionistAccessToken,
    overrides,
  );

  const checkout = await authed(testApp, receptionistAccessToken)
    .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${serviceSessionId}/checkout`)
    .expect(201);
  const checkoutId: string = checkout.body.data.id;
  const checkoutTotalMinor: number = checkout.body.data.totalMinor;

  const payment = await authed(testApp, cashierAccessToken)
    .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}/payments`)
    .set('Idempotency-Key', randomUUID())
    .send({ method: 'CASH', appliedAmountMinor: checkoutTotalMinor, currency: fixture.serviceCurrency })
    .expect(201);
  const paymentId: string = payment.body.data.id;

  await authed(testApp, fixture.providerAccessToken)
    .post(`/v1/organizations/${fixture.organizationId}/payments/${paymentId}/confirm`)
    .send({})
    .expect(201);

  const transaction = await testApp.prisma.transaction.findFirstOrThrow({ where: { checkoutId } });

  return { serviceSessionId, customerRecordId, checkoutId, checkoutTotalMinor, paymentId, transactionId: transaction.id };
}
