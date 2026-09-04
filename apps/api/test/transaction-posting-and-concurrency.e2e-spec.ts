import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import {
  createCashierActor,
  createCompletedServiceSession,
  type FinancialActor,
} from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('Transaction posting and financial concurrency (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;
  let extras: QueueFixtureExtras;
  let cashier: FinancialActor;
  let checkoutId: string;
  let checkoutTotalMinor: number;
  let serviceSessionId: string;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
    extras = await extendWithQueueRoles(testApp, fixture);
    cashier = await createCashierActor(testApp, fixture);

    const session = await createCompletedServiceSession(testApp, fixture, extras.receptionistAccessToken);
    serviceSessionId = session.serviceSessionId;
    const checkout = await authed(testApp, extras.receptionistAccessToken)
      .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${serviceSessionId}/checkout`)
      .expect(201);
    checkoutId = checkout.body.data.id;
    checkoutTotalMinor = checkout.body.data.totalMinor;
  });

  afterEach(async () => {
    await cleanupAllBookableFixtures(testApp);
    await testApp.app.close();
  });

  async function recordPayment(appliedAmountMinor: number) {
    const response = await authed(testApp, cashier.accessToken)
      .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}/payments`)
      .set('Idempotency-Key', randomUUID())
      .send({ method: 'MOBILE_MONEY', appliedAmountMinor, currency: fixture.serviceCurrency })
      .expect(201);
    return response.body.data as { id: string };
  }

  function confirmUrl(paymentId: string): string {
    return `/v1/organizations/${fixture.organizationId}/payments/${paymentId}/confirm`;
  }
  function disputeUrl(paymentId: string): string {
    return `/v1/organizations/${fixture.organizationId}/payments/${paymentId}/dispute`;
  }
  function checkoutUrl(): string {
    return `/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}`;
  }
  function transactionsUrl(suffix = ''): string {
    return `/v1/organizations/${fixture.organizationId}/transactions${suffix}`;
  }

  describe('posting', () => {
    it('posts exactly one Transaction when the single confirmed payment exactly covers the total', async () => {
      const payment = await recordPayment(checkoutTotalMinor);
      await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({}).expect(201);

      const checkoutAfter = await authed(testApp, cashier.accessToken).get(checkoutUrl()).expect(200);
      expect(checkoutAfter.body.data.status).toBe('SETTLED');
      expect(checkoutAfter.body.data.settledAt).not.toBeNull();

      const transactions = await testApp.prisma.transaction.findMany({ where: { checkoutId } });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].status).toBe('POSTED');
      expect(transactions[0].totalMinor).toBe(checkoutTotalMinor);
      expect(transactions[0].serviceSessionId).toBe(serviceSessionId);

      const audit = await testApp.prisma.auditEvent.findMany({
        where: { organizationId: fixture.organizationId, entityId: transactions[0].id, action: 'transaction.posted' },
      });
      expect(audit).toHaveLength(1);
    });

    it('posts a Transaction only once every split payment is confirmed, not before', async () => {
      const half = Math.floor(checkoutTotalMinor / 2);
      const remainder = checkoutTotalMinor - half;
      const first = await recordPayment(half);
      const second = await recordPayment(remainder);

      await authed(testApp, fixture.providerAccessToken).post(confirmUrl(first.id)).send({}).expect(201);
      let transactions = await testApp.prisma.transaction.findMany({ where: { checkoutId } });
      expect(transactions).toHaveLength(0);
      const checkoutMidway = await authed(testApp, cashier.accessToken).get(checkoutUrl()).expect(200);
      expect(checkoutMidway.body.data.status).toBe('AWAITING_VERIFICATION');

      await authed(testApp, fixture.providerAccessToken).post(confirmUrl(second.id)).send({}).expect(201);
      transactions = await testApp.prisma.transaction.findMany({ where: { checkoutId } });
      expect(transactions).toHaveLength(1);

      const allocations = await testApp.prisma.transactionPaymentAllocation.findMany({
        where: { transactionId: transactions[0].id },
      });
      expect(allocations).toHaveLength(2);
      expect(allocations.map((a) => a.appliedAmountMinor).sort()).toEqual([half, remainder].sort());
    });

    it('copies immutable line-item snapshots from the checkout, unaffected by later catalogue changes', async () => {
      const payment = await recordPayment(checkoutTotalMinor);
      await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({}).expect(201);
      await testApp.prisma.service.update({ where: { id: fixture.serviceId }, data: { priceMinor: 1 } });

      const response = await authed(testApp, cashier.accessToken).get(transactionsUrl()).expect(200);
      const transaction = response.body.data[0];
      expect(transaction.items[0].priceMinor).toBe(fixture.servicePriceMinor);
      expect(transaction.totalMinor).toBe(checkoutTotalMinor);
    });

    it('a disputed payment never posts a Transaction', async () => {
      const payment = await recordPayment(checkoutTotalMinor);
      await authed(testApp, fixture.providerAccessToken).post(disputeUrl(payment.id)).send({ reason: 'Missing' }).expect(201);

      const transactions = await testApp.prisma.transaction.count({ where: { checkoutId } });
      expect(transactions).toBe(0);
    });

    it('there is no public endpoint that directly creates a Transaction', async () => {
      const response = await authed(testApp, cashier.accessToken).post(transactionsUrl()).send({ checkoutId });
      expect(response.status).toBe(404);
    });

    it('a posted transaction cannot be updated or deleted through any public route', async () => {
      const payment = await recordPayment(checkoutTotalMinor);
      await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({}).expect(201);
      const transactions = await testApp.prisma.transaction.findMany({ where: { checkoutId } });

      const patchAttempt = await authed(testApp, cashier.accessToken).put(transactionsUrl(`/${transactions[0].id}`)).send({ totalMinor: 1 });
      expect(patchAttempt.status).toBe(404);
      const deleteAttempt = await request(testApp.app.getHttpServer())
        .delete(transactionsUrl(`/${transactions[0].id}`))
        .set('Authorization', `Bearer ${cashier.accessToken}`);
      expect(deleteAttempt.status).toBe(404);
    });

    it('cannot read a transaction from another organization', async () => {
      const other = await createBookableFixture(testApp);
      const otherExtras = await extendWithQueueRoles(testApp, other);
      const otherSession = await createCompletedServiceSession(testApp, other, otherExtras.receptionistAccessToken);
      const otherCheckout = await authed(testApp, otherExtras.receptionistAccessToken)
        .post(`/v1/organizations/${other.organizationId}/service-sessions/${otherSession.serviceSessionId}/checkout`)
        .expect(201);
      const otherCashier = await createCashierActor(testApp, other);
      const otherPayment = await authed(testApp, otherCashier.accessToken)
        .post(`/v1/organizations/${other.organizationId}/checkouts/${otherCheckout.body.data.id}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: otherCheckout.body.data.totalMinor, currency: other.serviceCurrency })
        .expect(201);
      await authed(testApp, other.providerAccessToken).post(`/v1/organizations/${other.organizationId}/payments/${otherPayment.body.data.id}/confirm`).send({}).expect(201);
      const otherTransaction = await testApp.prisma.transaction.findFirstOrThrow({ where: { checkoutId: otherCheckout.body.data.id } });

      const response = await authed(testApp, cashier.accessToken).get(transactionsUrl(`/${otherTransaction.id}`));
      expect(response.status).toBe(404);
    });

    it('a membership without transactions.read is forbidden', async () => {
      const response = await authed(testApp, fixture.providerAccessToken).get(transactionsUrl());
      expect(response.status).toBe(403);
    });
  });

  describe('concurrency', () => {
    it('five simultaneous confirmations of the final payment produce exactly one Transaction', async () => {
      const payment = await recordPayment(checkoutTotalMinor);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({})),
      );
      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);
      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(4);

      const transactions = await testApp.prisma.transaction.findMany({ where: { checkoutId } });
      expect(transactions).toHaveLength(1);

      const events = await testApp.prisma.paymentVerificationEvent.findMany({
        where: { paymentRecordId: payment.id, action: 'CONFIRMED' },
      });
      expect(events).toHaveLength(1);
    });

    it('confirm and dispute racing on the same payment produce exactly one valid outcome', async () => {
      const payment = await recordPayment(checkoutTotalMinor);

      const [confirmResult, disputeResult] = await Promise.all([
        authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({}),
        authed(testApp, fixture.providerAccessToken).post(disputeUrl(payment.id)).send({ reason: 'Racing dispute' }),
      ]);
      const statuses = [confirmResult.status, disputeResult.status].sort();
      expect(statuses).toEqual([201, 409]);

      const finalPayment = await testApp.prisma.paymentRecord.findUniqueOrThrow({ where: { id: payment.id } });
      expect(['CONFIRMED', 'DISPUTED']).toContain(finalPayment.status);

      // Whichever won, the checkout's derived state is internally
      // consistent with it (SETTLED iff CONFIRMED covered the total;
      // DISPUTED iff the dispute won) — never both, never neither.
      const checkoutAfter = await testApp.prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
      if (finalPayment.status === 'CONFIRMED') {
        expect(checkoutAfter.status).toBe('SETTLED');
      } else {
        expect(checkoutAfter.status).toBe('DISPUTED');
      }
    });

    it('a failed confirmation attempt leaves the checkout, payment, and transaction rows completely unchanged', async () => {
      const payment = await recordPayment(checkoutTotalMinor);
      await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({}).expect(201);

      const checkoutBefore = await testApp.prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
      const transactionBefore = await testApp.prisma.transaction.findFirstOrThrow({ where: { checkoutId } });

      // A second confirmation attempt on the now-CONFIRMED payment must fail...
      const response = await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({});
      expect(response.status).toBe(409);

      // ...and leave every row exactly as it was.
      const checkoutAfter = await testApp.prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
      expect(checkoutAfter.version).toBe(checkoutBefore.version);
      expect(checkoutAfter.status).toBe(checkoutBefore.status);
      const transactionsAfter = await testApp.prisma.transaction.findMany({ where: { checkoutId } });
      expect(transactionsAfter).toHaveLength(1);
      expect(transactionsAfter[0].id).toBe(transactionBefore.id);
    });

    it('cross-tenant payment ids fail safely (404), never a raw database error', async () => {
      const other = await createBookableFixture(testApp);
      const otherExtras = await extendWithQueueRoles(testApp, other);
      const otherSession = await createCompletedServiceSession(testApp, other, otherExtras.receptionistAccessToken);
      const otherCheckout = await authed(testApp, otherExtras.receptionistAccessToken)
        .post(`/v1/organizations/${other.organizationId}/service-sessions/${otherSession.serviceSessionId}/checkout`)
        .expect(201);
      const otherCashier = await createCashierActor(testApp, other);
      const otherPayment = await authed(testApp, otherCashier.accessToken)
        .post(`/v1/organizations/${other.organizationId}/checkouts/${otherCheckout.body.data.id}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: otherCheckout.body.data.totalMinor, currency: other.serviceCurrency })
        .expect(201);

      // Using this fixture's own organizationId in the URL with the
      // *other* organization's payment id, as an actor who genuinely
      // holds payments.verify_own in this org (so the request clears
      // the coarse route permission gate and reaches the service-layer
      // lookup, which is the boundary actually under test here).
      const response = await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/payments/${otherPayment.body.data.id}/confirm`)
        .send({});
      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).not.toMatch(/prisma|sql|constraint/i);
    });

    it('the existing queue/service-session concurrency behavior is unaffected', async () => {
      // A light smoke check, not a duplicate of queue-intake-and-
      // commands.e2e-spec.ts's own dedicated coverage: starting the same
      // queue entry's service twice concurrently still yields exactly
      // one active ServiceSession.
      const entry = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue/walk-ins`)
        .send({ newCustomer: { name: 'Concurrency check' }, serviceIds: [fixture.serviceId] })
        .expect(201);

      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          authed(testApp, fixture.providerAccessToken)
            .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.body.data.id}/start-service`)
            .send({ staffProfileId: fixture.providerStaffProfileId }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);

      const sessions = await testApp.prisma.serviceSession.findMany({ where: { queueEntryId: entry.body.data.id } });
      expect(sessions).toHaveLength(1);
    });
  });
});
