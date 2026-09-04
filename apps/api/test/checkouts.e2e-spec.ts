import request from 'supertest';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import {
  createCashierActor,
  createCompletedServiceSession,
  createManagerActor,
  createNoPermissionActor,
  type FinancialActor,
} from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('Checkouts (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;
  let extras: QueueFixtureExtras;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
    extras = await extendWithQueueRoles(testApp, fixture);
  });

  afterEach(async () => {
    await cleanupAllBookableFixtures(testApp);
    await testApp.app.close();
  });

  function checkoutCreateUrl(serviceSessionId: string): string {
    return `/v1/organizations/${fixture.organizationId}/service-sessions/${serviceSessionId}/checkout`;
  }

  function checkoutUrl(checkoutId: string, suffix = ''): string {
    return `/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}${suffix}`;
  }

  async function completeSession(serviceIds?: string[]) {
    return createCompletedServiceSession(testApp, fixture, extras.receptionistAccessToken, { serviceIds });
  }

  describe('creating a checkout', () => {
    it('rejects an unauthenticated request', async () => {
      const { serviceSessionId } = await completeSession();
      await request(testApp.app.getHttpServer()).post(checkoutCreateUrl(serviceSessionId)).expect(401);
    });

    it('creates a checkout with snapshotted line items and a matching total', async () => {
      const { serviceSessionId, customerRecordId } = await completeSession();

      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(checkoutCreateUrl(serviceSessionId))
        .expect(201);

      expect(response.body.data.status).toBe('OPEN');
      expect(response.body.data.serviceSessionId).toBe(serviceSessionId);
      expect(response.body.data.customerRecordId).toBe(customerRecordId);
      expect(response.body.data.currency).toBe(fixture.serviceCurrency);
      expect(response.body.data.subtotalMinor).toBe(fixture.servicePriceMinor);
      expect(response.body.data.adjustmentTotalMinor).toBe(0);
      expect(response.body.data.totalMinor).toBe(fixture.servicePriceMinor);
      expect(response.body.data.version).toBe(1);
      expect(response.body.data.reference).toMatch(/^CHK-/);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0]).toMatchObject({
        serviceId: fixture.serviceId,
        priceMinor: fixture.servicePriceMinor,
        currency: fixture.serviceCurrency,
      });

      const audit = await testApp.prisma.auditEvent.findMany({
        where: { organizationId: fixture.organizationId, entityId: response.body.data.id },
      });
      expect(audit.map((event) => event.action)).toContain('checkout.created');
    });

    it('never recalculates line items from the current service catalogue after price changes', async () => {
      const { serviceSessionId } = await completeSession();
      await testApp.prisma.service.update({ where: { id: fixture.serviceId }, data: { priceMinor: 999_999 } });

      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(checkoutCreateUrl(serviceSessionId))
        .expect(201);

      expect(response.body.data.subtotalMinor).toBe(fixture.servicePriceMinor);
      expect(response.body.data.items[0].priceMinor).toBe(fixture.servicePriceMinor);
    });

    it('rejects a checkout for a session still in progress', async () => {
      const entry = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue/walk-ins`)
        .send({ newCustomer: { name: 'In progress' }, serviceIds: [fixture.serviceId] })
        .expect(201);
      const started = await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.body.data.id}/start-service`)
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);

      const response = await authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(started.body.data.id));
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SERVICE_SESSION_NOT_COMPLETED');
    });

    it('rejects a checkout for a cancelled session', async () => {
      const entry = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue/walk-ins`)
        .send({ newCustomer: { name: 'Cancelled' }, serviceIds: [fixture.serviceId] })
        .expect(201);
      const started = await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.body.data.id}/start-service`)
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${started.body.data.id}/cancel`)
        .send({ reason: 'Customer left', disposition: 'CANCEL_VISIT' })
        .expect(201);

      const response = await authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(started.body.data.id));
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SERVICE_SESSION_NOT_COMPLETED');
    });

    it('rejects a zero-value checkout rather than silently treating it as paid', async () => {
      const freeService = await testApp.prisma.service.create({
        data: {
          organizationId: fixture.organizationId,
          name: 'Complimentary consult',
          durationMinutes: 10,
          priceMinor: 0,
          currency: fixture.serviceCurrency,
        },
      });
      await testApp.prisma.branchService.create({
        data: { organizationId: fixture.organizationId, branchId: fixture.branchId, serviceId: freeService.id, isEnabled: true },
      });
      await testApp.prisma.staffServiceAssignment.create({
        data: {
          organizationId: fixture.organizationId,
          staffProfileId: fixture.providerStaffProfileId,
          branchId: fixture.branchId,
          serviceId: freeService.id,
          isBookable: true,
        },
      });

      const { serviceSessionId } = await completeSession([freeService.id]);
      const response = await authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(serviceSessionId));
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CHECKOUT_TOTAL_INVALID');

      const checkoutCount = await testApp.prisma.checkout.count({ where: { serviceSessionId } });
      expect(checkoutCount).toBe(0);
    });

    it('a sequential duplicate creation returns CHECKOUT_ALREADY_EXISTS and creates nothing new', async () => {
      const { serviceSessionId } = await completeSession();
      const first = await authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(serviceSessionId)).expect(201);

      const second = await authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(serviceSessionId));
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('CHECKOUT_ALREADY_EXISTS');

      const checkouts = await testApp.prisma.checkout.findMany({ where: { serviceSessionId } });
      expect(checkouts).toHaveLength(1);
      expect(checkouts[0].id).toBe(first.body.data.id);
    });

    it('a genuine concurrent duplicate creation converges on exactly one checkout', async () => {
      const { serviceSessionId } = await completeSession();

      const [a, b] = await Promise.all([
        authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(serviceSessionId)),
        authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(serviceSessionId)),
      ]);
      expect([a.status, b.status].sort()).toEqual(expect.arrayContaining([201]));

      const checkouts = await testApp.prisma.checkout.findMany({ where: { serviceSessionId } });
      expect(checkouts).toHaveLength(1);
    });

    it('a membership with no checkouts.create permission is forbidden', async () => {
      // Deliberately an org-scoped custom role with zero permissions,
      // never the shared `receptionist` system role — that role's own
      // RolePermission rows are global (organizationId: null) and shared
      // by every test/organization in the suite, so mutating them here
      // would corrupt every other test that relies on it.
      const noPermission = await createNoPermissionActor(testApp, fixture);
      const { serviceSessionId } = await completeSession();
      const response = await authed(testApp, noPermission.accessToken).post(checkoutCreateUrl(serviceSessionId));
      expect(response.status).toBe(403);
    });

    it('READ_ONLY subscription blocks checkout creation', async () => {
      const { serviceSessionId } = await completeSession();
      await testApp.prisma.organizationSubscription.update({
        where: { organizationId: fixture.organizationId },
        data: { status: 'READ_ONLY' },
      });
      const response = await authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(serviceSessionId));
      expect(response.status).toBe(403);
    });

    it('a checkout from another organization is not found (fails safely, not a raw error)', async () => {
      const other = await createBookableFixture(testApp);
      const { serviceSessionId } = await createCompletedServiceSession(testApp, other, other.ownerAccessToken);
      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${serviceSessionId}/checkout`);
      expect(response.status).toBe(404);
    });
  });

  describe('listing and reading', () => {
    it('a cashier can list and read checkouts', async () => {
      const cashier = await createCashierActor(testApp, fixture);
      const { serviceSessionId } = await completeSession();
      const created = await authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(serviceSessionId)).expect(201);

      const list = await authed(testApp, cashier.accessToken)
        .get(`/v1/organizations/${fixture.organizationId}/checkouts`)
        .expect(200);
      expect(list.body.data.map((c: { id: string }) => c.id)).toContain(created.body.data.id);

      const get = await authed(testApp, cashier.accessToken).get(checkoutUrl(created.body.data.id)).expect(200);
      expect(get.body.data.id).toBe(created.body.data.id);
    });

    it('a service provider without checkouts.read cannot list or read checkouts', async () => {
      const { serviceSessionId } = await completeSession();
      const created = await authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(serviceSessionId)).expect(201);

      const list = await authed(testApp, fixture.providerAccessToken).get(`/v1/organizations/${fixture.organizationId}/checkouts`);
      expect(list.status).toBe(403);

      const get = await authed(testApp, fixture.providerAccessToken).get(checkoutUrl(created.body.data.id));
      expect(get.status).toBe(403);
    });

    it('returns 404, not a raw database error, for an unknown checkout id', async () => {
      const response = await authed(testApp, fixture.ownerAccessToken).get(
        checkoutUrl('00000000-0000-0000-0000-000000000000'),
      );
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBeDefined();
    });
  });

  describe('adjustments', () => {
    let manager: FinancialActor;

    beforeEach(async () => {
      manager = await createManagerActor(testApp, fixture);
    });

    async function createCheckout() {
      const { serviceSessionId } = await completeSession();
      const response = await authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(serviceSessionId)).expect(201);
      return response.body.data as { id: string; subtotalMinor: number; totalMinor: number };
    }

    it('a manager can add a discount and a surcharge, recomputing the total', async () => {
      const checkout = await createCheckout();

      const discounted = await authed(testApp, manager.accessToken)
        .post(checkoutUrl(checkout.id, '/adjustments'))
        .send({ type: 'DISCOUNT', amountMinor: 500, reason: 'Loyalty discount' })
        .expect(201);
      expect(discounted.body.data.adjustmentTotalMinor).toBe(-500);
      expect(discounted.body.data.totalMinor).toBe(checkout.subtotalMinor - 500);

      const surcharged = await authed(testApp, manager.accessToken)
        .post(checkoutUrl(checkout.id, '/adjustments'))
        .send({ type: 'SURCHARGE', amountMinor: 200, reason: 'Late booking fee' })
        .expect(201);
      expect(surcharged.body.data.adjustmentTotalMinor).toBe(-300);
      expect(surcharged.body.data.totalMinor).toBe(checkout.subtotalMinor - 300);
      expect(surcharged.body.data.adjustments).toHaveLength(2);
    });

    it('rejects a discount that would push the total below zero', async () => {
      const checkout = await createCheckout();
      const response = await authed(testApp, manager.accessToken)
        .post(checkoutUrl(checkout.id, '/adjustments'))
        .send({ type: 'DISCOUNT', amountMinor: checkout.subtotalMinor + 1, reason: 'Too generous' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CHECKOUT_TOTAL_INVALID');
    });

    it('rejects an adjustment with an empty reason', async () => {
      const checkout = await createCheckout();
      const response = await authed(testApp, manager.accessToken)
        .post(checkoutUrl(checkout.id, '/adjustments'))
        .send({ type: 'DISCOUNT', amountMinor: 100, reason: '' });
      expect(response.status).toBe(400);
    });

    it('a cashier without checkouts.adjust is forbidden', async () => {
      const cashier = await createCashierActor(testApp, fixture);
      const checkout = await createCheckout();
      const response = await authed(testApp, cashier.accessToken)
        .post(checkoutUrl(checkout.id, '/adjustments'))
        .send({ type: 'DISCOUNT', amountMinor: 100, reason: 'Nope' });
      expect(response.status).toBe(403);
    });

    it('adjustments are append-only — no update or delete route exists', async () => {
      const checkout = await createCheckout();
      await authed(testApp, manager.accessToken)
        .post(checkoutUrl(checkout.id, '/adjustments'))
        .send({ type: 'DISCOUNT', amountMinor: 100, reason: 'Initial' })
        .expect(201);

      const adjustmentId = (await testApp.prisma.checkoutAdjustment.findFirstOrThrow({ where: { checkoutId: checkout.id } })).id;
      const patchAttempt = await authed(testApp, manager.accessToken)
        .put(checkoutUrl(checkout.id, `/adjustments/${adjustmentId}`))
        .send({ amountMinor: 999 });
      expect(patchAttempt.status).toBe(404);
    });
  });

  describe('voiding', () => {
    let manager: FinancialActor;

    beforeEach(async () => {
      manager = await createManagerActor(testApp, fixture);
    });

    async function createCheckout() {
      const { serviceSessionId } = await completeSession();
      const response = await authed(testApp, extras.receptionistAccessToken).post(checkoutCreateUrl(serviceSessionId)).expect(201);
      return response.body.data as { id: string };
    }

    it('a manager can void an open checkout with a reason', async () => {
      const checkout = await createCheckout();
      const response = await authed(testApp, manager.accessToken)
        .post(checkoutUrl(checkout.id, '/void'))
        .send({ reason: 'Customer walked out' })
        .expect(201);
      expect(response.body.data.status).toBe('VOIDED');
      expect(response.body.data.voidReason).toBe('Customer walked out');
      expect(response.body.data.voidedByMembershipId).toBe(manager.membershipId);

      const audit = await testApp.prisma.auditEvent.findMany({
        where: { organizationId: fixture.organizationId, entityId: checkout.id, action: 'checkout.voided' },
      });
      expect(audit).toHaveLength(1);
    });

    it('rejects voiding with an empty reason', async () => {
      const checkout = await createCheckout();
      const response = await authed(testApp, manager.accessToken).post(checkoutUrl(checkout.id, '/void')).send({ reason: '' });
      expect(response.status).toBe(400);
    });

    it('a checkout that is already voided cannot be voided again', async () => {
      const checkout = await createCheckout();
      await authed(testApp, manager.accessToken).post(checkoutUrl(checkout.id, '/void')).send({ reason: 'First' }).expect(201);
      const response = await authed(testApp, manager.accessToken).post(checkoutUrl(checkout.id, '/void')).send({ reason: 'Second' });
      expect(response.status).toBe(409);
    });

    it('a cashier without checkouts.void is forbidden', async () => {
      const cashier = await createCashierActor(testApp, fixture);
      const checkout = await createCheckout();
      const response = await authed(testApp, cashier.accessToken).post(checkoutUrl(checkout.id, '/void')).send({ reason: 'Nope' });
      expect(response.status).toBe(403);
    });

    it('a voided checkout is immutable — no further adjustment can be added', async () => {
      const checkout = await createCheckout();
      await authed(testApp, manager.accessToken).post(checkoutUrl(checkout.id, '/void')).send({ reason: 'Gone' }).expect(201);
      const response = await authed(testApp, manager.accessToken)
        .post(checkoutUrl(checkout.id, '/adjustments'))
        .send({ type: 'DISCOUNT', amountMinor: 100, reason: 'Too late' });
      expect(response.status).toBe(409);
    });
  });
});
