import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import {
  createCashierActor,
  createManagerActor,
  createNoPermissionActor,
  createPostedTransaction,
  type FinancialActor,
} from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('Owner/manager reports (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;
  let extras: QueueFixtureExtras;
  let manager: FinancialActor;
  let cashier: FinancialActor;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
    extras = await extendWithQueueRoles(testApp, fixture);
    manager = await createManagerActor(testApp, fixture);
    cashier = await createCashierActor(testApp, fixture);
  });

  afterEach(async () => {
    await cleanupAllBookableFixtures(testApp);
    await testApp.app.close();
  });

  // A window centered on "now" (100 days each side, well under the
  // 366-day ceiling) so it always covers whatever this test just
  // posted, regardless of the real wall-clock date the suite runs on.
  function reportsUrl(path: string, params: Record<string, string> = {}): string {
    const oneHundredDaysMs = 100 * 24 * 60 * 60 * 1000;
    const from = new Date(Date.now() - oneHundredDaysMs).toISOString();
    const to = new Date(Date.now() + oneHundredDaysMs).toISOString();
    const query = new URLSearchParams({ from, to, ...params });
    return `/v1/organizations/${fixture.organizationId}/reports/${path}?${query.toString()}`;
  }

  describe('overview', () => {
    it('rejects an unauthenticated request', async () => {
      await request(testApp.app.getHttpServer()).get(reportsUrl('overview')).expect(401);
    });

    it('counts only a POSTED transaction as revenue, never a merely-recorded payment claim', async () => {
      // A checkout with a payment recorded but not yet confirmed —
      // contributes to pendingPaymentClaimCount, never to revenue.
      const { serviceSessionId } = await createPostedTransactionSetupOnly();
      void serviceSessionId;

      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);

      const response = await authed(testApp, manager.accessToken).get(reportsUrl('overview')).expect(200);
      expect(response.body.data.transactionCount).toBe(1);
      expect(response.body.data.postedRevenue).toEqual([{ currency: fixture.serviceCurrency, amountMinor: posted.checkoutTotalMinor }]);
      expect(response.body.data.pendingPaymentClaimCount).toBeGreaterThanOrEqual(1);
      expect(response.body.data.completedServiceCount).toBe(1);
    });

    async function createPostedTransactionSetupOnly() {
      const walkIn = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue/walk-ins`)
        .send({ newCustomer: { name: 'Pending claim' }, serviceIds: [fixture.serviceId] })
        .expect(201);
      const started = await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${walkIn.body.data.id}/start-service`)
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${started.body.data.id}/complete`)
        .expect(201);
      const checkout = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${started.body.data.id}/checkout`)
        .expect(201);
      await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkout.body.data.id}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: checkout.body.data.totalMinor, currency: fixture.serviceCurrency })
        .expect(201);
      return { serviceSessionId: started.body.data.id };
    }

    it('rejects a missing from/to', async () => {
      const response = await authed(testApp, manager.accessToken).get(
        `/v1/organizations/${fixture.organizationId}/reports/overview`,
      );
      expect(response.status).toBe(400);
    });

    it('rejects a date range beyond 366 days', async () => {
      const response = await authed(testApp, manager.accessToken).get(
        reportsUrl('overview', { from: '2020-01-01T00:00:00Z', to: '2022-01-01T00:00:00Z' }),
      );
      expect(response.status).toBe(400);
    });

    it('scopes to a branch and rejects a branch id from another organization', async () => {
      await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const ownBranch = await authed(testApp, manager.accessToken).get(reportsUrl('overview', { branchId: fixture.branchId })).expect(200);
      expect(ownBranch.body.data.transactionCount).toBe(1);

      const other = await createBookableFixture(testApp);
      const foreignBranch = await authed(testApp, manager.accessToken).get(reportsUrl('overview', { branchId: other.branchId }));
      expect(foreignBranch.status).toBe(404);
    });

    it('a membership without reports.read is forbidden', async () => {
      const noPermission = await createNoPermissionActor(testApp, fixture);
      const response = await authed(testApp, noPermission.accessToken).get(reportsUrl('overview'));
      expect(response.status).toBe(403);
    });

    it('a cashier without reports.read (reports.read is owner/manager only) is forbidden', async () => {
      const response = await authed(testApp, cashier.accessToken).get(reportsUrl('overview'));
      expect(response.status).toBe(403);
    });

    it('is readable under a READ_ONLY subscription', async () => {
      await testApp.prisma.organizationSubscription.update({
        where: { organizationId: fixture.organizationId },
        data: { status: 'READ_ONLY' },
      });
      const response = await authed(testApp, manager.accessToken).get(reportsUrl('overview'));
      expect(response.status).toBe(200);
    });
  });

  describe('revenue (daily time series)', () => {
    it('buckets by branch-local date when branchId is given, without requiring an explicit timezone', async () => {
      const branch = await testApp.prisma.branch.findUniqueOrThrow({ where: { id: fixture.branchId } });
      await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const response = await authed(testApp, manager.accessToken).get(reportsUrl('revenue', { branchId: fixture.branchId })).expect(200);
      expect(response.body.data.timeZone).toBe(branch.timeZone);
      expect(response.body.data.buckets.length).toBeGreaterThan(0);
      expect(response.body.data.buckets[0]).toHaveProperty('date');
      expect(response.body.data.buckets[0]).toHaveProperty('currency', fixture.serviceCurrency);
    });

    it('requires an explicit timezone for an organization-wide (no branchId) report', async () => {
      const response = await authed(testApp, manager.accessToken).get(reportsUrl('revenue'));
      expect(response.status).toBe(400);
    });

    it('accepts an explicit valid timezone for an organization-wide report', async () => {
      await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const response = await authed(testApp, manager.accessToken).get(reportsUrl('revenue', { timezone: 'Africa/Accra' })).expect(200);
      expect(response.body.data.timeZone).toBe('Africa/Accra');
    });

    it('rejects an invalid explicit timezone', async () => {
      const response = await authed(testApp, manager.accessToken).get(reportsUrl('revenue', { timezone: 'Not/AZone' }));
      expect(response.status).toBe(400);
    });
  });

  describe('staff-performance, services, payment-methods, commissions', () => {
    it('staff-performance reports revenue and commission for the assigned provider', async () => {
      await authed(testApp, manager.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/commission-rules`)
        .send({ type: 'PERCENTAGE', rateBasisPoints: 1000 })
        .expect(201);
      await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);

      const response = await authed(testApp, manager.accessToken).get(reportsUrl('staff-performance')).expect(200);
      const entry = response.body.data.find((e: { staffProfileId: string }) => e.staffProfileId === fixture.providerStaffProfileId);
      expect(entry).toBeDefined();
      expect(entry.revenue).toEqual([{ currency: fixture.serviceCurrency, amountMinor: fixture.servicePriceMinor }]);
      expect(entry.commissionAccrued).toEqual([{ currency: fixture.serviceCurrency, amountMinor: Math.round((fixture.servicePriceMinor * 1000) / 10_000) }]);
    });

    it('services reports revenue per service', async () => {
      await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const response = await authed(testApp, manager.accessToken).get(reportsUrl('services')).expect(200);
      const entry = response.body.data.find((e: { serviceId: string }) => e.serviceId === fixture.serviceId);
      expect(entry.serviceCount).toBe(1);
      expect(entry.revenue).toEqual([{ currency: fixture.serviceCurrency, amountMinor: fixture.servicePriceMinor }]);
    });

    it('payment-methods derives its totals from receipt payment summaries, matching what was actually applied', async () => {
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const response = await authed(testApp, manager.accessToken).get(reportsUrl('payment-methods')).expect(200);
      const cash = response.body.data.find((e: { method: string }) => e.method === 'CASH');
      expect(cash.total).toEqual([{ currency: fixture.serviceCurrency, amountMinor: posted.checkoutTotalMinor }]);
      expect(cash.count).toBeGreaterThanOrEqual(1);
    });

    it('commissions report separates POLICY and NO_POLICY accrual per staff', async () => {
      await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const response = await authed(testApp, manager.accessToken).get(reportsUrl('commissions')).expect(200);
      const entry = response.body.data.find((e: { staffProfileId: string }) => e.staffProfileId === fixture.providerStaffProfileId);
      expect(entry.noPolicyAccrued).toEqual([{ currency: fixture.serviceCurrency, amountMinor: 0 }]);
    });

    it('supports pagination via cursor/limit', async () => {
      await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const response = await authed(testApp, manager.accessToken).get(reportsUrl('services', { limit: '1' })).expect(200);
      expect(response.body.data.length).toBeLessThanOrEqual(1);
      expect(response.body.page).toHaveProperty('hasMore');
    });
  });

  describe('currency separation', () => {
    it('keeps two different currencies as separate report entries, never combined into one total', async () => {
      const usdService = await testApp.prisma.service.create({
        data: { organizationId: fixture.organizationId, name: 'USD Import Service', durationMinutes: 30, priceMinor: 4000, currency: 'USD' },
      });
      await testApp.prisma.branchService.create({
        data: { organizationId: fixture.organizationId, branchId: fixture.branchId, serviceId: usdService.id, isEnabled: true },
      });
      await testApp.prisma.staffServiceAssignment.create({
        data: { organizationId: fixture.organizationId, staffProfileId: fixture.providerStaffProfileId, branchId: fixture.branchId, serviceId: usdService.id, isBookable: true },
      });

      await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);

      // createPostedTransaction always pays in fixture.serviceCurrency
      // (GHS), which would mismatch a USD checkout — build this second,
      // differently-currencied transaction inline instead.
      const usdSession = await createCompletedServiceSessionInline([usdService.id]);
      const usdCheckout = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${usdSession}/checkout`)
        .expect(201);
      const usdPayment = await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${usdCheckout.body.data.id}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: usdCheckout.body.data.totalMinor, currency: 'USD' })
        .expect(201);
      await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/payments/${usdPayment.body.data.id}/confirm`)
        .send({})
        .expect(201);

      async function createCompletedServiceSessionInline(serviceIds: string[]): Promise<string> {
        const walkIn = await authed(testApp, extras.receptionistAccessToken)
          .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue/walk-ins`)
          .send({ newCustomer: { name: 'USD Customer' }, serviceIds })
          .expect(201);
        const started = await authed(testApp, fixture.providerAccessToken)
          .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${walkIn.body.data.id}/start-service`)
          .send({ staffProfileId: fixture.providerStaffProfileId })
          .expect(201);
        await authed(testApp, fixture.providerAccessToken)
          .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${started.body.data.id}/complete`)
          .expect(201);
        return started.body.data.id as string;
      }

      const response = await authed(testApp, manager.accessToken).get(reportsUrl('overview')).expect(200);
      const currencies = response.body.data.postedRevenue.map((r: { currency: string }) => r.currency).sort();
      expect(currencies).toEqual(['GHS', 'USD']);
    });
  });
});
