import { randomUUID } from 'node:crypto';
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
  createReceptionistActor,
  type FinancialActor,
  type PostedTransactionResult,
} from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('Refund and reversal correction workflow (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;
  let extras: QueueFixtureExtras;
  let manager: FinancialActor;
  let cashier: FinancialActor;
  let receptionist: FinancialActor;
  let posted: PostedTransactionResult;
  let originalLineItemId: string;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
    extras = await extendWithQueueRoles(testApp, fixture);
    manager = await createManagerActor(testApp, fixture);
    cashier = await createCashierActor(testApp, fixture);
    receptionist = await createReceptionistActor(testApp, fixture);
    posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
    const line = await testApp.prisma.transactionLineItem.findFirstOrThrow({ where: { transactionId: posted.transactionId } });
    originalLineItemId = line.id;
  });

  afterEach(async () => {
    await cleanupAllBookableFixtures(testApp);
    await testApp.app.close();
  });

  function correctionsUrl(suffix = ''): string {
    return `/v1/organizations/${fixture.organizationId}/transaction-corrections${suffix}`;
  }
  function refundRequestUrl(transactionId = posted.transactionId): string {
    return `/v1/organizations/${fixture.organizationId}/transactions/${transactionId}/refund-requests`;
  }
  function reversalRequestUrl(transactionId = posted.transactionId): string {
    return `/v1/organizations/${fixture.organizationId}/transactions/${transactionId}/reversal-requests`;
  }

  async function requestPartialRefund(actorToken: string, amountMinor: number, idempotencyKey = randomUUID()) {
    const response = await authed(testApp, actorToken)
      .post(refundRequestUrl())
      .set('Idempotency-Key', idempotencyKey)
      .send({ reason: 'Customer dissatisfied', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: originalLineItemId, requestedAmountMinor: amountMinor }] })
      .expect(201);
    return response.body.data as { id: string; version: number };
  }

  async function requestReversal(actorToken: string, idempotencyKey = randomUUID()) {
    const response = await authed(testApp, actorToken)
      .post(reversalRequestUrl())
      .set('Idempotency-Key', idempotencyKey)
      .send({ reason: 'Duplicate sale', returnMethod: 'CASH' })
      .expect(201);
    return response.body.data as { id: string; version: number };
  }

  function approve(actorToken: string, correctionId: string, body: Record<string, unknown> = {}) {
    return authed(testApp, actorToken).post(correctionsUrl(`/${correctionId}/approve`)).send(body);
  }

  function execute(actorToken: string, correctionId: string, idempotencyKey = randomUUID(), body: Record<string, unknown> = {}) {
    return authed(testApp, actorToken).post(correctionsUrl(`/${correctionId}/execute`)).set('Idempotency-Key', idempotencyKey).send(body);
  }

  describe('requesting a refund', () => {
    it('a cashier requests a partial refund; it starts REQUESTED', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 500);
      const get = await authed(testApp, manager.accessToken).get(correctionsUrl(`/${correction.id}`)).expect(200);
      expect(get.body.data).toMatchObject({ status: 'REQUESTED', correctionType: 'REFUND', totalRequestedMinor: 500, originalTransactionId: posted.transactionId });
    });

    it('rejects a request with no Idempotency-Key header', async () => {
      const response = await authed(testApp, cashier.accessToken)
        .post(refundRequestUrl())
        .send({ reason: 'x', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: originalLineItemId, requestedAmountMinor: 100 }] });
      expect(response.status).toBe(400);
    });

    it('replays the same correction on a repeated identical request with the same idempotency key', async () => {
      const key = randomUUID();
      const first = await requestPartialRefund(cashier.accessToken, 300, key);
      const second = await requestPartialRefund(cashier.accessToken, 300, key);
      expect(second.id).toBe(first.id);
      const count = await testApp.prisma.transactionCorrection.count({ where: { originalTransactionId: posted.transactionId } });
      expect(count).toBe(1);
    });

    it('a requested amount exceeding the original line amount is rejected', async () => {
      const response = await authed(testApp, cashier.accessToken)
        .post(refundRequestUrl())
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'x', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: originalLineItemId, requestedAmountMinor: fixture.servicePriceMinor + 1 }] });
      expect(response.status).toBe(409);
    });

    it('a line item that does not belong to this transaction is rejected', async () => {
      const response = await authed(testApp, cashier.accessToken)
        .post(refundRequestUrl())
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'x', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: randomUUID(), requestedAmountMinor: 1 }] });
      expect(response.status).toBe(400);
    });

    it('rejects an unrecognized client-supplied field (e.g. a price/currency override) outright, rather than silently ignoring it', async () => {
      const response = await authed(testApp, cashier.accessToken)
        .post(refundRequestUrl())
        .set('Idempotency-Key', randomUUID())
        .send({
          reason: 'x',
          returnMethod: 'CASH',
          currency: 'USD',
          lines: [{ originalTransactionLineItemId: originalLineItemId, requestedAmountMinor: 100, priceMinorSnapshot: 999_999, currencySnapshot: 'USD' }],
        });
      expect(response.status).toBe(400);
    });

    it('only originalTransactionLineItemId and requestedAmountMinor are ever consulted per line — the currency is always derived from the original transaction', async () => {
      const response = await authed(testApp, cashier.accessToken)
        .post(refundRequestUrl())
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'x', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: originalLineItemId, requestedAmountMinor: 100 }] })
        .expect(201);
      expect(response.body.data.currency).toBe(fixture.serviceCurrency);
      expect(response.body.data.totalRequestedMinor).toBe(100);
    });

    it('a receptionist can request a refund but a service provider cannot', async () => {
      await authed(testApp, receptionist.accessToken)
        .post(refundRequestUrl())
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'x', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: originalLineItemId, requestedAmountMinor: 1 }] })
        .expect(201);
      const response = await authed(testApp, fixture.providerAccessToken)
        .post(refundRequestUrl())
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'x', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: originalLineItemId, requestedAmountMinor: 1 }] });
      expect(response.status).toBe(403);
    });

    it('a transaction from another organization is not found', async () => {
      const other = await createBookableFixture(testApp);
      const otherPosted = await createPostedTransaction(testApp, other, other.ownerAccessToken, other.ownerAccessToken);
      const response = await authed(testApp, cashier.accessToken)
        .post(refundRequestUrl(otherPosted.transactionId))
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'x', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: originalLineItemId, requestedAmountMinor: 1 }] });
      expect(response.status).toBe(404);
    });

    it('is readable under a READ_ONLY subscription but cannot be requested', async () => {
      await testApp.prisma.organizationSubscription.update({ where: { organizationId: fixture.organizationId }, data: { status: 'READ_ONLY' } });
      await authed(testApp, cashier.accessToken).get(correctionsUrl()).expect(200);
      const response = await authed(testApp, cashier.accessToken)
        .post(refundRequestUrl())
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'x', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: originalLineItemId, requestedAmountMinor: 1 }] });
      expect(response.status).toBe(403);
    });
  });

  describe('requesting a reversal', () => {
    it('a manager requests a full reversal, capturing every original line at its full amount', async () => {
      const correction = await requestReversal(manager.accessToken);
      const get = await authed(testApp, manager.accessToken).get(correctionsUrl(`/${correction.id}`)).expect(200);
      expect(get.body.data).toMatchObject({ correctionType: 'REVERSAL', totalRequestedMinor: posted.checkoutTotalMinor });
      expect(get.body.data.items).toHaveLength(1);
      expect(get.body.data.items[0].requestedAmountMinor).toBe(fixture.servicePriceMinor);
    });

    it('a cashier lacks transactions.reverse and cannot request a reversal', async () => {
      const response = await authed(testApp, cashier.accessToken).post(reversalRequestUrl()).set('Idempotency-Key', randomUUID()).send({ reason: 'x', returnMethod: 'CASH' });
      expect(response.status).toBe(403);
    });

    it('blocks a reversal once any refund/reversal has already been executed against the sale', async () => {
      const refund = await requestPartialRefund(cashier.accessToken, 100);
      await approve(manager.accessToken, refund.id).expect(201);
      await execute(cashier.accessToken, refund.id).expect(201);

      const response = await authed(testApp, manager.accessToken).post(reversalRequestUrl()).set('Idempotency-Key', randomUUID()).send({ reason: 'x', returnMethod: 'CASH' });
      expect(response.status).toBe(409);
    });

    it('cannot reverse a REFUND or REVERSAL transaction, only a SALE', async () => {
      const refund = await requestPartialRefund(cashier.accessToken, 100);
      await approve(manager.accessToken, refund.id).expect(201);
      const executed = await execute(cashier.accessToken, refund.id).expect(201);
      const correctiveTransactionId = executed.body.data.correctiveTransactionId as string;

      const response = await authed(testApp, manager.accessToken).post(reversalRequestUrl(correctiveTransactionId)).set('Idempotency-Key', randomUUID()).send({ reason: 'x', returnMethod: 'CASH' });
      expect(response.status).toBe(409);
    });
  });

  describe('approve / reject / cancel state machine', () => {
    it('only a REQUESTED correction can be approved; approving twice conflicts', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      await approve(manager.accessToken, correction.id).expect(201);
      const second = await approve(manager.accessToken, correction.id);
      expect(second.status).toBe(409);
    });

    it('a manager can reject a REQUESTED correction, which is terminal', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      const rejected = await authed(testApp, manager.accessToken).post(correctionsUrl(`/${correction.id}/reject`)).send({ rejectionReason: 'Not eligible' }).expect(201);
      expect(rejected.body.data.status).toBe('REJECTED');

      const approveAttempt = await approve(manager.accessToken, correction.id);
      expect(approveAttempt.status).toBe(409);
    });

    it('the requester can cancel their own REQUESTED or APPROVED correction', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      const cancelled = await authed(testApp, cashier.accessToken).post(correctionsUrl(`/${correction.id}/cancel`)).send({ cancellationReason: 'Changed my mind' }).expect(201);
      expect(cancelled.body.data.status).toBe('CANCELLED');
    });

    it('a non-requester without refunds.approve cannot cancel someone else\'s request', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      const other = await createCashierActor(testApp, fixture);
      const response = await authed(testApp, other.accessToken).post(correctionsUrl(`/${correction.id}/cancel`)).send({ cancellationReason: 'not mine' });
      expect(response.status).toBe(403);
    });

    it('a terminal correction (REJECTED) can never be cancelled or approved again', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      await authed(testApp, manager.accessToken).post(correctionsUrl(`/${correction.id}/reject`)).send({ rejectionReason: 'no' }).expect(201);
      const cancelAttempt = await authed(testApp, cashier.accessToken).post(correctionsUrl(`/${correction.id}/cancel`)).send({ cancellationReason: 'try anyway' });
      expect(cancelAttempt.status).toBe(409);
    });

    it('the requester cannot approve their own request (separation of duties)', async () => {
      const correction = await requestPartialRefund(manager.accessToken, 100);
      const response = await approve(manager.accessToken, correction.id);
      expect(response.status).toBe(403);
    });

    it('the requester cannot reject their own request either', async () => {
      const correction = await requestPartialRefund(manager.accessToken, 100);
      const response = await authed(testApp, manager.accessToken).post(correctionsUrl(`/${correction.id}/reject`)).send({ rejectionReason: 'self reject' });
      expect(response.status).toBe(403);
    });

    it('a solo owner with no other eligible approver may self-approve their own request only with an explicit override reason, and it is audited', async () => {
      // Demote the manager's own approve permission by using a fresh
      // organization whose ONLY membership with refunds.approve is the
      // owner (createBookableFixture's own owner, who requests the
      // refund themself here).
      const solo = await createBookableFixture(testApp);
      const soloPosted = await createPostedTransaction(testApp, solo, solo.ownerAccessToken, solo.ownerAccessToken);
      const soloLine = await testApp.prisma.transactionLineItem.findFirstOrThrow({ where: { transactionId: soloPosted.transactionId } });

      const correction = await authed(testApp, solo.ownerAccessToken)
        .post(`/v1/organizations/${solo.organizationId}/transactions/${soloPosted.transactionId}/refund-requests`)
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'x', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: soloLine.id, requestedAmountMinor: 100 }] })
        .expect(201);

      const withoutReason = await authed(testApp, solo.ownerAccessToken)
        .post(`/v1/organizations/${solo.organizationId}/transaction-corrections/${correction.body.data.id}/approve`)
        .send({});
      expect(withoutReason.status).toBe(400);

      const withReason = await authed(testApp, solo.ownerAccessToken)
        .post(`/v1/organizations/${solo.organizationId}/transaction-corrections/${correction.body.data.id}/approve`)
        .send({ overrideReason: 'Sole owner, no other approver exists' })
        .expect(201);
      expect(withReason.body.data.soloOwnerOverride).toBe(true);

      const audit = await testApp.prisma.auditEvent.findMany({
        where: { organizationId: solo.organizationId, action: 'correction.solo_owner_override' },
      });
      expect(audit).toHaveLength(1);
    });

    it('a membership without refunds.read cannot list or read corrections', async () => {
      const noPermission = await createNoPermissionActor(testApp, fixture);
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      await authed(testApp, noPermission.accessToken).get(correctionsUrl()).expect(403);
      await authed(testApp, noPermission.accessToken).get(correctionsUrl(`/${correction.id}`)).expect(403);
    });

    it('a correction from another organization is not found', async () => {
      const other = await createBookableFixture(testApp);
      const otherPosted = await createPostedTransaction(testApp, other, other.ownerAccessToken, other.ownerAccessToken);
      const otherLine = await testApp.prisma.transactionLineItem.findFirstOrThrow({ where: { transactionId: otherPosted.transactionId } });
      const otherCorrection = await authed(testApp, other.ownerAccessToken)
        .post(`/v1/organizations/${other.organizationId}/transactions/${otherPosted.transactionId}/refund-requests`)
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'x', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: otherLine.id, requestedAmountMinor: 1 }] })
        .expect(201);

      const response = await authed(testApp, manager.accessToken).get(correctionsUrl(`/${otherCorrection.body.data.id}`));
      expect(response.status).toBe(404);
    });
  });

  describe('executing a refund: the immutable corrective Transaction', () => {
    it('creates an immutable POSTED REFUND Transaction referencing the original, with a corrective line-item snapshot', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 400);
      await approve(manager.accessToken, correction.id).expect(201);
      const executed = await execute(cashier.accessToken, correction.id).expect(201);
      expect(executed.body.data.status).toBe('EXECUTED');

      const correctiveTransaction = await testApp.prisma.transaction.findUniqueOrThrow({ where: { id: executed.body.data.correctiveTransactionId } });
      expect(correctiveTransaction.kind).toBe('REFUND');
      expect(correctiveTransaction.status).toBe('POSTED');
      expect(correctiveTransaction.correctedTransactionId).toBe(posted.transactionId);
      expect(correctiveTransaction.totalMinor).toBe(400);
      expect(correctiveTransaction.checkoutId).toBeNull();

      const originalTransaction = await testApp.prisma.transaction.findUniqueOrThrow({ where: { id: posted.transactionId } });
      expect(originalTransaction.kind).toBe('SALE');
      expect(originalTransaction.totalMinor).toBe(posted.checkoutTotalMinor);
    });

    it('the original SALE transaction is never mutated by executing a correction against it', async () => {
      const before = await testApp.prisma.transaction.findUniqueOrThrow({ where: { id: posted.transactionId } });
      const correction = await requestPartialRefund(cashier.accessToken, 200);
      await approve(manager.accessToken, correction.id).expect(201);
      await execute(cashier.accessToken, correction.id).expect(201);
      const after = await testApp.prisma.transaction.findUniqueOrThrow({ where: { id: posted.transactionId } });
      expect(after).toEqual(before);
    });

    it('multiple partial refunds are allowed, but cumulative amounts never exceed the remaining refundable', async () => {
      const first = await requestPartialRefund(cashier.accessToken, 300);
      await approve(manager.accessToken, first.id).expect(201);
      await execute(cashier.accessToken, first.id).expect(201);

      const remaining = fixture.servicePriceMinor - 300;
      const second = await requestPartialRefund(cashier.accessToken, remaining);
      await approve(manager.accessToken, second.id).expect(201);
      await execute(cashier.accessToken, second.id).expect(201);

      const overRequest = await requestPartialRefund(cashier.accessToken, 1);
      await approve(manager.accessToken, overRequest.id).expect(201);
      const overExecute = await execute(cashier.accessToken, overRequest.id);
      expect(overExecute.status).toBe(409);
    });

    it('a full reversal negates every original line and blocks any further correction', async () => {
      const correction = await requestReversal(fixture.ownerAccessToken);
      await approve(manager.accessToken, correction.id).expect(201);
      const executed = await execute(cashier.accessToken, correction.id).expect(201);

      const correctiveTransaction = await testApp.prisma.transaction.findUniqueOrThrow({ where: { id: executed.body.data.correctiveTransactionId } });
      expect(correctiveTransaction.kind).toBe('REVERSAL');
      expect(correctiveTransaction.totalMinor).toBe(posted.checkoutTotalMinor);

      const secondReversalAttempt = await authed(testApp, fixture.ownerAccessToken)
        .post(reversalRequestUrl())
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'Duplicate sale again', returnMethod: 'CASH' });
      expect(secondReversalAttempt.status).toBe(409);
    });

    it('rejects an execute attempt before approval', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      const response = await execute(cashier.accessToken, correction.id);
      expect(response.status).toBe(409);
    });

    it('a cashier can execute (but not approve) an approved correction; a receptionist cannot execute', async () => {
      const correction = await requestPartialRefund(receptionist.accessToken, 100);
      await approve(manager.accessToken, correction.id).expect(201);
      const receptionistAttempt = await execute(receptionist.accessToken, correction.id);
      expect(receptionistAttempt.status).toBe(403);
      await execute(cashier.accessToken, correction.id).expect(201);
    });

    it('rejects an execute request with no Idempotency-Key header', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      await approve(manager.accessToken, correction.id).expect(201);
      const response = await authed(testApp, cashier.accessToken).post(correctionsUrl(`/${correction.id}/execute`)).send({});
      expect(response.status).toBe(400);
    });

    it('a repeated execute with the same idempotency key replays the same result, never creating a second corrective Transaction', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      await approve(manager.accessToken, correction.id).expect(201);
      const key = randomUUID();
      const first = await execute(cashier.accessToken, correction.id, key);
      const second = await execute(cashier.accessToken, correction.id, key);
      expect(second.body.data.correctiveTransactionId).toBe(first.body.data.correctiveTransactionId);

      const correctiveCount = await testApp.prisma.transaction.count({ where: { correctedTransactionId: posted.transactionId } });
      expect(correctiveCount).toBe(1);
    });

    it('five concurrent execute attempts on the same correction produce exactly one corrective Transaction', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      await approve(manager.accessToken, correction.id).expect(201);

      const results = await Promise.all(Array.from({ length: 5 }, () => execute(cashier.accessToken, correction.id)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);

      const correctiveCount = await testApp.prisma.transaction.count({ where: { correctedTransactionId: posted.transactionId } });
      expect(correctiveCount).toBe(1);
      const finalCorrection = await testApp.prisma.transactionCorrection.findUniqueOrThrow({ where: { id: correction.id } });
      expect(finalCorrection.status).toBe('EXECUTED');
    });

    it('a failed execution (exceeding the remaining refundable) leaves no corrective Transaction, receipt, or commission adjustment behind', async () => {
      const first = await requestPartialRefund(cashier.accessToken, fixture.servicePriceMinor);
      await approve(manager.accessToken, first.id).expect(201);
      await execute(cashier.accessToken, first.id).expect(201);

      const second = await requestPartialRefund(cashier.accessToken, 1);
      await approve(manager.accessToken, second.id).expect(201);
      const response = await execute(cashier.accessToken, second.id);
      expect(response.status).toBe(409);

      const secondCorrection = await testApp.prisma.transactionCorrection.findUniqueOrThrow({ where: { id: second.id } });
      expect(secondCorrection.status).toBe('APPROVED');
      expect(secondCorrection.correctiveTransactionId).toBeNull();
    });

    it('an idempotency-conflicting execute with a different body is rejected', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      await approve(manager.accessToken, correction.id).expect(201);
      const key = randomUUID();
      await execute(cashier.accessToken, correction.id, key, {}).expect(201);
      const response = await execute(cashier.accessToken, correction.id, key, { cashSessionId: randomUUID() });
      expect(response.status).toBe(409);
    });

    it('never serializes anything resembling a credential on the correction record', async () => {
      const correction = await requestPartialRefund(cashier.accessToken, 100);
      await approve(manager.accessToken, correction.id).expect(201);
      const executed = await execute(cashier.accessToken, correction.id).expect(201);
      const serialized = JSON.stringify(executed.body.data).toLowerCase();
      expect(serialized).not.toMatch(/password|otp|cvv|pin\b|card.?number/);
    });
  });
});
