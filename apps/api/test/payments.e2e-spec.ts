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
  createManagerActor,
  createNoPermissionActor,
  type FinancialActor,
} from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('Payment recording (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;
  let extras: QueueFixtureExtras;
  let cashier: FinancialActor;
  let checkoutId: string;
  let checkoutTotalMinor: number;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
    extras = await extendWithQueueRoles(testApp, fixture);
    cashier = await createCashierActor(testApp, fixture);

    const { serviceSessionId } = await createCompletedServiceSession(testApp, fixture, extras.receptionistAccessToken);
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

  function paymentsUrl(): string {
    return `/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}/payments`;
  }

  function checkoutUrl(): string {
    return `/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}`;
  }

  function recordPayment(actorToken: string, body: Record<string, unknown>, idempotencyKey = randomUUID()) {
    return authed(testApp, actorToken).post(paymentsUrl()).set('Idempotency-Key', idempotencyKey).send(body);
  }

  describe('recording', () => {
    it('rejects an unauthenticated request', async () => {
      await request(testApp.app.getHttpServer()).post(paymentsUrl()).send({}).expect(401);
    });

    it('rejects a request with no Idempotency-Key header', async () => {
      const response = await authed(testApp, cashier.accessToken)
        .post(paymentsUrl())
        .send({ method: 'CASH', appliedAmountMinor: checkoutTotalMinor, currency: fixture.serviceCurrency });
      expect(response.status).toBe(400);
    });

    it('records a CASH payment, moves the checkout to AWAITING_VERIFICATION, and returns computed change', async () => {
      const response = await recordPayment(cashier.accessToken, {
        method: 'CASH',
        appliedAmountMinor: checkoutTotalMinor,
        tenderedAmountMinor: checkoutTotalMinor + 500,
        currency: fixture.serviceCurrency,
      }).expect(201);

      expect(response.body.data.status).toBe('RECORDED');
      expect(response.body.data.reference).toMatch(/^PAY-/);
      expect(response.body.data.changeMinor).toBe(500);
      expect(response.body.data.confirmationRequiredByStaffProfileId).toBe(fixture.providerStaffProfileId);

      const checkoutAfter = await authed(testApp, cashier.accessToken).get(checkoutUrl()).expect(200);
      expect(checkoutAfter.body.data.status).toBe('AWAITING_VERIFICATION');

      const events = await testApp.prisma.paymentVerificationEvent.findMany({
        where: { paymentRecordId: response.body.data.id },
      });
      expect(events.map((event) => event.action)).toEqual(['RECORDED']);

      const audit = await testApp.prisma.auditEvent.findMany({
        where: { organizationId: fixture.organizationId, entityId: response.body.data.id, action: 'payment.recorded' },
      });
      expect(audit).toHaveLength(1);
    });

    it('a recorded payment does not itself create any Transaction or count as revenue', async () => {
      await recordPayment(cashier.accessToken, {
        method: 'CASH',
        appliedAmountMinor: checkoutTotalMinor,
        currency: fixture.serviceCurrency,
      }).expect(201);

      const transactionCount = await testApp.prisma.transaction.count({ where: { checkoutId } });
      expect(transactionCount).toBe(0);
    });

    it('rejects a currency mismatch', async () => {
      const response = await recordPayment(cashier.accessToken, {
        method: 'CASH',
        appliedAmountMinor: checkoutTotalMinor,
        currency: 'USD',
      });
      expect(response.status).toBe(400);
    });

    it('rejects tenderedAmountMinor for a non-CASH method', async () => {
      const response = await recordPayment(cashier.accessToken, {
        method: 'MOBILE_MONEY',
        appliedAmountMinor: checkoutTotalMinor,
        tenderedAmountMinor: checkoutTotalMinor + 100,
        currency: fixture.serviceCurrency,
      });
      expect(response.status).toBe(400);
    });

    it('rejects an externalReference that is not a safe code', async () => {
      const response = await recordPayment(cashier.accessToken, {
        method: 'MOBILE_MONEY',
        appliedAmountMinor: checkoutTotalMinor,
        currency: fixture.serviceCurrency,
        externalReference: '4111 1111 1111 1111',
      });
      expect(response.status).toBe(400);
    });

    it('supports split/partial payments summing exactly to the total', async () => {
      const half = Math.floor(checkoutTotalMinor / 2);
      const remainder = checkoutTotalMinor - half;

      await recordPayment(cashier.accessToken, { method: 'CASH', appliedAmountMinor: half, currency: fixture.serviceCurrency }).expect(
        201,
      );
      const second = await recordPayment(cashier.accessToken, {
        method: 'MOBILE_MONEY',
        appliedAmountMinor: remainder,
        currency: fixture.serviceCurrency,
      }).expect(201);
      expect(second.body.data.appliedAmountMinor).toBe(remainder);

      const payments = await testApp.prisma.paymentRecord.findMany({ where: { checkoutId } });
      expect(payments).toHaveLength(2);
    });

    it('rejects a payment that would exceed the checkout balance', async () => {
      await recordPayment(cashier.accessToken, {
        method: 'CASH',
        appliedAmountMinor: checkoutTotalMinor,
        currency: fixture.serviceCurrency,
      }).expect(201);

      const response = await recordPayment(cashier.accessToken, {
        method: 'CASH',
        appliedAmountMinor: 1,
        currency: fixture.serviceCurrency,
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CHECKOUT_BALANCE_EXCEEDED');
    });

    it('a replayed request with the same Idempotency-Key and body returns the original payment, not a duplicate', async () => {
      const key = randomUUID();
      const body = { method: 'CASH', appliedAmountMinor: checkoutTotalMinor, currency: fixture.serviceCurrency };
      const first = await recordPayment(cashier.accessToken, body, key).expect(201);
      const second = await recordPayment(cashier.accessToken, body, key).expect(201);
      expect(second.body.data.id).toBe(first.body.data.id);

      const payments = await testApp.prisma.paymentRecord.findMany({ where: { checkoutId } });
      expect(payments).toHaveLength(1);
    });

    it('reusing the same Idempotency-Key with a different body returns 409 IDEMPOTENCY_CONFLICT', async () => {
      const key = randomUUID();
      await recordPayment(cashier.accessToken, { method: 'CASH', appliedAmountMinor: 100, currency: fixture.serviceCurrency }, key).expect(
        201,
      );
      const response = await recordPayment(
        cashier.accessToken,
        { method: 'CASH', appliedAmountMinor: 200, currency: fixture.serviceCurrency },
        key,
      );
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('two different concurrent payment requests cannot together exceed the checkout balance', async () => {
      const [a, b] = await Promise.all([
        recordPayment(cashier.accessToken, { method: 'CASH', appliedAmountMinor: checkoutTotalMinor, currency: fixture.serviceCurrency }),
        recordPayment(cashier.accessToken, {
          method: 'MOBILE_MONEY',
          appliedAmountMinor: checkoutTotalMinor,
          currency: fixture.serviceCurrency,
        }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 409]);

      const payments = await testApp.prisma.paymentRecord.findMany({ where: { checkoutId, status: { not: 'VOIDED' } } });
      const total = payments.reduce((sum, payment) => sum + payment.appliedAmountMinor, 0);
      expect(total).toBeLessThanOrEqual(checkoutTotalMinor);
    });

    it('cannot record a payment against a voided checkout', async () => {
      const manager = await createManagerActor(testApp, fixture);
      await authed(testApp, manager.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}/void`)
        .send({ reason: 'Cancelled' })
        .expect(201);

      const response = await recordPayment(cashier.accessToken, {
        method: 'CASH',
        appliedAmountMinor: checkoutTotalMinor,
        currency: fixture.serviceCurrency,
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CHECKOUT_STATE_INVALID');
    });

    it('a membership without payments.record is forbidden', async () => {
      const noPermission = await createNoPermissionActor(testApp, fixture);
      const response = await recordPayment(noPermission.accessToken, {
        method: 'CASH',
        appliedAmountMinor: checkoutTotalMinor,
        currency: fixture.serviceCurrency,
      });
      expect(response.status).toBe(403);
    });

    it('never stores anything that looks like a card or bank credential', async () => {
      const response = await recordPayment(cashier.accessToken, {
        method: 'CARD',
        appliedAmountMinor: checkoutTotalMinor,
        currency: fixture.serviceCurrency,
        note: 'Card ending 4242',
      }).expect(201);
      // The DTO only ever accepts a bounded free-text note and a
      // regex-constrained externalReference; there is no field anywhere
      // in PaymentRecord shaped to hold a PAN, CVV, or PIN.
      expect(Object.keys(response.body.data)).not.toEqual(expect.arrayContaining(['cardNumber', 'pin', 'cvv']));
    });
  });

  describe('listing', () => {
    it('a cashier can list payments for a checkout', async () => {
      await recordPayment(cashier.accessToken, {
        method: 'CASH',
        appliedAmountMinor: checkoutTotalMinor,
        currency: fixture.serviceCurrency,
      }).expect(201);
      const response = await authed(testApp, cashier.accessToken).get(paymentsUrl()).expect(200);
      expect(response.body.data).toHaveLength(1);
    });

    it('a membership without payments.read cannot list payments', async () => {
      const noPermission = await createNoPermissionActor(testApp, fixture);
      const response = await authed(testApp, noPermission.accessToken).get(paymentsUrl());
      expect(response.status).toBe(403);
    });
  });

  describe('voiding a recorded (not yet confirmed) payment', () => {
    it('a manager can void, and the checkout reverts to OPEN when no other payment remains', async () => {
      const manager = await createManagerActor(testApp, fixture);
      const recorded = await recordPayment(cashier.accessToken, {
        method: 'CASH',
        appliedAmountMinor: checkoutTotalMinor,
        currency: fixture.serviceCurrency,
      }).expect(201);

      const voided = await authed(testApp, manager.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/payments/${recorded.body.data.id}/void`)
        .send({ reason: 'Data entry mistake' })
        .expect(201);
      expect(voided.body.data.status).toBe('VOIDED');

      const checkoutAfter = await authed(testApp, manager.accessToken).get(checkoutUrl()).expect(200);
      expect(checkoutAfter.body.data.status).toBe('OPEN');
    });

    it('a cashier without payments.resolve cannot void', async () => {
      const recorded = await recordPayment(cashier.accessToken, {
        method: 'CASH',
        appliedAmountMinor: checkoutTotalMinor,
        currency: fixture.serviceCurrency,
      }).expect(201);
      const response = await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/payments/${recorded.body.data.id}/void`)
        .send({ reason: 'Nope' });
      expect(response.status).toBe(403);
    });
  });
});
