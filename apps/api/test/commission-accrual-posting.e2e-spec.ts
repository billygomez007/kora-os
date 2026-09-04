import { randomUUID } from 'node:crypto';
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
  createPostedTransaction,
  type FinancialActor,
} from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('Commission accrual and transaction-posting integration (e2e)', () => {
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

  function rulesUrl(): string {
    return `/v1/organizations/${fixture.organizationId}/commission-rules`;
  }
  function commissionsUrl(suffix = ''): string {
    return `/v1/organizations/${fixture.organizationId}/commissions${suffix}`;
  }
  function myEarningsUrl(): string {
    return `/v1/organizations/${fixture.organizationId}/me/earnings`;
  }

  describe('calculation', () => {
    it('accrues a PERCENTAGE commission on GROSS_LINE basis matching the exact rounded amount', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 1000, basis: 'GROSS_LINE' }).expect(201);

      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);

      const accruals = await testApp.prisma.commissionAccrual.findMany({ where: { transactionId: posted.transactionId } });
      expect(accruals).toHaveLength(1);
      expect(accruals[0].source).toBe('POLICY');
      expect(accruals[0].basisSnapshot).toBe('GROSS_LINE');
      expect(accruals[0].basisAmountMinor).toBe(fixture.servicePriceMinor);
      expect(accruals[0].calculatedAmountMinor).toBe(Math.round((fixture.servicePriceMinor * 1000) / 10_000));
      expect(accruals[0].currency).toBe(fixture.serviceCurrency);
    });

    it('accrues a FIXED commission regardless of the line price', async () => {
      await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'FIXED', fixedAmountMinor: 777, fixedCurrency: fixture.serviceCurrency })
        .expect(201);

      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const accrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });
      expect(accrual.calculatedAmountMinor).toBe(777);
      expect(accrual.fixedAmountMinorSnapshot).toBe(777);
      expect(accrual.ruleTypeSnapshot).toBe('FIXED');
    });

    it('accrues zero for a NONE-type rule, still recorded as POLICY', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'NONE' }).expect(201);

      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const accrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });
      expect(accrual.calculatedAmountMinor).toBe(0);
      expect(accrual.source).toBe('POLICY');
    });

    it('creates an explicit zero-value NO_POLICY accrual when no rule matches, and still posts the Transaction', async () => {
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const accrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });
      expect(accrual.source).toBe('NO_POLICY');
      expect(accrual.calculatedAmountMinor).toBe(0);
      expect(accrual.commissionRuleId).toBeNull();

      const transaction = await testApp.prisma.transaction.findUniqueOrThrow({ where: { id: posted.transactionId } });
      expect(transaction.status).toBe('POSTED');
    });

    it('picks the most specific rule when multiple scopes match', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 500 }).expect(201);
      await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 2000, staffProfileId: fixture.providerStaffProfileId })
        .expect(201);

      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const accrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });
      expect(accrual.calculatedAmountMinor).toBe(Math.round((fixture.servicePriceMinor * 2000) / 10_000));
    });

    it('uses NET_LINE_AFTER_ADJUSTMENTS basis, reflecting a discount applied to the checkout', async () => {
      await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 1000, basis: 'NET_LINE_AFTER_ADJUSTMENTS' })
        .expect(201);

      const { serviceSessionId } = await createCompletedServiceSession(testApp, fixture, extras.receptionistAccessToken);
      const checkout = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${serviceSessionId}/checkout`)
        .expect(201);
      await authed(testApp, manager.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkout.body.data.id}/adjustments`)
        .send({ type: 'DISCOUNT', amountMinor: 500, reason: 'Promo' })
        .expect(201);
      const netTotal = fixture.servicePriceMinor - 500;

      const payment = await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkout.body.data.id}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: netTotal, currency: fixture.serviceCurrency })
        .expect(201);
      await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/payments/${payment.body.data.id}/confirm`)
        .send({})
        .expect(201);

      const transaction = await testApp.prisma.transaction.findFirstOrThrow({ where: { checkoutId: checkout.body.data.id } });
      const accrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: transaction.id } });
      expect(accrual.basisSnapshot).toBe('NET_LINE_AFTER_ADJUSTMENTS');
      expect(accrual.basisAmountMinor).toBe(netTotal);
      expect(accrual.calculatedAmountMinor).toBe(Math.round((netTotal * 1000) / 10_000));
    });
  });

  describe('atomicity with transaction posting', () => {
    it('no accrual exists before the payment is confirmed', async () => {
      const { serviceSessionId } = await createCompletedServiceSession(testApp, fixture, extras.receptionistAccessToken);
      const checkout = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${serviceSessionId}/checkout`)
        .expect(201);
      await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkout.body.data.id}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: checkout.body.data.totalMinor, currency: fixture.serviceCurrency })
        .expect(201);

      const accrualCount = await testApp.prisma.commissionAccrual.count({ where: { organizationId: fixture.organizationId } });
      expect(accrualCount).toBe(0);
    });

    it('a disputed payment creates no accrual', async () => {
      const { serviceSessionId } = await createCompletedServiceSession(testApp, fixture, extras.receptionistAccessToken);
      const checkout = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${serviceSessionId}/checkout`)
        .expect(201);
      const payment = await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkout.body.data.id}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: checkout.body.data.totalMinor, currency: fixture.serviceCurrency })
        .expect(201);
      await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/payments/${payment.body.data.id}/dispute`)
        .send({ reason: 'Never received' })
        .expect(201);

      const accrualCount = await testApp.prisma.commissionAccrual.count({ where: { organizationId: fixture.organizationId } });
      expect(accrualCount).toBe(0);
    });

    it('five simultaneous confirmation attempts produce exactly one accrual per line item', async () => {
      const { serviceSessionId } = await createCompletedServiceSession(testApp, fixture, extras.receptionistAccessToken);
      const checkout = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${serviceSessionId}/checkout`)
        .expect(201);
      const payment = await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkout.body.data.id}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: checkout.body.data.totalMinor, currency: fixture.serviceCurrency })
        .expect(201);

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          authed(testApp, fixture.providerAccessToken)
            .post(`/v1/organizations/${fixture.organizationId}/payments/${payment.body.data.id}/confirm`)
            .send({}),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);

      const transaction = await testApp.prisma.transaction.findFirstOrThrow({ where: { checkoutId: checkout.body.data.id } });
      const accruals = await testApp.prisma.commissionAccrual.findMany({ where: { transactionId: transaction.id } });
      expect(accruals).toHaveLength(1);
    });

    it('superseding or deactivating a rule after posting never changes an already-created accrual', async () => {
      const rule = await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 1000 }).expect(201);
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const accrualBefore = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });

      await authed(testApp, manager.accessToken).post(`${rulesUrl()}/${rule.body.data.id}/deactivate`).send({}).expect(201);

      const accrualAfter = await testApp.prisma.commissionAccrual.findUniqueOrThrow({ where: { id: accrualBefore.id } });
      expect(accrualAfter.calculatedAmountMinor).toBe(accrualBefore.calculatedAmountMinor);
      expect(accrualAfter.rateBasisPointsSnapshot).toBe(1000);
    });
  });

  describe('reading', () => {
    it('commissions.read_all lists accruals org-wide', async () => {
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const response = await authed(testApp, manager.accessToken).get(commissionsUrl()).expect(200);
      expect(response.body.data.map((a: { transactionId: string }) => a.transactionId)).toContain(posted.transactionId);
    });

    it('a membership without commissions.read_all cannot list org-wide accruals', async () => {
      const noPermission = await createNoPermissionActor(testApp, fixture);
      const response = await authed(testApp, noPermission.accessToken).get(commissionsUrl());
      expect(response.status).toBe(403);
    });

    it('the provider sees their own earnings, with transaction/service context, never another provider\'s', async () => {
      await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);

      const own = await authed(testApp, fixture.providerAccessToken).get(myEarningsUrl()).expect(200);
      expect(own.body.data.length).toBeGreaterThan(0);
      expect(own.body.data[0]).toMatchObject({ staffProfileId: fixture.providerStaffProfileId, serviceId: fixture.serviceId });
      expect(own.body.data[0].transactionReference).toMatch(/^TXN-/);

      const other = await authed(testApp, extras.secondProviderAccessToken).get(myEarningsUrl()).expect(200);
      expect(other.body.data).toEqual([]);
    });

    it('a cashier without commissions.read_own cannot reach /me/earnings', async () => {
      const response = await authed(testApp, cashier.accessToken).get(myEarningsUrl());
      expect(response.status).toBe(403);
    });
  });
});
