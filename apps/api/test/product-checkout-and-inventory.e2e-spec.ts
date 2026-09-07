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
  createPostedTransaction,
  type FinancialActor,
} from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

/**
 * Products + Sales + Cash Checkout + Commissions MVP (docs task: "Finish
 * the Kora OS MVP backend for Products + Sales + Cash Checkout +
 * Commissions"). Covers the 20 required scenarios end to end through the
 * real HTTP API: product-only and mixed checkout creation, server-side
 * price snapshotting, overselling prevention, the cash-record-then-
 * confirm-then-settle sequencing, exactly-once atomic stock deduction,
 * commission isolation between SERVICE and PRODUCT lines, receipt
 * correctness, report isolation, and refund/reversal inventory safety.
 */
describe('Product checkout, inventory, and commission isolation (e2e)', () => {
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

  function orgUrl(path: string): string {
    return `/v1/organizations/${fixture.organizationId}${path}`;
  }

  // A window centered on "now", matching reports.e2e-spec.ts's own
  // convention, so it always covers whatever a test just posted.
  function reportsUrl(path: string): string {
    const oneHundredDaysMs = 100 * 24 * 60 * 60 * 1000;
    const from = new Date(Date.now() - oneHundredDaysMs).toISOString();
    const to = new Date(Date.now() + oneHundredDaysMs).toISOString();
    const query = new URLSearchParams({ from, to });
    return orgUrl(`/reports/${path}?${query.toString()}`);
  }

  async function createProduct(
    overrides: {
      name?: string;
      variantName?: string;
      sellingPriceMinor?: number;
      sku?: string;
      trackInventory?: boolean;
    } = {},
  ): Promise<{ productId: string; variantId: string }> {
    const response = await authed(testApp, fixture.ownerAccessToken)
      .post(orgUrl('/products'))
      .send({
        name: overrides.name ?? 'Premium Beard Oil',
        currency: fixture.serviceCurrency,
        trackInventory: overrides.trackInventory ?? true,
        variantName: overrides.variantName ?? '50ml',
        sellingPriceMinor: overrides.sellingPriceMinor ?? 5500,
        sku: overrides.sku,
      })
      .expect(201);
    return { productId: response.body.data.id, variantId: response.body.data.variants[0].id };
  }

  async function receiveStock(variantId: string, quantity: number): Promise<void> {
    await authed(testApp, fixture.ownerAccessToken)
      .post(orgUrl(`/branches/${fixture.branchId}/inventory/variants/${variantId}/receive`))
      .send({ quantity })
      .expect(201);
  }

  function createProductCheckout(
    items: Array<{ productVariantId: string; quantity: number }>,
    overrides: { customerRecordId?: string; operatorStaffProfileId?: string } = {},
  ) {
    return authed(testApp, cashier.accessToken)
      .post(orgUrl('/checkouts'))
      .send({
        branchId: fixture.branchId,
        items,
        operatorStaffProfileId: overrides.operatorStaffProfileId ?? fixture.providerStaffProfileId,
        customerRecordId: overrides.customerRecordId,
      });
  }

  function recordCashPayment(checkoutId: string, amountMinor: number, recorderToken = cashier.accessToken) {
    return authed(testApp, recorderToken)
      .post(orgUrl(`/checkouts/${checkoutId}/payments`))
      .set('Idempotency-Key', randomUUID())
      .send({ method: 'CASH', appliedAmountMinor: amountMinor, currency: fixture.serviceCurrency });
  }

  function confirmPayment(paymentId: string, confirmerToken: string, body: Record<string, unknown> = {}) {
    return authed(testApp, confirmerToken).post(orgUrl(`/payments/${paymentId}/confirm`)).send(body);
  }

  async function getStock(variantId: string): Promise<number> {
    const row = await testApp.prisma.branchInventory.findUnique({
      where: { branchId_productVariantId: { branchId: fixture.branchId, productVariantId: variantId } },
    });
    return row?.quantityOnHand ?? 0;
  }

  /** Product-only checkout, recorded and confirmed to settlement — the
   * shared base case most scenarios below build on. */
  async function settleProductOnlySale(quantity: number, variantId: string) {
    const checkout = await createProductCheckout([{ productVariantId: variantId, quantity }]).expect(201);
    const payment = await recordCashPayment(checkout.body.data.id, checkout.body.data.totalMinor).expect(201);
    await confirmPayment(payment.body.data.id, fixture.providerAccessToken).expect(201);
    const transaction = await testApp.prisma.transaction.findFirstOrThrow({ where: { checkoutId: checkout.body.data.id } });
    return { checkout, transaction };
  }

  it('1. creates a product-only checkout with server-computed totals', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);

    const response = await createProductCheckout([{ productVariantId: variantId, quantity: 2 }]).expect(201);

    expect(response.body.data.status).toBe('OPEN');
    expect(response.body.data.serviceSessionId).toBeNull();
    expect(response.body.data.currency).toBe(fixture.serviceCurrency);
    expect(response.body.data.totalMinor).toBe(11_000);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      kind: 'PRODUCT',
      productVariantId: variantId,
      quantity: 2,
      unitPriceMinor: 5500,
      priceMinor: 11_000,
    });
  });

  it('2. snapshots the product price server-side; a later catalogue price change never reaches an existing checkout', async () => {
    const { variantId } = await createProduct({ sellingPriceMinor: 5500 });
    await receiveStock(variantId, 10);
    const checkout = await createProductCheckout([{ productVariantId: variantId, quantity: 1 }]).expect(201);

    await testApp.prisma.productVariant.update({ where: { id: variantId }, data: { sellingPriceMinor: 999_999 } });

    const refetched = await authed(testApp, manager.accessToken).get(orgUrl(`/checkouts/${checkout.body.data.id}`)).expect(200);
    expect(refetched.body.data.totalMinor).toBe(5500);
    expect(refetched.body.data.items[0].unitPriceMinor).toBe(5500);
  });

  it('3. rejects a checkout that requests more than the branch has on hand', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 1);

    const response = await createProductCheckout([{ productVariantId: variantId, quantity: 2 }]);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('4. recording a cash payment never deducts stock by itself', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);
    const checkout = await createProductCheckout([{ productVariantId: variantId, quantity: 2 }]).expect(201);

    await recordCashPayment(checkout.body.data.id, checkout.body.data.totalMinor).expect(201);

    expect(await getStock(variantId)).toBe(10);
    const transaction = await testApp.prisma.transaction.findFirst({ where: { checkoutId: checkout.body.data.id } });
    expect(transaction).toBeNull();
  });

  it('5. an unconfirmed payment never settles the checkout or posts a transaction', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);
    const checkout = await createProductCheckout([{ productVariantId: variantId, quantity: 2 }]).expect(201);
    await recordCashPayment(checkout.body.data.id, checkout.body.data.totalMinor).expect(201);

    const get = await authed(testApp, manager.accessToken).get(orgUrl(`/checkouts/${checkout.body.data.id}`)).expect(200);
    expect(get.body.data.status).toBe('AWAITING_VERIFICATION');
    expect(await testApp.prisma.transaction.findFirst({ where: { checkoutId: checkout.body.data.id } })).toBeNull();
    expect(await getStock(variantId)).toBe(10);
  });

  it('6/7. a confirmed full cash payment settles the checkout and posts exactly one SALE transaction', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);

    const { checkout, transaction } = await settleProductOnlySale(2, variantId);

    const get = await authed(testApp, manager.accessToken).get(orgUrl(`/checkouts/${checkout.body.data.id}`)).expect(200);
    expect(get.body.data.status).toBe('SETTLED');
    expect(transaction.kind).toBe('SALE');
    expect(transaction.totalMinor).toBe(11_000);

    const transactions = await testApp.prisma.transaction.findMany({ where: { checkoutId: checkout.body.data.id } });
    expect(transactions).toHaveLength(1);
  });

  it('8/9. settlement deducts branch stock and creates exactly one SALE inventory movement', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);

    await settleProductOnlySale(2, variantId);

    expect(await getStock(variantId)).toBe(8);
    const movements = await testApp.prisma.inventoryMovement.findMany({ where: { productVariantId: variantId, type: 'SALE' } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ quantityDelta: -2, quantityBefore: 10, quantityAfter: 8 });
  });

  it('10. retrying settlement/confirmation never double-deducts stock or duplicates the transaction, movement, or receipt', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);
    const { checkout, transaction } = await settleProductOnlySale(2, variantId);
    expect(await getStock(variantId)).toBe(8);

    const payment = await testApp.prisma.paymentRecord.findFirstOrThrow({ where: { checkoutId: checkout.body.data.id } });
    const retry = await confirmPayment(payment.id, fixture.providerAccessToken);
    expect(retry.status).toBe(409);

    expect(await getStock(variantId)).toBe(8);
    expect(await testApp.prisma.transaction.count({ where: { checkoutId: checkout.body.data.id } })).toBe(1);
    expect(await testApp.prisma.inventoryMovement.count({ where: { productVariantId: variantId, type: 'SALE' } })).toBe(1);
    expect(await testApp.prisma.receipt.count({ where: { transactionId: transaction.id } })).toBe(1);
  });

  it('11. a product line never creates a commission accrual, even with an active commission rule', async () => {
    await authed(testApp, manager.accessToken).post(orgUrl('/commission-rules')).send({ type: 'PERCENTAGE', rateBasisPoints: 2000, basis: 'GROSS_LINE' }).expect(201);
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);

    const { transaction } = await settleProductOnlySale(2, variantId);

    const accruals = await testApp.prisma.commissionAccrual.findMany({ where: { transactionId: transaction.id } });
    expect(accruals).toHaveLength(0);
  });

  it('12. a service line still creates a commission accrual (regression check)', async () => {
    await authed(testApp, manager.accessToken).post(orgUrl('/commission-rules')).send({ type: 'PERCENTAGE', rateBasisPoints: 2000, basis: 'GROSS_LINE' }).expect(201);

    const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);

    const accrual = await testApp.prisma.commissionAccrual.findFirstOrThrow({ where: { transactionId: posted.transactionId } });
    expect(accrual.calculatedAmountMinor).toBe(Math.round(fixture.servicePriceMinor * 0.2));
  });

  it('13/15. a mixed checkout accrues commission only on the service amount, and its receipt shows both line kinds', async () => {
    await authed(testApp, manager.accessToken).post(orgUrl('/commission-rules')).send({ type: 'PERCENTAGE', rateBasisPoints: 2000, basis: 'GROSS_LINE' }).expect(201);
    const { variantId } = await createProduct({ sellingPriceMinor: 5500 });
    await receiveStock(variantId, 10);
    const { serviceSessionId } = await createCompletedServiceSession(testApp, fixture, extras.receptionistAccessToken);

    const checkout = await authed(testApp, extras.receptionistAccessToken)
      .post(orgUrl(`/service-sessions/${serviceSessionId}/checkout`))
      .send({ productItems: [{ productVariantId: variantId, quantity: 1 }] })
      .expect(201);
    expect(checkout.body.data.items).toHaveLength(2);
    expect(checkout.body.data.totalMinor).toBe(fixture.servicePriceMinor + 5500);

    const payment = await recordCashPayment(checkout.body.data.id, checkout.body.data.totalMinor).expect(201);
    await confirmPayment(payment.body.data.id, fixture.providerAccessToken).expect(201);

    const transaction = await testApp.prisma.transaction.findFirstOrThrow({ where: { checkoutId: checkout.body.data.id } });
    const accruals = await testApp.prisma.commissionAccrual.findMany({ where: { transactionId: transaction.id } });
    expect(accruals).toHaveLength(1);
    expect(accruals[0].basisAmountMinor).toBe(fixture.servicePriceMinor);
    expect(accruals[0].calculatedAmountMinor).toBe(Math.round(fixture.servicePriceMinor * 0.2));
    expect(await getStock(variantId)).toBe(9);

    const receipt = await testApp.prisma.receipt.findFirstOrThrow({ where: { transactionId: transaction.id }, include: { lineItems: true } });
    expect(receipt.lineItems.map((item) => item.kind).sort()).toEqual(['PRODUCT', 'SERVICE']);
  });

  it('14. the receipt for a product-only sale shows product name, SKU, quantity, unit price, and line total', async () => {
    const { variantId } = await createProduct({ sku: 'BOIL-50' });
    await receiveStock(variantId, 10);

    const { transaction } = await settleProductOnlySale(2, variantId);

    const receipt = await testApp.prisma.receipt.findFirstOrThrow({ where: { transactionId: transaction.id }, include: { lineItems: true } });
    expect(receipt.lineItems).toHaveLength(1);
    expect(receipt.lineItems[0]).toMatchObject({
      kind: 'PRODUCT',
      productNameSnapshot: 'Premium Beard Oil',
      variantNameSnapshot: '50ml',
      skuSnapshot: 'BOIL-50',
      quantity: 2,
      unitPriceMinorSnapshot: 5500,
      lineTotalMinorSnapshot: 11_000,
    });
  });

  it('16. product revenue contributes to total posted revenue', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);

    await settleProductOnlySale(2, variantId);

    const response = await authed(testApp, manager.accessToken).get(reportsUrl('overview')).expect(200);
    expect(response.body.data.postedRevenue).toEqual([{ currency: fixture.serviceCurrency, amountMinor: 11_000 }]);
    expect(response.body.data.transactionCount).toBe(1);
  });

  it('17. a product-only sale never appears in the services report', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);

    await settleProductOnlySale(2, variantId);

    const response = await authed(testApp, manager.accessToken).get(reportsUrl('services')).expect(200);
    expect(response.body.data).toHaveLength(0);
  });

  it('18. staff performance counts only the service amount from a mixed sale, never the product amount', async () => {
    const { variantId } = await createProduct({ sellingPriceMinor: 5500 });
    await receiveStock(variantId, 10);
    const { serviceSessionId } = await createCompletedServiceSession(testApp, fixture, extras.receptionistAccessToken);
    const checkout = await authed(testApp, extras.receptionistAccessToken)
      .post(orgUrl(`/service-sessions/${serviceSessionId}/checkout`))
      .send({ productItems: [{ productVariantId: variantId, quantity: 1 }] })
      .expect(201);
    const payment = await recordCashPayment(checkout.body.data.id, checkout.body.data.totalMinor).expect(201);
    await confirmPayment(payment.body.data.id, fixture.providerAccessToken).expect(201);

    const response = await authed(testApp, manager.accessToken).get(reportsUrl('staff-performance')).expect(200);
    const entry = response.body.data.find((row: { staffProfileId: string }) => row.staffProfileId === fixture.providerStaffProfileId);
    expect(entry).toBeDefined();
    expect(entry.revenue).toEqual([{ currency: fixture.serviceCurrency, amountMinor: fixture.servicePriceMinor }]);
    expect(entry.serviceCount).toBe(1);
  });

  it('19. a full-line product refund restores inventory exactly once', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);
    const { checkout, transaction } = await settleProductOnlySale(2, variantId);
    expect(await getStock(variantId)).toBe(8);

    const lineItem = await testApp.prisma.transactionLineItem.findFirstOrThrow({ where: { transactionId: transaction.id } });
    // Requested by cashier, approved by manager — a correction's own
    // requester can never approve it themselves (separation of duties;
    // see correction-decision-authorization.util.ts), matching the
    // existing convention in transaction-corrections.e2e-spec.ts.
    const correction = await authed(testApp, cashier.accessToken)
      .post(orgUrl(`/transactions/${transaction.id}/refund-requests`))
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Customer returned the item',
        returnMethod: 'CASH',
        lines: [{ originalTransactionLineItemId: lineItem.id, requestedAmountMinor: lineItem.priceMinorSnapshot }],
      })
      .expect(201);
    await authed(testApp, manager.accessToken).post(orgUrl(`/transaction-corrections/${correction.body.data.id}/approve`)).send({}).expect(201);
    await authed(testApp, manager.accessToken)
      .post(orgUrl(`/transaction-corrections/${correction.body.data.id}/execute`))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    expect(await getStock(variantId)).toBe(10);
    const movements = await testApp.prisma.inventoryMovement.findMany({ where: { productVariantId: variantId, type: 'RETURN' } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ quantityDelta: 2, quantityBefore: 8, quantityAfter: 10 });
    void checkout;
  });

  it('19b. blocks a partial-amount refund of a product line instead of risking incorrect inventory', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);
    const { transaction } = await settleProductOnlySale(2, variantId);

    const lineItem = await testApp.prisma.transactionLineItem.findFirstOrThrow({ where: { transactionId: transaction.id } });
    const correction = await authed(testApp, cashier.accessToken)
      .post(orgUrl(`/transactions/${transaction.id}/refund-requests`))
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Partial goodwill discount',
        returnMethod: 'CASH',
        lines: [{ originalTransactionLineItemId: lineItem.id, requestedAmountMinor: 1000 }],
      })
      .expect(201);
    await authed(testApp, manager.accessToken).post(orgUrl(`/transaction-corrections/${correction.body.data.id}/approve`)).send({}).expect(201);

    const executeResponse = await authed(testApp, manager.accessToken)
      .post(orgUrl(`/transaction-corrections/${correction.body.data.id}/execute`))
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(executeResponse.status).toBe(409);
    expect(executeResponse.body.error.code).toBe('PARTIAL_PRODUCT_REFUND_NOT_SUPPORTED');
    expect(await getStock(variantId)).toBe(8);
  });

  it('20. a plain service-only checkout still works exactly as before (regression check)', async () => {
    const posted = await createPostedTransaction(testApp, fixture, extras.receptionistAccessToken, cashier.accessToken);

    const transaction = await testApp.prisma.transaction.findUniqueOrThrow({ where: { id: posted.transactionId } });
    expect(transaction.kind).toBe('SALE');
    expect(transaction.checkoutId).toBe(posted.checkoutId);
    const checkout = await testApp.prisma.checkout.findUniqueOrThrow({ where: { id: posted.checkoutId } });
    expect(checkout.status).toBe('SETTLED');
  });

  it('permissions: a manager can confirm a product-only sale via the existing management-override path when no assigned provider matches', async () => {
    // A cashier deliberately does NOT get payments.resolve (that single
    // permission also gates void and dispute resolution — see seed.ts's
    // cashier role comment) — so a solo cashier's till still relies on
    // the existing owner/manager override to confirm cash, exactly as
    // it already does for a service checkout. This proves that path
    // works unchanged for a product-only checkout too.
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);
    const checkout = await createProductCheckout([{ productVariantId: variantId, quantity: 1 }]).expect(201);
    const payment = await recordCashPayment(checkout.body.data.id, checkout.body.data.totalMinor, cashier.accessToken).expect(201);

    const confirmResponse = await confirmPayment(payment.body.data.id, manager.accessToken, { reason: 'Verified cash count at register' });

    expect(confirmResponse.status).toBe(201);
    const audit = await testApp.prisma.auditEvent.findMany({ where: { organizationId: fixture.organizationId, entityId: payment.body.data.id } });
    expect(audit.map((event) => event.action)).toContain('payment.management_override');
  });

  it('permissions: a cashier cannot confirm a product-only sale merely because they recorded the cash', async () => {
    const { variantId } = await createProduct();
    await receiveStock(variantId, 10);
    const checkout = await createProductCheckout([{ productVariantId: variantId, quantity: 1 }]).expect(201);
    const payment = await recordCashPayment(checkout.body.data.id, checkout.body.data.totalMinor, cashier.accessToken).expect(201);

    const confirmResponse = await confirmPayment(payment.body.data.id, cashier.accessToken, {});

    expect(confirmResponse.status).toBe(403);
  });

  it('acceptance walkthrough: Premium Beard Oil 50ml, GHS55, qty 2 → GHS110, settles to stock 8; retry is idempotent', async () => {
    const { variantId } = await createProduct({ name: 'Premium Beard Oil', variantName: '50ml', sellingPriceMinor: 5500 });
    await receiveStock(variantId, 10);

    // B. product-only checkout, quantity 2, expected total GHS110.
    const checkout = await createProductCheckout([{ productVariantId: variantId, quantity: 2 }]).expect(201);
    expect(checkout.body.data.totalMinor).toBe(11_000);

    // C. record CASH GHS110; stock remains 10 before confirmation.
    const payment = await recordCashPayment(checkout.body.data.id, 11_000).expect(201);
    expect(await getStock(variantId)).toBe(10);

    // D. confirm CASH payment; checkout settles.
    await confirmPayment(payment.body.data.id, fixture.providerAccessToken).expect(201);
    const settled = await authed(testApp, manager.accessToken).get(orgUrl(`/checkouts/${checkout.body.data.id}`)).expect(200);
    expect(settled.body.data.status).toBe('SETTLED');

    // E. exactly one SALE transaction.
    const transactions = await testApp.prisma.transaction.findMany({ where: { checkoutId: checkout.body.data.id } });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].kind).toBe('SALE');

    // F. stock becomes 8; movement SALE delta -2.
    expect(await getStock(variantId)).toBe(8);
    const movements = await testApp.prisma.inventoryMovement.findMany({ where: { productVariantId: variantId, type: 'SALE' } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ quantityDelta: -2, quantityBefore: 10, quantityAfter: 8 });

    // G. receipt: 2 x Premium Beard Oil, correct unit price/total, CASH.
    const receipt = await testApp.prisma.receipt.findFirstOrThrow({
      where: { transactionId: transactions[0].id },
      include: { lineItems: true, paymentSummaries: true },
    });
    expect(receipt.lineItems[0]).toMatchObject({ productNameSnapshot: 'Premium Beard Oil', quantity: 2, unitPriceMinorSnapshot: 5500, lineTotalMinorSnapshot: 11_000 });
    expect(receipt.paymentSummaries[0]).toMatchObject({ method: 'CASH', amountMinorSnapshot: 11_000 });

    // H. retry settlement/confirmation: stock stays 8, no duplicates.
    const retryConfirm = await confirmPayment(payment.body.data.id, fixture.providerAccessToken);
    expect(retryConfirm.status).toBe(409);
    expect(await getStock(variantId)).toBe(8);
    expect(await testApp.prisma.transaction.count({ where: { checkoutId: checkout.body.data.id } })).toBe(1);
    expect(await testApp.prisma.inventoryMovement.count({ where: { productVariantId: variantId, type: 'SALE' } })).toBe(1);
    expect(await testApp.prisma.receipt.count({ where: { transactionId: transactions[0].id } })).toBe(1);
  });

  it('acceptance walkthrough: mixed sale — Haircut GHS100 + Beard Oil GHS55, 20% commission only on the haircut', async () => {
    await authed(testApp, manager.accessToken).post(orgUrl('/commission-rules')).send({ type: 'PERCENTAGE', rateBasisPoints: 2000, basis: 'GROSS_LINE' }).expect(201);
    await testApp.prisma.service.update({ where: { id: fixture.serviceId }, data: { priceMinor: 10_000 } });
    const { variantId } = await createProduct({ name: 'Premium Beard Oil', variantName: '50ml', sellingPriceMinor: 5500 });
    await receiveStock(variantId, 10);
    const { serviceSessionId } = await createCompletedServiceSession(testApp, fixture, extras.receptionistAccessToken);

    const checkout = await authed(testApp, extras.receptionistAccessToken)
      .post(orgUrl(`/service-sessions/${serviceSessionId}/checkout`))
      .send({ productItems: [{ productVariantId: variantId, quantity: 1 }] })
      .expect(201);
    // Checkout total = GHS155.
    expect(checkout.body.data.totalMinor).toBe(15_500);

    const payment = await recordCashPayment(checkout.body.data.id, 15_500).expect(201);
    await confirmPayment(payment.body.data.id, fixture.providerAccessToken).expect(201);

    const transaction = await testApp.prisma.transaction.findFirstOrThrow({ where: { checkoutId: checkout.body.data.id } });
    const accruals = await testApp.prisma.commissionAccrual.findMany({ where: { transactionId: transaction.id } });
    // Commission = GHS20 (20% of the GHS100 haircut only), exactly one
    // accrual, and it is a SERVICE-line accrual — never 20% of GHS155.
    expect(accruals).toHaveLength(1);
    expect(accruals[0].basisAmountMinor).toBe(10_000);
    expect(accruals[0].calculatedAmountMinor).toBe(2000);

    // Product stock deducts by 1; the single accrual above already
    // proves the product line contributed no commission of its own
    // (basisAmountMinor is exactly the haircut's price, not haircut +
    // product, and there is no second accrual for the product line).
    expect(await getStock(variantId)).toBe(9);
    const lineItems = await testApp.prisma.transactionLineItem.findMany({ where: { transactionId: transaction.id } });
    const productLine = lineItems.find((item) => item.kind === 'PRODUCT')!;
    expect(productLine.priceMinorSnapshot).toBe(5500);
  });
});
