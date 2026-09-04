import { describe, expect, it } from 'vitest';
import {
  aggregateCommissionsBySource,
  aggregatePaymentMethods,
  aggregateServicePerformance,
  aggregateStaffPerformance,
  netByCurrency,
  paginateInMemory,
  summarizeByCurrency,
  summarizeTransactionKinds,
  sumByCurrency,
} from './report-aggregation.util.js';

describe('sumByCurrency', () => {
  it('sums within a currency and never combines different currencies', () => {
    const result = sumByCurrency([
      { currency: 'GHS', amountMinor: 100 },
      { currency: 'GHS', amountMinor: 200 },
      { currency: 'USD', amountMinor: 50 },
    ]);
    expect(result).toEqual([
      { currency: 'GHS', amountMinor: 300 },
      { currency: 'USD', amountMinor: 50 },
    ]);
  });

  it('returns an empty array for no items', () => {
    expect(sumByCurrency([])).toEqual([]);
  });
});

describe('summarizeByCurrency', () => {
  it('computes totals, counts, and rounded averages per currency', () => {
    const result = summarizeByCurrency([
      { currency: 'GHS', amountMinor: 100 },
      { currency: 'GHS', amountMinor: 201 },
      { currency: 'USD', amountMinor: 10 },
    ]);
    expect(result.totals).toEqual([
      { currency: 'GHS', amountMinor: 301 },
      { currency: 'USD', amountMinor: 10 },
    ]);
    expect(result.counts).toEqual([
      { currency: 'GHS', count: 2 },
      { currency: 'USD', count: 1 },
    ]);
    expect(result.averages.find((a) => a.currency === 'GHS')?.amountMinor).toBe(151); // round(301/2) = 150.5 -> 151
  });
});

describe('netByCurrency', () => {
  it('subtracts every deduction list from the gross, per currency', () => {
    const result = netByCurrency(
      [{ currency: 'GHS', amountMinor: 1000 }],
      [{ currency: 'GHS', amountMinor: 300 }],
      [{ currency: 'GHS', amountMinor: 100 }],
    );
    expect(result).toEqual([{ currency: 'GHS', amountMinor: 600 }]);
  });

  it('keeps a currency present only in a deduction, going negative', () => {
    const result = netByCurrency([], [{ currency: 'USD', amountMinor: 50 }]);
    expect(result).toEqual([{ currency: 'USD', amountMinor: -50 }]);
  });

  it('returns the gross unchanged with no deductions', () => {
    expect(netByCurrency([{ currency: 'GHS', amountMinor: 500 }])).toEqual([{ currency: 'GHS', amountMinor: 500 }]);
  });
});

describe('summarizeTransactionKinds', () => {
  it('separates SALE, REFUND, and REVERSAL amounts and counts', () => {
    const result = summarizeTransactionKinds([
      { kind: 'SALE', totalMinor: 10_000, currency: 'GHS' },
      { kind: 'SALE', totalMinor: 5_000, currency: 'GHS' },
      { kind: 'REFUND', totalMinor: 2_000, currency: 'GHS' },
      { kind: 'REVERSAL', totalMinor: 1_000, currency: 'GHS' },
    ]);
    expect(result.grossPostedSales).toEqual([{ currency: 'GHS', amountMinor: 15_000 }]);
    expect(result.refundAmount).toEqual([{ currency: 'GHS', amountMinor: 2_000 }]);
    expect(result.reversalAmount).toEqual([{ currency: 'GHS', amountMinor: 1_000 }]);
    expect(result.netPostedRevenue).toEqual([{ currency: 'GHS', amountMinor: 12_000 }]);
    expect(result.saleCount).toBe(2);
    expect(result.refundTransactionCount).toBe(1);
    expect(result.reversalTransactionCount).toBe(1);
  });

  it('returns zeroed totals for no transactions', () => {
    const result = summarizeTransactionKinds([]);
    expect(result.grossPostedSales).toEqual([]);
    expect(result.netPostedRevenue).toEqual([]);
    expect(result.saleCount).toBe(0);
  });
});

describe('aggregateStaffPerformance', () => {
  it('groups gross SALE revenue and EARNED commission per staff, ordered by staffProfileId', () => {
    const result = aggregateStaffPerformance(
      [
        { staffProfileId: 'staff-b', priceMinorSnapshot: 1000, currencySnapshot: 'GHS', transactionKind: 'SALE' },
        { staffProfileId: 'staff-a', priceMinorSnapshot: 500, currencySnapshot: 'GHS', transactionKind: 'SALE' },
        { staffProfileId: 'staff-a', priceMinorSnapshot: 300, currencySnapshot: 'GHS', transactionKind: 'SALE' },
      ],
      [{ staffProfileId: 'staff-a', calculatedAmountMinor: 80, currency: 'GHS', kind: 'EARNED' }],
    );
    expect(result.map((r) => r.staffProfileId)).toEqual(['staff-a', 'staff-b']);
    expect(result[0].revenue).toEqual([{ currency: 'GHS', amountMinor: 800 }]);
    expect(result[0].serviceCount).toBe(2);
    expect(result[0].commissionAccrued).toEqual([{ currency: 'GHS', amountMinor: 80 }]);
    expect(result[0].netRevenue).toEqual([{ currency: 'GHS', amountMinor: 800 }]);
    expect(result[0].netCommission).toEqual([{ currency: 'GHS', amountMinor: 80 }]);
    expect(result[1].commissionAccrued).toEqual([]);
  });

  it('subtracts REFUND/REVERSAL line items and REFUNDED/REVERSED accruals into net figures, without touching serviceCount', () => {
    const result = aggregateStaffPerformance(
      [
        { staffProfileId: 'staff-a', priceMinorSnapshot: 1000, currencySnapshot: 'GHS', transactionKind: 'SALE' },
        { staffProfileId: 'staff-a', priceMinorSnapshot: 400, currencySnapshot: 'GHS', transactionKind: 'REFUND' },
      ],
      [
        { staffProfileId: 'staff-a', calculatedAmountMinor: 100, currency: 'GHS', kind: 'EARNED' },
        { staffProfileId: 'staff-a', calculatedAmountMinor: 40, currency: 'GHS', kind: 'REFUNDED' },
      ],
    );
    expect(result[0].revenue).toEqual([{ currency: 'GHS', amountMinor: 1000 }]);
    expect(result[0].refundedRevenue).toEqual([{ currency: 'GHS', amountMinor: 400 }]);
    expect(result[0].netRevenue).toEqual([{ currency: 'GHS', amountMinor: 600 }]);
    expect(result[0].serviceCount).toBe(1);
    expect(result[0].commissionAccrued).toEqual([{ currency: 'GHS', amountMinor: 100 }]);
    expect(result[0].commissionRefunded).toEqual([{ currency: 'GHS', amountMinor: 40 }]);
    expect(result[0].netCommission).toEqual([{ currency: 'GHS', amountMinor: 60 }]);
  });

  it('includes a staff member who only has commission accruals and no line items in this range (unreachable in practice, handled defensively)', () => {
    const result = aggregateStaffPerformance([], [{ staffProfileId: 'staff-z', calculatedAmountMinor: 10, currency: 'GHS', kind: 'EARNED' }]);
    expect(result).toHaveLength(1);
    expect(result[0].serviceCount).toBe(0);
  });
});

describe('aggregateServicePerformance', () => {
  it('groups sold amount per service', () => {
    const result = aggregateServicePerformance([
      { serviceId: 'svc-1', serviceNameSnapshot: 'Haircut', priceMinorSnapshot: 1000, currencySnapshot: 'GHS', transactionKind: 'SALE' },
      { serviceId: 'svc-1', serviceNameSnapshot: 'Haircut', priceMinorSnapshot: 1000, currencySnapshot: 'GHS', transactionKind: 'SALE' },
      { serviceId: 'svc-2', serviceNameSnapshot: 'Manicure', priceMinorSnapshot: 500, currencySnapshot: 'GHS', transactionKind: 'SALE' },
    ]);
    expect(result).toEqual([
      {
        serviceId: 'svc-1',
        serviceName: 'Haircut',
        revenue: [{ currency: 'GHS', amountMinor: 2000 }],
        refundedAmount: [],
        reversedAmount: [],
        netAmount: [{ currency: 'GHS', amountMinor: 2000 }],
        serviceCount: 2,
      },
      {
        serviceId: 'svc-2',
        serviceName: 'Manicure',
        revenue: [{ currency: 'GHS', amountMinor: 500 }],
        refundedAmount: [],
        reversedAmount: [],
        netAmount: [{ currency: 'GHS', amountMinor: 500 }],
        serviceCount: 1,
      },
    ]);
  });

  it('distinguishes sold and refunded amounts, netting them for the same service', () => {
    const result = aggregateServicePerformance([
      { serviceId: 'svc-1', serviceNameSnapshot: 'Haircut', priceMinorSnapshot: 1000, currencySnapshot: 'GHS', transactionKind: 'SALE' },
      { serviceId: 'svc-1', serviceNameSnapshot: 'Haircut', priceMinorSnapshot: 300, currencySnapshot: 'GHS', transactionKind: 'REFUND' },
    ]);
    expect(result[0].revenue).toEqual([{ currency: 'GHS', amountMinor: 1000 }]);
    expect(result[0].refundedAmount).toEqual([{ currency: 'GHS', amountMinor: 300 }]);
    expect(result[0].netAmount).toEqual([{ currency: 'GHS', amountMinor: 700 }]);
    expect(result[0].serviceCount).toBe(1);
  });
});

describe('aggregatePaymentMethods', () => {
  it('groups collection amounts and counts per method, from SALE_RECEIPT summaries', () => {
    const result = aggregatePaymentMethods([
      { method: 'CASH', amountMinorSnapshot: 1000, currencySnapshot: 'GHS', receiptKind: 'SALE_RECEIPT' },
      { method: 'CASH', amountMinorSnapshot: 500, currencySnapshot: 'GHS', receiptKind: 'SALE_RECEIPT' },
      { method: 'MOBILE_MONEY', amountMinorSnapshot: 200, currencySnapshot: 'GHS', receiptKind: 'SALE_RECEIPT' },
    ]);
    expect(result).toEqual([
      { method: 'CASH', total: [{ currency: 'GHS', amountMinor: 1500 }], count: 2, returnedTotal: [], returnedCount: 0, netTotal: [{ currency: 'GHS', amountMinor: 1500 }] },
      { method: 'MOBILE_MONEY', total: [{ currency: 'GHS', amountMinor: 200 }], count: 1, returnedTotal: [], returnedCount: 0, netTotal: [{ currency: 'GHS', amountMinor: 200 }] },
    ]);
  });

  it('distinguishes collections from recorded returns (REFUND_RECEIPT/REVERSAL_RECORD)', () => {
    const result = aggregatePaymentMethods([
      { method: 'CASH', amountMinorSnapshot: 1000, currencySnapshot: 'GHS', receiptKind: 'SALE_RECEIPT' },
      { method: 'CASH', amountMinorSnapshot: 400, currencySnapshot: 'GHS', receiptKind: 'REFUND_RECEIPT' },
    ]);
    expect(result[0].total).toEqual([{ currency: 'GHS', amountMinor: 1000 }]);
    expect(result[0].returnedTotal).toEqual([{ currency: 'GHS', amountMinor: 400 }]);
    expect(result[0].returnedCount).toBe(1);
    expect(result[0].netTotal).toEqual([{ currency: 'GHS', amountMinor: 600 }]);
  });
});

describe('aggregateCommissionsBySource', () => {
  it('separates POLICY and NO_POLICY EARNED accrual totals per staff', () => {
    const result = aggregateCommissionsBySource([
      { staffProfileId: 'staff-a', source: 'POLICY', kind: 'EARNED', calculatedAmountMinor: 100, currency: 'GHS' },
      { staffProfileId: 'staff-a', source: 'NO_POLICY', kind: 'EARNED', calculatedAmountMinor: 0, currency: 'GHS' },
    ]);
    expect(result).toEqual([
      {
        staffProfileId: 'staff-a',
        policyAccrued: [{ currency: 'GHS', amountMinor: 100 }],
        noPolicyAccrued: [{ currency: 'GHS', amountMinor: 0 }],
        refunded: [],
        reversed: [],
        net: [{ currency: 'GHS', amountMinor: 100 }],
      },
    ]);
  });

  it('distinguishes earned, refunded, reversed, and net per staff', () => {
    const result = aggregateCommissionsBySource([
      { staffProfileId: 'staff-a', source: 'POLICY', kind: 'EARNED', calculatedAmountMinor: 100, currency: 'GHS' },
      { staffProfileId: 'staff-a', source: 'POLICY', kind: 'REFUNDED', calculatedAmountMinor: 30, currency: 'GHS' },
      { staffProfileId: 'staff-a', source: 'POLICY', kind: 'REVERSED', calculatedAmountMinor: 10, currency: 'GHS' },
    ]);
    expect(result[0].policyAccrued).toEqual([{ currency: 'GHS', amountMinor: 100 }]);
    expect(result[0].refunded).toEqual([{ currency: 'GHS', amountMinor: 30 }]);
    expect(result[0].reversed).toEqual([{ currency: 'GHS', amountMinor: 10 }]);
    expect(result[0].net).toEqual([{ currency: 'GHS', amountMinor: 60 }]);
  });
});

describe('paginateInMemory', () => {
  const items = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }];

  it('returns the first page with hasMore=true when more remain', () => {
    const page = paginateInMemory(items, undefined, 2, (i) => i.key);
    expect(page.data.map((i) => i.key)).toEqual(['a', 'b']);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('b');
  });

  it('continues from a cursor', () => {
    const page = paginateInMemory(items, 'b', 2, (i) => i.key);
    expect(page.data.map((i) => i.key)).toEqual(['c', 'd']);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('returns an empty page when the cursor is past the end', () => {
    const page = paginateInMemory(items, 'z', 2, (i) => i.key);
    expect(page.data).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('returns an empty page for an empty input', () => {
    const page = paginateInMemory([], undefined, 2, (i: { key: string }) => i.key);
    expect(page.data).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
});
