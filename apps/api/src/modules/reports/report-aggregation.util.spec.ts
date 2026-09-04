import { describe, expect, it } from 'vitest';
import {
  aggregateCommissionsBySource,
  aggregatePaymentMethods,
  aggregateServicePerformance,
  aggregateStaffPerformance,
  paginateInMemory,
  summarizeByCurrency,
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

describe('aggregateStaffPerformance', () => {
  it('groups revenue and commission per staff, ordered by staffProfileId', () => {
    const result = aggregateStaffPerformance(
      [
        { staffProfileId: 'staff-b', priceMinorSnapshot: 1000, currencySnapshot: 'GHS' },
        { staffProfileId: 'staff-a', priceMinorSnapshot: 500, currencySnapshot: 'GHS' },
        { staffProfileId: 'staff-a', priceMinorSnapshot: 300, currencySnapshot: 'GHS' },
      ],
      [{ staffProfileId: 'staff-a', calculatedAmountMinor: 80, currency: 'GHS' }],
    );
    expect(result.map((r) => r.staffProfileId)).toEqual(['staff-a', 'staff-b']);
    expect(result[0].revenue).toEqual([{ currency: 'GHS', amountMinor: 800 }]);
    expect(result[0].serviceCount).toBe(2);
    expect(result[0].commissionAccrued).toEqual([{ currency: 'GHS', amountMinor: 80 }]);
    expect(result[1].commissionAccrued).toEqual([]);
  });

  it('includes a staff member who only has commission accruals and no line items in this range (unreachable in practice, handled defensively)', () => {
    const result = aggregateStaffPerformance([], [{ staffProfileId: 'staff-z', calculatedAmountMinor: 10, currency: 'GHS' }]);
    expect(result).toHaveLength(1);
    expect(result[0].serviceCount).toBe(0);
  });
});

describe('aggregateServicePerformance', () => {
  it('groups revenue per service', () => {
    const result = aggregateServicePerformance([
      { serviceId: 'svc-1', serviceNameSnapshot: 'Haircut', priceMinorSnapshot: 1000, currencySnapshot: 'GHS' },
      { serviceId: 'svc-1', serviceNameSnapshot: 'Haircut', priceMinorSnapshot: 1000, currencySnapshot: 'GHS' },
      { serviceId: 'svc-2', serviceNameSnapshot: 'Manicure', priceMinorSnapshot: 500, currencySnapshot: 'GHS' },
    ]);
    expect(result).toEqual([
      { serviceId: 'svc-1', serviceName: 'Haircut', revenue: [{ currency: 'GHS', amountMinor: 2000 }], serviceCount: 2 },
      { serviceId: 'svc-2', serviceName: 'Manicure', revenue: [{ currency: 'GHS', amountMinor: 500 }], serviceCount: 1 },
    ]);
  });
});

describe('aggregatePaymentMethods', () => {
  it('groups amounts and counts per method', () => {
    const result = aggregatePaymentMethods([
      { method: 'CASH', amountMinorSnapshot: 1000, currencySnapshot: 'GHS' },
      { method: 'CASH', amountMinorSnapshot: 500, currencySnapshot: 'GHS' },
      { method: 'MOBILE_MONEY', amountMinorSnapshot: 200, currencySnapshot: 'GHS' },
    ]);
    expect(result).toEqual([
      { method: 'CASH', total: [{ currency: 'GHS', amountMinor: 1500 }], count: 2 },
      { method: 'MOBILE_MONEY', total: [{ currency: 'GHS', amountMinor: 200 }], count: 1 },
    ]);
  });
});

describe('aggregateCommissionsBySource', () => {
  it('separates POLICY and NO_POLICY accrual totals per staff', () => {
    const result = aggregateCommissionsBySource([
      { staffProfileId: 'staff-a', source: 'POLICY', calculatedAmountMinor: 100, currency: 'GHS' },
      { staffProfileId: 'staff-a', source: 'NO_POLICY', calculatedAmountMinor: 0, currency: 'GHS' },
    ]);
    expect(result).toEqual([
      {
        staffProfileId: 'staff-a',
        policyAccrued: [{ currency: 'GHS', amountMinor: 100 }],
        noPolicyAccrued: [{ currency: 'GHS', amountMinor: 0 }],
      },
    ]);
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
