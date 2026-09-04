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
import { authed, createTestApp, signInWithEmailOtp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('Receipts (e2e)', () => {
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

  function receiptsUrl(suffix = ''): string {
    return `/v1/organizations/${fixture.organizationId}/receipts${suffix}`;
  }

  describe('issuance', () => {
    it('a receipt is issued automatically the moment the Transaction posts', async () => {
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const receipt = await testApp.prisma.receipt.findUniqueOrThrow({ where: { transactionId: posted.transactionId } });
      expect(receipt.totalMinorSnapshot).toBe(posted.checkoutTotalMinor);
    });

    it('exactly one receipt exists per transaction (database-enforced)', async () => {
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const receipts = await testApp.prisma.receipt.findMany({ where: { transactionId: posted.transactionId } });
      expect(receipts).toHaveLength(1);
    });

    it('the receipt number is branch-code/year/sequence formatted and its snapshots are immutable and correct', async () => {
      const branch = await testApp.prisma.branch.findUniqueOrThrow({ where: { id: fixture.branchId } });
      const organization = await testApp.prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });

      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      await testApp.prisma.service.update({ where: { id: fixture.serviceId }, data: { priceMinor: 1 } }); // mutate the catalogue after posting
      const response = await authed(testApp, manager.accessToken).get(receiptsUrl(`/${(await testApp.prisma.receipt.findUniqueOrThrow({ where: { transactionId: posted.transactionId } })).id}`)).expect(200);

      expect(response.body.data.receiptNumber).toMatch(new RegExp(`^${branch.code}-\\d{4}-\\d{5}$`));
      expect(response.body.data.businessName).toBe(organization.name);
      expect(response.body.data.branchName).toBe(branch.name);
      expect(response.body.data.currency).toBe(fixture.serviceCurrency);
      expect(response.body.data.totalMinor).toBe(posted.checkoutTotalMinor);
      expect(response.body.data.lineItems).toHaveLength(1);
      expect(response.body.data.lineItems[0].unitPriceMinor).toBe(fixture.servicePriceMinor); // unaffected by the later catalogue price mutation
      expect(response.body.data.paymentSummaries).toHaveLength(1);
      expect(response.body.data.paymentSummaries[0]).toMatchObject({ method: 'CASH', amountMinor: posted.checkoutTotalMinor });
    });

    it('never serializes anything resembling a credential', async () => {
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const receipt = await testApp.prisma.receipt.findUniqueOrThrow({ where: { transactionId: posted.transactionId } });
      const response = await authed(testApp, manager.accessToken).get(receiptsUrl(`/${receipt.id}`)).expect(200);
      const serialized = JSON.stringify(response.body.data).toLowerCase();
      expect(serialized).not.toMatch(/password|otp|cvv|pin\b|card.?number/);
    });

    it('atomic sequential numbering: several transactions posted in the same branch/year get distinct, increasing sequence numbers', async () => {
      const first = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const second = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const third = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);

      const receipts = await testApp.prisma.receipt.findMany({
        where: { transactionId: { in: [first.transactionId, second.transactionId, third.transactionId] } },
        orderBy: { sequenceNumber: 'asc' },
      });
      expect(receipts).toHaveLength(3);
      const sequenceNumbers = receipts.map((r) => r.sequenceNumber);
      expect(new Set(sequenceNumbers).size).toBe(3);
      expect(sequenceNumbers).toEqual([...sequenceNumbers].sort((a, b) => a - b));
    });
  });

  describe('business-side access', () => {
    it('rejects an unauthenticated request', async () => {
      await request(testApp.app.getHttpServer()).get(receiptsUrl()).expect(401);
    });

    it('a cashier and manager can list and read receipts', async () => {
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const list = await authed(testApp, cashier.accessToken).get(receiptsUrl()).expect(200);
      expect(list.body.data.length).toBeGreaterThan(0);

      const receipt = await testApp.prisma.receipt.findUniqueOrThrow({ where: { transactionId: posted.transactionId } });
      const get = await authed(testApp, manager.accessToken).get(receiptsUrl(`/${receipt.id}`)).expect(200);
      expect(get.body.data.id).toBe(receipt.id);
    });

    it('a service provider without receipts.read by default is forbidden', async () => {
      const response = await authed(testApp, fixture.providerAccessToken).get(receiptsUrl());
      expect(response.status).toBe(403);
    });

    it('a membership without receipts.read is forbidden', async () => {
      const noPermission = await createNoPermissionActor(testApp, fixture);
      const response = await authed(testApp, noPermission.accessToken).get(receiptsUrl());
      expect(response.status).toBe(403);
    });

    it('a receipt from another organization is not found', async () => {
      // The owner role already holds every permission this needs
      // (checkouts.create, payments.record, ...), so reuse it directly
      // instead of creating separate receptionist/cashier actors — this
      // test only needs one other organization's receipt to exist, not
      // a full second role matrix, and each real OTP sign-in counts
      // against the shared per-IP rate limit within a single test run.
      const other = await createBookableFixture(testApp);
      const otherPosted = await createPostedTransaction(testApp, other, other.ownerAccessToken, other.ownerAccessToken);
      const otherReceipt = await testApp.prisma.receipt.findUniqueOrThrow({ where: { transactionId: otherPosted.transactionId } });

      const response = await authed(testApp, manager.accessToken).get(receiptsUrl(`/${otherReceipt.id}`));
      expect(response.status).toBe(404);
    });
  });

  describe('customer-side access (/me/receipts)', () => {
    it('rejects an unauthenticated request', async () => {
      await request(testApp.app.getHttpServer()).get('/v1/me/receipts').expect(401);
    });

    it('a customer with a linked CustomerRecord sees their own receipt', async () => {
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);

      const customer = await signInWithEmailOtp(testApp, `customer-${randomUUID()}@example.test`);
      await authed(testApp, customer.accessToken).get('/v1/me/customer-profile').expect(200);
      const customerProfile = await testApp.prisma.customerProfile.findUniqueOrThrow({ where: { userId: customer.userId } });
      await testApp.prisma.customerRecord.update({
        where: { id: posted.customerRecordId },
        data: { customerProfileId: customerProfile.id },
      });

      const list = await authed(testApp, customer.accessToken).get('/v1/me/receipts').expect(200);
      expect(list.body.data).toHaveLength(1);
      const receiptId: string = list.body.data[0].id;

      const get = await authed(testApp, customer.accessToken).get(`/v1/me/receipts/${receiptId}`).expect(200);
      expect(get.body.data.id).toBe(receiptId);
    });

    it('a walk-in receipt with no linked CustomerProfile is never exposed through customer routes', async () => {
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const receipt = await testApp.prisma.receipt.findUniqueOrThrow({ where: { transactionId: posted.transactionId } });

      const customer = await signInWithEmailOtp(testApp, `unrelated-${randomUUID()}@example.test`);
      const get = await authed(testApp, customer.accessToken).get(`/v1/me/receipts/${receipt.id}`);
      expect(get.status).toBe(404);

      const list = await authed(testApp, customer.accessToken).get('/v1/me/receipts').expect(200);
      expect(list.body.data).toEqual([]);
    });

    it('a customer never sees another customer\'s receipt', async () => {
      const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);
      const receipt = await testApp.prisma.receipt.findUniqueOrThrow({ where: { transactionId: posted.transactionId } });

      const owner = await signInWithEmailOtp(testApp, `owner-cust-${randomUUID()}@example.test`);
      await authed(testApp, owner.accessToken).get('/v1/me/customer-profile').expect(200);
      const ownerProfile = await testApp.prisma.customerProfile.findUniqueOrThrow({ where: { userId: owner.userId } });
      await testApp.prisma.customerRecord.update({ where: { id: posted.customerRecordId }, data: { customerProfileId: ownerProfile.id } });

      const stranger = await signInWithEmailOtp(testApp, `stranger-${randomUUID()}@example.test`);
      const response = await authed(testApp, stranger.accessToken).get(`/v1/me/receipts/${receipt.id}`);
      expect(response.status).toBe(404);
    });
  });
});
