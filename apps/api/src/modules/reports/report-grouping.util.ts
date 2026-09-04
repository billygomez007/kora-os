import { utcToLocalDate } from '../../common/scheduling/local-time.util.js';

export interface RevenueEvent {
  occurredAt: Date;
  amountMinor: number;
  currency: string;
}

export interface DailyRevenueBucket {
  /** Branch-local calendar date, "YYYY-MM-DD". */
  date: string;
  currency: string;
  totalMinor: number;
  transactionCount: number;
}

/**
 * Groups posted-Transaction events into branch-local calendar-day
 * buckets, separately per currency (docs task Phase 4: "branch-timezone-
 * aware daily grouping" / "separate results per currency"). Pure and
 * deterministically ordered (date ascending, then currency) — the
 * caller resolves `timeZone` first via `resolveReportTimeZone`.
 */
export function bucketRevenueByLocalDate(events: readonly RevenueEvent[], timeZone: string): DailyRevenueBucket[] {
  const buckets = new Map<string, DailyRevenueBucket>();
  for (const event of events) {
    const date = utcToLocalDate(event.occurredAt, timeZone);
    const key = `${date}|${event.currency}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.totalMinor += event.amountMinor;
      existing.transactionCount += 1;
    } else {
      buckets.set(key, { date, currency: event.currency, totalMinor: event.amountMinor, transactionCount: 1 });
    }
  }
  return [...buckets.values()].sort((a, b) =>
    a.date === b.date ? a.currency.localeCompare(b.currency) : a.date.localeCompare(b.date),
  );
}
