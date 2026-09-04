import { describe, expect, it } from 'vitest';
import { bucketRevenueByLocalDate } from './report-grouping.util.js';

const ZONE = 'Africa/Accra'; // UTC+0, no DST — simple, deterministic
const NY = 'America/New_York'; // UTC-5 (winter) — exercises real offset conversion

describe('bucketRevenueByLocalDate', () => {
  it('returns an empty array for no events', () => {
    expect(bucketRevenueByLocalDate([], ZONE)).toEqual([]);
  });

  it('groups two same-day events into one bucket', () => {
    const buckets = bucketRevenueByLocalDate(
      [
        { occurredAt: new Date('2026-03-05T08:00:00Z'), amountMinor: 1000, currency: 'GHS' },
        { occurredAt: new Date('2026-03-05T20:00:00Z'), amountMinor: 500, currency: 'GHS' },
      ],
      ZONE,
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ date: '2026-03-05', currency: 'GHS', totalMinor: 1500, transactionCount: 2 });
  });

  it('keeps different currencies in separate buckets on the same day', () => {
    const buckets = bucketRevenueByLocalDate(
      [
        { occurredAt: new Date('2026-03-05T08:00:00Z'), amountMinor: 1000, currency: 'GHS' },
        { occurredAt: new Date('2026-03-05T08:00:00Z'), amountMinor: 20, currency: 'USD' },
      ],
      ZONE,
    );
    expect(buckets).toHaveLength(2);
    expect(buckets.map((b) => b.currency).sort()).toEqual(['GHS', 'USD']);
  });

  it('assigns an event to the correct branch-local calendar day across a UTC offset boundary', () => {
    // 23:30 in America/New_York on Jan 1 (UTC-5) is 04:30 UTC on Jan 2 —
    // must still bucket to Jan 1 local, not Jan 2.
    const buckets = bucketRevenueByLocalDate(
      [{ occurredAt: new Date('2026-01-02T04:30:00Z'), amountMinor: 100, currency: 'USD' }],
      NY,
    );
    expect(buckets[0].date).toBe('2026-01-01');
  });

  it('returns buckets ordered by date ascending, then currency', () => {
    const buckets = bucketRevenueByLocalDate(
      [
        { occurredAt: new Date('2026-03-06T08:00:00Z'), amountMinor: 1, currency: 'USD' },
        { occurredAt: new Date('2026-03-06T08:00:00Z'), amountMinor: 1, currency: 'GHS' },
        { occurredAt: new Date('2026-03-05T08:00:00Z'), amountMinor: 1, currency: 'GHS' },
      ],
      ZONE,
    );
    expect(buckets.map((b) => `${b.date}|${b.currency}`)).toEqual(['2026-03-05|GHS', '2026-03-06|GHS', '2026-03-06|USD']);
  });
});
