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
  type FinancialActor,
} from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('Payment verification and disputes (e2e)', () => {
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

  async function recordPayment(actorToken: string, appliedAmountMinor = checkoutTotalMinor) {
    const response = await authed(testApp, actorToken)
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

  describe('confirming', () => {
    it('rejects an unauthenticated request', async () => {
      const payment = await recordPayment(cashier.accessToken);
      await request(testApp.app.getHttpServer()).post(confirmUrl(payment.id)).send({}).expect(401);
    });

    it('the assigned provider confirms a payment recorded by someone else', async () => {
      const payment = await recordPayment(cashier.accessToken);
      const response = await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({}).expect(201);
      expect(response.body.data.status).toBe('CONFIRMED');
      expect(response.body.data.confirmedByMembershipId).toBe(fixture.providerMembershipId);

      const events = await testApp.prisma.paymentVerificationEvent.findMany({ where: { paymentRecordId: payment.id } });
      expect(events.map((event) => event.action)).toEqual(['RECORDED', 'CONFIRMED']);
    });

    it('a cashier cannot confirm merely because they recorded the payment', async () => {
      const payment = await recordPayment(cashier.accessToken);
      const response = await authed(testApp, cashier.accessToken).post(confirmUrl(payment.id)).send({});
      expect(response.status).toBe(403);
    });

    it('a different provider cannot confirm someone else\'s assigned payment', async () => {
      const payment = await recordPayment(cashier.accessToken);
      const response = await authed(testApp, extras.secondProviderAccessToken).post(confirmUrl(payment.id)).send({});
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PAYMENT_CONFIRMATION_FORBIDDEN');
    });

    it('a recorder who is also the assigned provider cannot self-confirm', async () => {
      // The provider records their own claim directly (they also hold
      // payments.record via the seeded service_provider... actually the
      // service_provider role has no payments.record, so record as the
      // owner acting on the provider's own StaffProfile-linked checkout
      // is not representative; instead simulate the deadlock directly at
      // the data layer, which is the only way a provider ends up as
      // both recordedByMembershipId and confirmationRequiredByStaffProfileId.
      const payment = await recordPayment(cashier.accessToken);
      await testApp.prisma.paymentRecord.update({
        where: { id: payment.id },
        data: { recordedByMembershipId: fixture.providerMembershipId },
      });
      const response = await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({});
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PAYMENT_SELF_CONFIRMATION_FORBIDDEN');
    });

    it('a manager can confirm as a management override, only with a reason, and it is clearly labelled', async () => {
      const payment = await recordPayment(cashier.accessToken);
      const manager = await createManagerActor(testApp, fixture);

      const noReason = await authed(testApp, manager.accessToken).post(confirmUrl(payment.id)).send({});
      expect(noReason.status).toBe(400);

      const response = await authed(testApp, manager.accessToken)
        .post(confirmUrl(payment.id))
        .send({ reason: 'Provider unreachable, confirmed against till slip' })
        .expect(201);
      expect(response.body.data.status).toBe('CONFIRMED');

      const audit = await testApp.prisma.auditEvent.findMany({
        where: { organizationId: fixture.organizationId, entityId: payment.id, action: 'payment.management_override' },
      });
      expect(audit).toHaveLength(1);
      expect((audit[0].metadata as { reason: string }).reason).toContain('Provider unreachable');
    });

    it('confirming an already-confirmed payment fails cleanly', async () => {
      const payment = await recordPayment(cashier.accessToken);
      await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({}).expect(201);
      const response = await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({});
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PAYMENT_STATE_INVALID');
    });
  });

  describe('disputing', () => {
    it('the assigned provider disputes a payment with a reason, moving the checkout to DISPUTED', async () => {
      const payment = await recordPayment(cashier.accessToken);
      const response = await authed(testApp, fixture.providerAccessToken)
        .post(disputeUrl(payment.id))
        .send({ reason: 'I never received this' })
        .expect(201);
      expect(response.body.data.status).toBe('DISPUTED');

      const checkoutAfter = await authed(testApp, cashier.accessToken).get(checkoutUrl()).expect(200);
      expect(checkoutAfter.body.data.status).toBe('DISPUTED');

      const dispute = await testApp.prisma.paymentDispute.findUniqueOrThrow({ where: { paymentRecordId: payment.id } });
      expect(dispute.status).toBe('OPEN');
      expect(dispute.reason).toBe('I never received this');
    });

    it('rejects disputing with an empty reason', async () => {
      const payment = await recordPayment(cashier.accessToken);
      const response = await authed(testApp, fixture.providerAccessToken).post(disputeUrl(payment.id)).send({ reason: '' });
      expect(response.status).toBe(400);
    });

    it('a different provider cannot dispute someone else\'s assigned payment', async () => {
      const payment = await recordPayment(cashier.accessToken);
      const response = await authed(testApp, extras.secondProviderAccessToken)
        .post(disputeUrl(payment.id))
        .send({ reason: 'Not mine' });
      expect(response.status).toBe(403);
    });

    it('a confirmed (terminal) payment cannot be disputed', async () => {
      const payment = await recordPayment(cashier.accessToken);
      await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({}).expect(201);
      const response = await authed(testApp, fixture.providerAccessToken).post(disputeUrl(payment.id)).send({ reason: 'Too late' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PAYMENT_STATE_INVALID');
    });
  });

  describe('provider-scoped pending verifications', () => {
    function pendingUrl(): string {
      return `/v1/organizations/${fixture.organizationId}/payment-verifications/pending`;
    }

    it('returns only the authenticated provider\'s own pending records, never every branch payment', async () => {
      const payment = await recordPayment(cashier.accessToken);

      const own = await authed(testApp, fixture.providerAccessToken).get(pendingUrl()).expect(200);
      expect(own.body.data.map((p: { id: string }) => p.id)).toEqual([payment.id]);

      const other = await authed(testApp, extras.secondProviderAccessToken).get(pendingUrl()).expect(200);
      expect(other.body.data).toEqual([]);
    });

    it('a confirmed payment no longer appears as pending', async () => {
      const payment = await recordPayment(cashier.accessToken);
      await authed(testApp, fixture.providerAccessToken).post(confirmUrl(payment.id)).send({}).expect(201);
      const pending = await authed(testApp, fixture.providerAccessToken).get(pendingUrl()).expect(200);
      expect(pending.body.data).toEqual([]);
    });

    it('a membership without payments.verify_own cannot reach the pending-verifications endpoint', async () => {
      const response = await authed(testApp, cashier.accessToken).get(pendingUrl());
      expect(response.status).toBe(403);
    });

    it('the unfiltered verifications endpoint lists every status for the provider\'s own payments, and a status filter narrows it', async () => {
      const half = Math.floor(checkoutTotalMinor / 2);
      const confirmed = await recordPayment(cashier.accessToken, half);
      await authed(testApp, fixture.providerAccessToken).post(confirmUrl(confirmed.id)).send({}).expect(201);
      const recorded = await recordPayment(cashier.accessToken, checkoutTotalMinor - half);

      const mineUrl = `/v1/organizations/${fixture.organizationId}/payment-verifications`;
      const all = await authed(testApp, fixture.providerAccessToken).get(mineUrl).expect(200);
      const ids = all.body.data.map((p: { id: string }) => p.id);
      expect(ids).toEqual(expect.arrayContaining([recorded.id, confirmed.id]));

      const onlyConfirmed = await authed(testApp, fixture.providerAccessToken).get(mineUrl).query({ status: 'CONFIRMED' }).expect(200);
      expect(onlyConfirmed.body.data.map((p: { id: string }) => p.id)).toEqual([confirmed.id]);

      const other = await authed(testApp, extras.secondProviderAccessToken).get(mineUrl).expect(200);
      expect(other.body.data).toEqual([]);
    });
  });

  describe('dispute resolution', () => {
    function disputesUrl(suffix = ''): string {
      return `/v1/organizations/${fixture.organizationId}/payment-disputes${suffix}`;
    }

    async function openDispute() {
      const payment = await recordPayment(cashier.accessToken);
      await authed(testApp, fixture.providerAccessToken).post(disputeUrl(payment.id)).send({ reason: 'Missing' }).expect(201);
      const dispute = await testApp.prisma.paymentDispute.findUniqueOrThrow({ where: { paymentRecordId: payment.id } });
      return { paymentId: payment.id, disputeId: dispute.id };
    }

    it('rejects an unauthenticated request', async () => {
      const { disputeId } = await openDispute();
      await request(testApp.app.getHttpServer()).post(disputesUrl(`/${disputeId}/resolve`)).send({}).expect(401);
    });

    it('a manager can resolve by confirming the payment', async () => {
      const manager = await createManagerActor(testApp, fixture);
      const { paymentId, disputeId } = await openDispute();

      const response = await authed(testApp, manager.accessToken)
        .post(disputesUrl(`/${disputeId}/resolve`))
        .send({ resolution: 'CONFIRM_PAYMENT', resolutionNote: 'Verified against till slip' })
        .expect(201);
      expect(response.body.data.status).toBe('RESOLVED_CONFIRMED');
      // A resolution screen has no other way to look up the underlying
      // payment claim (no standalone get-payment-by-id route exists),
      // so the dispute response embeds a safe payment summary directly.
      expect(response.body.data.payment).toMatchObject({ id: paymentId, status: 'CONFIRMED' });

      const payment = await testApp.prisma.paymentRecord.findUniqueOrThrow({ where: { id: paymentId } });
      expect(payment.status).toBe('CONFIRMED');

      const events = await testApp.prisma.paymentVerificationEvent.findMany({ where: { paymentRecordId: paymentId } });
      expect(events.map((event) => event.action)).toContain('RESOLVED_CONFIRMED');
    });

    it('a manager can resolve by rejecting the payment, which returns the checkout to the correct derived state', async () => {
      const manager = await createManagerActor(testApp, fixture);
      const { paymentId, disputeId } = await openDispute();

      const response = await authed(testApp, manager.accessToken)
        .post(disputesUrl(`/${disputeId}/resolve`))
        .send({ resolution: 'REJECT_PAYMENT', resolutionNote: 'Confirmed never received' })
        .expect(201);
      expect(response.body.data.status).toBe('RESOLVED_REJECTED');

      const payment = await testApp.prisma.paymentRecord.findUniqueOrThrow({ where: { id: paymentId } });
      expect(payment.status).toBe('VOIDED');

      const checkoutAfter = await authed(testApp, manager.accessToken)
        .get(`/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}`)
        .expect(200);
      expect(checkoutAfter.body.data.status).toBe('OPEN');

      const transactionCount = await testApp.prisma.transaction.count({ where: { checkoutId } });
      expect(transactionCount).toBe(0);
    });

    it('a rejected payment can be safely replaced by a new one', async () => {
      const manager = await createManagerActor(testApp, fixture);
      const { disputeId } = await openDispute();
      await authed(testApp, manager.accessToken)
        .post(disputesUrl(`/${disputeId}/resolve`))
        .send({ resolution: 'REJECT_PAYMENT' })
        .expect(201);

      const replacement = await recordPayment(cashier.accessToken);
      expect(replacement.id).toBeDefined();
      const confirmed = await authed(testApp, fixture.providerAccessToken).post(confirmUrl(replacement.id)).send({}).expect(201);
      expect(confirmed.body.data.status).toBe('CONFIRMED');
    });

    it('resolving an already-resolved dispute fails cleanly', async () => {
      const manager = await createManagerActor(testApp, fixture);
      const { disputeId } = await openDispute();
      await authed(testApp, manager.accessToken)
        .post(disputesUrl(`/${disputeId}/resolve`))
        .send({ resolution: 'CONFIRM_PAYMENT' })
        .expect(201);

      const response = await authed(testApp, manager.accessToken)
        .post(disputesUrl(`/${disputeId}/resolve`))
        .send({ resolution: 'CONFIRM_PAYMENT' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PAYMENT_DISPUTE_ALREADY_RESOLVED');
    });

    it('a cashier without payments.resolve cannot resolve a dispute', async () => {
      const { disputeId } = await openDispute();
      const response = await authed(testApp, cashier.accessToken)
        .post(disputesUrl(`/${disputeId}/resolve`))
        .send({ resolution: 'CONFIRM_PAYMENT' });
      expect(response.status).toBe(403);
    });

    it('a manager can list and read disputes, each with its embedded safe payment summary', async () => {
      const manager = await createManagerActor(testApp, fixture);
      const { paymentId, disputeId } = await openDispute();

      const list = await authed(testApp, manager.accessToken).get(disputesUrl()).expect(200);
      expect(list.body.data.map((d: { id: string }) => d.id)).toContain(disputeId);
      const listedEntry = list.body.data.find((d: { id: string }) => d.id === disputeId);
      expect(listedEntry.payment).toMatchObject({ id: paymentId, status: 'DISPUTED' });

      const get = await authed(testApp, manager.accessToken).get(disputesUrl(`/${disputeId}`)).expect(200);
      expect(get.body.data.id).toBe(disputeId);
      expect(get.body.data.payment).toMatchObject({ id: paymentId, status: 'DISPUTED' });
    });
  });
});
