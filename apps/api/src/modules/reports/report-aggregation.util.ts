export interface CurrencyAmount {
  currency: string;
  amountMinor: number;
}

interface CurrencyAmountInput {
  currency: string;
  amountMinor: number;
}

/**
 * Sums a list of minor-unit amounts, kept strictly separate per
 * currency (docs task Phase 4: "Never combine different currencies into
 * one total") — the result is deterministically ordered by currency
 * code.
 */
export function sumByCurrency(items: readonly CurrencyAmountInput[]): CurrencyAmount[] {
  const sums = new Map<string, number>();
  for (const item of items) {
    sums.set(item.currency, (sums.get(item.currency) ?? 0) + item.amountMinor);
  }
  return [...sums.entries()]
    .map(([currency, amountMinor]) => ({ currency, amountMinor }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface CurrencySummary {
  totals: CurrencyAmount[];
  /** A display-only derived metric (integer minor units, plain rounded
   * division) — never itself persisted or treated as an authoritative
   * money value the way a Transaction/CommissionAccrual amount is. */
  averages: CurrencyAmount[];
  counts: Array<{ currency: string; count: number }>;
}

export function summarizeByCurrency(items: readonly CurrencyAmountInput[]): CurrencySummary {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const item of items) {
    sums.set(item.currency, (sums.get(item.currency) ?? 0) + item.amountMinor);
    counts.set(item.currency, (counts.get(item.currency) ?? 0) + 1);
  }
  const currencies = [...sums.keys()].sort();
  return {
    totals: currencies.map((currency) => ({ currency, amountMinor: sums.get(currency)! })),
    averages: currencies.map((currency) => ({
      currency,
      amountMinor: Math.round(sums.get(currency)! / counts.get(currency)!),
    })),
    counts: currencies.map((currency) => ({ currency, count: counts.get(currency)! })),
  };
}

/**
 * `gross` minus every list in `deductions`, kept strictly separate per
 * currency (docs task Phase 6: "netPostedRevenue = grossPostedSales -
 * refundAmount - reversalAmount") — a currency present only in a
 * deduction list (never in `gross`) still appears in the result with a
 * negative total, rather than being silently dropped.
 */
export function netByCurrency(gross: readonly CurrencyAmount[], ...deductions: ReadonlyArray<readonly CurrencyAmount[]>): CurrencyAmount[] {
  const net = new Map<string, number>();
  for (const entry of gross) {
    net.set(entry.currency, (net.get(entry.currency) ?? 0) + entry.amountMinor);
  }
  for (const deduction of deductions) {
    for (const entry of deduction) {
      net.set(entry.currency, (net.get(entry.currency) ?? 0) - entry.amountMinor);
    }
  }
  return [...net.entries()]
    .map(([currency, amountMinor]) => ({ currency, amountMinor }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface TransactionKindTotals {
  grossPostedSales: CurrencyAmount[];
  refundAmount: CurrencyAmount[];
  reversalAmount: CurrencyAmount[];
  netPostedRevenue: CurrencyAmount[];
  saleCount: number;
  refundTransactionCount: number;
  reversalTransactionCount: number;
}

/**
 * The gross-vs-net split every reporting endpoint's totals are built
 * from (docs task Phase 6). `*Minor` values on every Transaction are
 * always non-negative magnitudes regardless of kind — the subtraction
 * that turns a REFUND/REVERSAL into a reduction happens only here, at
 * the reporting layer, never on the stored Transaction row itself.
 */
export function summarizeTransactionKinds(
  transactions: readonly { kind: string; totalMinor: number; currency: string }[],
): TransactionKindTotals {
  const sales = transactions.filter((t) => t.kind === 'SALE');
  const refunds = transactions.filter((t) => t.kind === 'REFUND');
  const reversals = transactions.filter((t) => t.kind === 'REVERSAL');
  const grossPostedSales = sumByCurrency(sales.map((t) => ({ currency: t.currency, amountMinor: t.totalMinor })));
  const refundAmount = sumByCurrency(refunds.map((t) => ({ currency: t.currency, amountMinor: t.totalMinor })));
  const reversalAmount = sumByCurrency(reversals.map((t) => ({ currency: t.currency, amountMinor: t.totalMinor })));
  return {
    grossPostedSales,
    refundAmount,
    reversalAmount,
    netPostedRevenue: netByCurrency(grossPostedSales, refundAmount, reversalAmount),
    saleCount: sales.length,
    refundTransactionCount: refunds.length,
    reversalTransactionCount: reversals.length,
  };
}

export interface StaffPerformanceEntry {
  staffProfileId: string;
  /** Gross SALE revenue only — unchanged in meaning from before Phase 6. */
  revenue: CurrencyAmount[];
  refundedRevenue: CurrencyAmount[];
  reversedRevenue: CurrencyAmount[];
  netRevenue: CurrencyAmount[];
  serviceCount: number;
  /** EARNED commission only — unchanged in meaning from before Phase 6
   * (a REFUNDED/REVERSED adjustment is never summed in here, or it would
   * silently inflate rather than reduce the total). */
  commissionAccrued: CurrencyAmount[];
  commissionRefunded: CurrencyAmount[];
  commissionReversed: CurrencyAmount[];
  netCommission: CurrencyAmount[];
}

/**
 * Aggregates per-staff revenue (from TransactionLineItem snapshots, kind-
 * aware since Phase 6) and commission (from CommissionAccrual, kind-
 * aware since Phase 6) into one entry per staff member, deterministically
 * ordered by `staffProfileId` so pagination cursors stay stable across
 * identical inputs. `serviceCount` counts only SALE line items — a
 * refunded/reversed line was never a *new* service performed.
 */
export function aggregateStaffPerformance(
  lineItems: readonly { staffProfileId: string; priceMinorSnapshot: number; currencySnapshot: string; transactionKind: string }[],
  accruals: readonly { staffProfileId: string; calculatedAmountMinor: number; currency: string; kind: string }[],
): StaffPerformanceEntry[] {
  const revenueByStaff = new Map<string, CurrencyAmountInput[]>();
  const refundedByStaff = new Map<string, CurrencyAmountInput[]>();
  const reversedByStaff = new Map<string, CurrencyAmountInput[]>();
  const countByStaff = new Map<string, number>();
  for (const item of lineItems) {
    const entry = { currency: item.currencySnapshot, amountMinor: item.priceMinorSnapshot };
    if (item.transactionKind === 'SALE') {
      pushInto(revenueByStaff, item.staffProfileId, entry);
      countByStaff.set(item.staffProfileId, (countByStaff.get(item.staffProfileId) ?? 0) + 1);
    } else if (item.transactionKind === 'REFUND') {
      pushInto(refundedByStaff, item.staffProfileId, entry);
    } else if (item.transactionKind === 'REVERSAL') {
      pushInto(reversedByStaff, item.staffProfileId, entry);
    }
  }

  const commissionByStaff = new Map<string, CurrencyAmountInput[]>();
  const commissionRefundedByStaff = new Map<string, CurrencyAmountInput[]>();
  const commissionReversedByStaff = new Map<string, CurrencyAmountInput[]>();
  for (const accrual of accruals) {
    const entry = { currency: accrual.currency, amountMinor: accrual.calculatedAmountMinor };
    if (accrual.kind === 'EARNED') {
      pushInto(commissionByStaff, accrual.staffProfileId, entry);
    } else if (accrual.kind === 'REFUNDED') {
      pushInto(commissionRefundedByStaff, accrual.staffProfileId, entry);
    } else if (accrual.kind === 'REVERSED') {
      pushInto(commissionReversedByStaff, accrual.staffProfileId, entry);
    }
  }

  const staffIds = new Set([...revenueByStaff.keys(), ...refundedByStaff.keys(), ...reversedByStaff.keys(), ...commissionByStaff.keys()]);
  return [...staffIds]
    .sort()
    .map((staffProfileId) => {
      const revenue = sumByCurrency(revenueByStaff.get(staffProfileId) ?? []);
      const refundedRevenue = sumByCurrency(refundedByStaff.get(staffProfileId) ?? []);
      const reversedRevenue = sumByCurrency(reversedByStaff.get(staffProfileId) ?? []);
      const commissionAccrued = sumByCurrency(commissionByStaff.get(staffProfileId) ?? []);
      const commissionRefunded = sumByCurrency(commissionRefundedByStaff.get(staffProfileId) ?? []);
      const commissionReversed = sumByCurrency(commissionReversedByStaff.get(staffProfileId) ?? []);
      return {
        staffProfileId,
        revenue,
        refundedRevenue,
        reversedRevenue,
        netRevenue: netByCurrency(revenue, refundedRevenue, reversedRevenue),
        serviceCount: countByStaff.get(staffProfileId) ?? 0,
        commissionAccrued,
        commissionRefunded,
        commissionReversed,
        netCommission: netByCurrency(commissionAccrued, commissionRefunded, commissionReversed),
      };
    });
}

function pushInto(map: Map<string, CurrencyAmountInput[]>, key: string, entry: CurrencyAmountInput): void {
  const list = map.get(key) ?? [];
  list.push(entry);
  map.set(key, list);
}

export interface ServicePerformanceEntry {
  serviceId: string;
  serviceName: string;
  /** Gross amount sold (SALE lines only) — unchanged in meaning from
   * before Phase 6. */
  revenue: CurrencyAmount[];
  refundedAmount: CurrencyAmount[];
  reversedAmount: CurrencyAmount[];
  netAmount: CurrencyAmount[];
  serviceCount: number;
}

/** Kind-aware since Phase 6 (docs task: "service reporting distinguishes
 * sold and refunded amounts") — `serviceCount` counts only SALE lines. */
export function aggregateServicePerformance(
  lineItems: readonly {
    serviceId: string;
    serviceNameSnapshot: string;
    priceMinorSnapshot: number;
    currencySnapshot: string;
    transactionKind: string;
  }[],
): ServicePerformanceEntry[] {
  const soldByService = new Map<string, CurrencyAmountInput[]>();
  const refundedByService = new Map<string, CurrencyAmountInput[]>();
  const reversedByService = new Map<string, CurrencyAmountInput[]>();
  const countByService = new Map<string, number>();
  const nameByService = new Map<string, string>();
  for (const item of lineItems) {
    const entry = { currency: item.currencySnapshot, amountMinor: item.priceMinorSnapshot };
    if (item.transactionKind === 'SALE') {
      pushInto(soldByService, item.serviceId, entry);
      countByService.set(item.serviceId, (countByService.get(item.serviceId) ?? 0) + 1);
    } else if (item.transactionKind === 'REFUND') {
      pushInto(refundedByService, item.serviceId, entry);
    } else if (item.transactionKind === 'REVERSAL') {
      pushInto(reversedByService, item.serviceId, entry);
    }
    // Last-observed snapshot in iteration order — services are so rarely
    // renamed that any deterministic choice here is fine for a report
    // display label.
    nameByService.set(item.serviceId, item.serviceNameSnapshot);
  }
  const serviceIds = new Set([...soldByService.keys(), ...refundedByService.keys(), ...reversedByService.keys()]);
  return [...serviceIds]
    .sort()
    .map((serviceId) => {
      const revenue = sumByCurrency(soldByService.get(serviceId) ?? []);
      const refundedAmount = sumByCurrency(refundedByService.get(serviceId) ?? []);
      const reversedAmount = sumByCurrency(reversedByService.get(serviceId) ?? []);
      return {
        serviceId,
        serviceName: nameByService.get(serviceId)!,
        revenue,
        refundedAmount,
        reversedAmount,
        netAmount: netByCurrency(revenue, refundedAmount, reversedAmount),
        serviceCount: countByService.get(serviceId) ?? 0,
      };
    });
}

export interface PaymentMethodEntry {
  method: string;
  /** Collections only (payment summaries on a SALE_RECEIPT). */
  total: CurrencyAmount[];
  count: number;
  returnedTotal: CurrencyAmount[];
  returnedCount: number;
  netTotal: CurrencyAmount[];
}

/** Kind-aware since Phase 6 (docs task: "payment-method reporting
 * distinguishes collections and recorded returns") — `receiptKind` is
 * the parent Receipt's kind, never a live PaymentRecord read. */
export function aggregatePaymentMethods(
  summaries: readonly { method: string; amountMinorSnapshot: number; currencySnapshot: string; receiptKind: string }[],
): PaymentMethodEntry[] {
  const totalsByMethod = new Map<string, CurrencyAmountInput[]>();
  const countByMethod = new Map<string, number>();
  const returnedByMethod = new Map<string, CurrencyAmountInput[]>();
  const returnedCountByMethod = new Map<string, number>();
  for (const summary of summaries) {
    const entry = { currency: summary.currencySnapshot, amountMinor: summary.amountMinorSnapshot };
    if (summary.receiptKind === 'SALE_RECEIPT') {
      pushInto(totalsByMethod, summary.method, entry);
      countByMethod.set(summary.method, (countByMethod.get(summary.method) ?? 0) + 1);
    } else {
      pushInto(returnedByMethod, summary.method, entry);
      returnedCountByMethod.set(summary.method, (returnedCountByMethod.get(summary.method) ?? 0) + 1);
    }
  }
  const methods = new Set([...totalsByMethod.keys(), ...returnedByMethod.keys()]);
  return [...methods]
    .sort()
    .map((method) => {
      const total = sumByCurrency(totalsByMethod.get(method) ?? []);
      const returnedTotal = sumByCurrency(returnedByMethod.get(method) ?? []);
      return {
        method,
        total,
        count: countByMethod.get(method) ?? 0,
        returnedTotal,
        returnedCount: returnedCountByMethod.get(method) ?? 0,
        netTotal: netByCurrency(total, returnedTotal),
      };
    });
}

export interface CommissionReportEntry {
  staffProfileId: string;
  /** EARNED only, split by whether a policy matched. */
  policyAccrued: CurrencyAmount[];
  noPolicyAccrued: CurrencyAmount[];
  refunded: CurrencyAmount[];
  reversed: CurrencyAmount[];
  net: CurrencyAmount[];
}

/** Kind-aware since Phase 6 (docs task: "commission reporting
 * distinguishes earned, refunded, reversed, and net"). */
export function aggregateCommissionsBySource(
  accruals: readonly { staffProfileId: string; source: string; kind: string; calculatedAmountMinor: number; currency: string }[],
): CommissionReportEntry[] {
  const policyByStaff = new Map<string, CurrencyAmountInput[]>();
  const noPolicyByStaff = new Map<string, CurrencyAmountInput[]>();
  const refundedByStaff = new Map<string, CurrencyAmountInput[]>();
  const reversedByStaff = new Map<string, CurrencyAmountInput[]>();
  for (const accrual of accruals) {
    const entry = { currency: accrual.currency, amountMinor: accrual.calculatedAmountMinor };
    if (accrual.kind === 'REFUNDED') {
      pushInto(refundedByStaff, accrual.staffProfileId, entry);
    } else if (accrual.kind === 'REVERSED') {
      pushInto(reversedByStaff, accrual.staffProfileId, entry);
    } else {
      pushInto(accrual.source === 'POLICY' ? policyByStaff : noPolicyByStaff, accrual.staffProfileId, entry);
    }
  }
  const staffIds = new Set([...policyByStaff.keys(), ...noPolicyByStaff.keys(), ...refundedByStaff.keys(), ...reversedByStaff.keys()]);
  return [...staffIds]
    .sort()
    .map((staffProfileId) => {
      const policyAccrued = sumByCurrency(policyByStaff.get(staffProfileId) ?? []);
      const noPolicyAccrued = sumByCurrency(noPolicyByStaff.get(staffProfileId) ?? []);
      const refunded = sumByCurrency(refundedByStaff.get(staffProfileId) ?? []);
      const reversed = sumByCurrency(reversedByStaff.get(staffProfileId) ?? []);
      return {
        staffProfileId,
        policyAccrued,
        noPolicyAccrued,
        refunded,
        reversed,
        net: netByCurrency(netByCurrency([...policyAccrued, ...noPolicyAccrued]), refunded, reversed),
      };
    });
}

/** Simple in-memory cursor pagination over an already-sorted array —
 * every report list here is small enough (bounded by a 366-day range
 * and one row per distinct staff/service/method) to aggregate in full
 * before paging, rather than pushing pagination into SQL. */
export function paginateInMemory<T>(
  items: readonly T[],
  cursor: string | undefined,
  limit: number,
  keyOf: (item: T) => string,
): { data: T[]; hasMore: boolean; nextCursor: string | null } {
  const startIndex = cursor ? items.findIndex((item) => keyOf(item) > cursor) : 0;
  const from = startIndex === -1 ? items.length : startIndex;
  const page = items.slice(from, from + limit);
  const hasMore = from + limit < items.length;
  return { data: page, hasMore, nextCursor: hasMore ? keyOf(page[page.length - 1]) : null };
}
