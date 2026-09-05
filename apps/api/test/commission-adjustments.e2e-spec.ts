import { randomUUID } from 'node:crypto';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import {
  createCashierActor,
  createManagerActor,
  createPostedTransaction,
  type FinancialActor,
  type PostedTransactionResult,
} from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('Commission adjustments on refund/reversal (e2e)', () => {
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
  function refundRequestUrl(transactionId: string): string {
    return `/v1/organizations/${fixture.organizationId}/transactions/${transactionId}/refund-requests`;
  }
  function reversalRequestUrl(transactionId: string): string {
    return `/v1/organizations/${fixture.organizationId}/transactions/${transactionId}/reversal-requests`;
  }
  function correctionsUrl(suffix = ''): string {
    return `/v1/organizations/${fixture.organizationId}/transaction-corrections${suffix}`;
  }

  async function postSale(): Promise<{ posted: PostedTransactionResult; lineItemId: string }> {
    const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
    const line = await testApp.prisma.transactionLineItem.findFirstOrThrow({ where: { transactionId: posted.transactionId } });
    return { posted, lineItemId: line.id };
  }

  async function refundAndExecute(transactionId: string, lineItemId: string, amountMinor: number): Promise<string> {
    const requested = await authed(testApp, cashier.accessToken)
      .post(refundRequestUrl(transactionId))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'commission adjustment test', returnMethod: 'CASH', lines: [{ originalTransactionLineItemId: lineItemId, requestedAmountMinor: amountMinor }] })
      .expect(201);
    await authed(testApp, manager.accessToken).post(correctionsUrl(`/${requested.body.data.id}/approve`)).send({}).expect(201);
    const executed = await authed(testApp, cashier.accessToken)
      .post(correctionsUrl(`/${requested.body.data.id}/execute`))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    return executed.body.data.correctiveTransactionId as string;
  }

  async function reverseAndExecute(transactionId: string): Promise<string> {
    const requested = await authed(testApp, fixture.ownerAccessToken)
      .post(reversalRequestUrl(transactionId))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'commission reversal test', returnMethod: 'CASH' })
      .expect(201);
    await authed(testApp, manager.accessToken).post(correctionsUrl(`/${requested.body.data.id}/approve`)).send({}).expect(201);
    const executed = await authed(testApp, cashier.accessToken)
      .post(correctionsUrl(`/${requested.body.data.id}/execute`))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    return executed.body.data.correctiveTransactionId as string;
  }

  describe('PERCENTAGE rule', () => {
    it('a full refund reverses exactly the full original accrual', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 5000 }).expect(201);
      const { posted, lineItemId } = await postSale();
      const originalAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });

      const correctiveTransactionId = await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor);
      const refundedAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: correctiveTransactionId } });

      expect(refundedAccrual.kind).toBe('REFUNDED');
      expect(refundedAccrual.originalAccrualId).toBe(originalAccrual.id);
      expect(refundedAccrual.staffProfileId).toBe(originalAccrual.staffProfileId);
      expect(refundedAccrual.calculatedAmountMinor).toBe(originalAccrual.calculatedAmountMinor);
      expect(refundedAccrual.currency).toBe(originalAccrual.currency);
    });

    it('a half-line partial refund reverses exactly half the original accrual', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 5000 }).expect(201);
      const { posted, lineItemId } = await postSale();
      const originalAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });

      const correctiveTransactionId = await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor / 2);
      const refundedAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: correctiveTransactionId } });
      expect(refundedAccrual.calculatedAmountMinor).toBe(originalAccrual.calculatedAmountMinor / 2);
    });

    it('never resolves a correction using the current CommissionRule — only the original snapshot, even after the rule changes', async () => {
      const rule = await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 1000 }).expect(201);
      const { posted, lineItemId } = await postSale();
      const originalAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });

      // Supersede with a drastically different rate after posting, before the refund is ever executed.
      await authed(testApp, manager.accessToken).post(`${rulesUrl()}/${rule.body.data.id}/supersede`).send({ type: 'PERCENTAGE', rateBasisPoints: 9000 }).expect(201);

      const correctiveTransactionId = await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor);
      const refundedAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: correctiveTransactionId } });
      // Reverses the ORIGINAL 10%-rate accrual exactly, never the new 90% rate.
      expect(refundedAccrual.calculatedAmountMinor).toBe(originalAccrual.calculatedAmountMinor);
      expect(refundedAccrual.rateBasisPointsSnapshot).toBe(1000);
    });

    it('the original EARNED accrual is never mutated by a correction', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 5000 }).expect(201);
      const { posted, lineItemId } = await postSale();
      const before = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });

      await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor);

      const after = await testApp.prisma.commissionAccrual.findUniqueOrThrow({ where: { id: before.id } });
      expect(after).toEqual(before);
    });

    it('a full reversal reverses the full original accrual, with kind REVERSED', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 2500 }).expect(201);
      const { posted } = await postSale();
      const originalAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });

      const correctiveTransactionId = await reverseAndExecute(posted.transactionId);
      const reversedAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: correctiveTransactionId } });
      expect(reversedAccrual.kind).toBe('REVERSED');
      expect(reversedAccrual.calculatedAmountMinor).toBe(originalAccrual.calculatedAmountMinor);
    });
  });

  describe('FIXED rule', () => {
    it('a full refund reverses the entire fixed accrual', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'FIXED', fixedAmountMinor: 777, fixedCurrency: fixture.serviceCurrency }).expect(201);
      const { posted, lineItemId } = await postSale();

      const correctiveTransactionId = await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor);
      const refundedAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: correctiveTransactionId } });
      expect(refundedAccrual.calculatedAmountMinor).toBe(777);
    });

    it('prorates a partial refund by refunded/original basis', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'FIXED', fixedAmountMinor: 777, fixedCurrency: fixture.serviceCurrency }).expect(201);
      const { posted, lineItemId } = await postSale();

      const correctiveTransactionId = await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor / 2);
      const refundedAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: correctiveTransactionId } });
      // round(777 * 2500 / 5000) = round(388.5) = 389 (half-up).
      expect(refundedAccrual.calculatedAmountMinor).toBe(389);
    });

    it('cumulative adjustments across two partial refunds never exceed the original fixed accrual', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'FIXED', fixedAmountMinor: 777, fixedCurrency: fixture.serviceCurrency }).expect(201);
      const { posted, lineItemId } = await postSale();

      const firstCorrective = await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor / 2);
      const firstAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: firstCorrective } });
      expect(firstAccrual.calculatedAmountMinor).toBe(389);

      const secondCorrective = await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor / 2);
      const secondAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: secondCorrective } });
      expect(secondAccrual.calculatedAmountMinor).toBe(388);

      expect(firstAccrual.calculatedAmountMinor + secondAccrual.calculatedAmountMinor).toBe(777);
    });
  });

  describe('NONE and NO_POLICY rules', () => {
    it('a NONE-type rule produces an explicit zero-value REFUNDED accrual, not a skipped row', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'NONE' }).expect(201);
      const { posted, lineItemId } = await postSale();

      const correctiveTransactionId = await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor);
      const refundedAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: correctiveTransactionId } });
      expect(refundedAccrual.calculatedAmountMinor).toBe(0);
      expect(refundedAccrual.kind).toBe('REFUNDED');
    });

    it('no matching rule (NO_POLICY) produces an explicit zero-value REFUNDED accrual', async () => {
      const { posted, lineItemId } = await postSale();

      const correctiveTransactionId = await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor);
      const refundedAccrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: correctiveTransactionId } });
      expect(refundedAccrual.calculatedAmountMinor).toBe(0);
      expect(refundedAccrual.source).toBe('NO_POLICY');
    });
  });

  describe('staff earnings isolation', () => {
    it('the assigned provider sees both EARNED and REFUNDED rows in their own earnings; another provider sees neither', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 1000 }).expect(201);
      const { posted, lineItemId } = await postSale();
      await refundAndExecute(posted.transactionId, lineItemId, fixture.servicePriceMinor);

      const own = await authed(testApp, fixture.providerAccessToken).get(`/v1/organizations/${fixture.organizationId}/me/earnings`).expect(200);
      const kinds = own.body.data.map((row: { kind: string }) => row.kind).sort();
      expect(kinds).toEqual(['EARNED', 'REFUNDED']);

      const other = await authed(testApp, extras.secondProviderAccessToken).get(`/v1/organizations/${fixture.organizationId}/me/earnings`).expect(200);
      expect(other.body.data).toEqual([]);
    });
  });
});
