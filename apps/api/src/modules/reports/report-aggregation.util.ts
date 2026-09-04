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

export interface StaffPerformanceEntry {
  staffProfileId: string;
  revenue: CurrencyAmount[];
  serviceCount: number;
  commissionAccrued: CurrencyAmount[];
}

/**
 * Aggregates per-staff revenue (from TransactionLineItem snapshots) and
 * commission (from CommissionAccrual) into one entry per staff member,
 * deterministically ordered by `staffProfileId` so pagination cursors
 * stay stable across identical inputs.
 */
export function aggregateStaffPerformance(
  lineItems: readonly { staffProfileId: string; priceMinorSnapshot: number; currencySnapshot: string }[],
  accruals: readonly { staffProfileId: string; calculatedAmountMinor: number; currency: string }[],
): StaffPerformanceEntry[] {
  const revenueByStaff = new Map<string, CurrencyAmountInput[]>();
  const countByStaff = new Map<string, number>();
  for (const item of lineItems) {
    const list = revenueByStaff.get(item.staffProfileId) ?? [];
    list.push({ currency: item.currencySnapshot, amountMinor: item.priceMinorSnapshot });
    revenueByStaff.set(item.staffProfileId, list);
    countByStaff.set(item.staffProfileId, (countByStaff.get(item.staffProfileId) ?? 0) + 1);
  }
  const commissionByStaff = new Map<string, CurrencyAmountInput[]>();
  for (const accrual of accruals) {
    const list = commissionByStaff.get(accrual.staffProfileId) ?? [];
    list.push({ currency: accrual.currency, amountMinor: accrual.calculatedAmountMinor });
    commissionByStaff.set(accrual.staffProfileId, list);
  }

  const staffIds = new Set([...revenueByStaff.keys(), ...commissionByStaff.keys()]);
  return [...staffIds]
    .sort()
    .map((staffProfileId) => ({
      staffProfileId,
      revenue: sumByCurrency(revenueByStaff.get(staffProfileId) ?? []),
      serviceCount: countByStaff.get(staffProfileId) ?? 0,
      commissionAccrued: sumByCurrency(commissionByStaff.get(staffProfileId) ?? []),
    }));
}

export interface ServicePerformanceEntry {
  serviceId: string;
  serviceName: string;
  revenue: CurrencyAmount[];
  serviceCount: number;
}

export function aggregateServicePerformance(
  lineItems: readonly { serviceId: string; serviceNameSnapshot: string; priceMinorSnapshot: number; currencySnapshot: string }[],
): ServicePerformanceEntry[] {
  const revenueByService = new Map<string, CurrencyAmountInput[]>();
  const countByService = new Map<string, number>();
  const nameByService = new Map<string, string>();
  for (const item of lineItems) {
    const list = revenueByService.get(item.serviceId) ?? [];
    list.push({ currency: item.currencySnapshot, amountMinor: item.priceMinorSnapshot });
    revenueByService.set(item.serviceId, list);
    countByService.set(item.serviceId, (countByService.get(item.serviceId) ?? 0) + 1);
    // Last-observed snapshot in iteration order — services are so rarely
    // renamed that any deterministic choice here is fine for a report
    // display label.
    nameByService.set(item.serviceId, item.serviceNameSnapshot);
  }
  return [...revenueByService.keys()]
    .sort()
    .map((serviceId) => ({
      serviceId,
      serviceName: nameByService.get(serviceId)!,
      revenue: sumByCurrency(revenueByService.get(serviceId) ?? []),
      serviceCount: countByService.get(serviceId) ?? 0,
    }));
}

export interface PaymentMethodEntry {
  method: string;
  total: CurrencyAmount[];
  count: number;
}

export function aggregatePaymentMethods(
  summaries: readonly { method: string; amountMinorSnapshot: number; currencySnapshot: string }[],
): PaymentMethodEntry[] {
  const totalsByMethod = new Map<string, CurrencyAmountInput[]>();
  const countByMethod = new Map<string, number>();
  for (const summary of summaries) {
    const list = totalsByMethod.get(summary.method) ?? [];
    list.push({ currency: summary.currencySnapshot, amountMinor: summary.amountMinorSnapshot });
    totalsByMethod.set(summary.method, list);
    countByMethod.set(summary.method, (countByMethod.get(summary.method) ?? 0) + 1);
  }
  return [...totalsByMethod.keys()]
    .sort()
    .map((method) => ({
      method,
      total: sumByCurrency(totalsByMethod.get(method) ?? []),
      count: countByMethod.get(method) ?? 0,
    }));
}

export interface CommissionReportEntry {
  staffProfileId: string;
  policyAccrued: CurrencyAmount[];
  noPolicyAccrued: CurrencyAmount[];
}

export function aggregateCommissionsBySource(
  accruals: readonly { staffProfileId: string; source: string; calculatedAmountMinor: number; currency: string }[],
): CommissionReportEntry[] {
  const policyByStaff = new Map<string, CurrencyAmountInput[]>();
  const noPolicyByStaff = new Map<string, CurrencyAmountInput[]>();
  for (const accrual of accruals) {
    const bucket = accrual.source === 'POLICY' ? policyByStaff : noPolicyByStaff;
    const list = bucket.get(accrual.staffProfileId) ?? [];
    list.push({ currency: accrual.currency, amountMinor: accrual.calculatedAmountMinor });
    bucket.set(accrual.staffProfileId, list);
  }
  const staffIds = new Set([...policyByStaff.keys(), ...noPolicyByStaff.keys()]);
  return [...staffIds]
    .sort()
    .map((staffProfileId) => ({
      staffProfileId,
      policyAccrued: sumByCurrency(policyByStaff.get(staffProfileId) ?? []),
      noPolicyAccrued: sumByCurrency(noPolicyByStaff.get(staffProfileId) ?? []),
    }));
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
