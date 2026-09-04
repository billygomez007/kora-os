import { describe, expect, it } from 'vitest';
import { parseReportDateRange, resolveReportTimeZone } from './report-date-range.util.js';

describe('parseReportDateRange', () => {
  it('parses a valid range', () => {
    const range = parseReportDateRange('2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z');
    expect(range.from.getTime()).toBeLessThan(range.to.getTime());
  });

  it('rejects a missing from', () => {
    expect(() => parseReportDateRange(undefined, '2026-01-31T00:00:00Z')).toThrow();
  });

  it('rejects a missing to', () => {
    expect(() => parseReportDateRange('2026-01-01T00:00:00Z', undefined)).toThrow();
  });

  it('rejects an invalid date string', () => {
    expect(() => parseReportDateRange('not-a-date', '2026-01-31T00:00:00Z')).toThrow();
  });

  it('rejects from after to', () => {
    expect(() => parseReportDateRange('2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z')).toThrow();
  });

  it('accepts a range exactly at the 366-day ceiling', () => {
    expect(() => parseReportDateRange('2026-01-01T00:00:00Z', '2027-01-02T00:00:00Z')).not.toThrow();
  });

  it('rejects a range beyond the 366-day ceiling', () => {
    expect(() => parseReportDateRange('2026-01-01T00:00:00Z', '2027-01-03T00:00:00Z')).toThrow();
  });

  it('accepts identical from and to (a single instant)', () => {
    expect(() => parseReportDateRange('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).not.toThrow();
  });
});

describe('resolveReportTimeZone', () => {
  it('uses the branch timezone when given, ignoring any explicit override', () => {
    expect(resolveReportTimeZone('Africa/Accra', undefined)).toBe('Africa/Accra');
    expect(resolveReportTimeZone('Africa/Accra', 'America/New_York')).toBe('Africa/Accra');
  });

  it('requires an explicit timezone when no branch is scoped', () => {
    expect(() => resolveReportTimeZone(undefined, undefined)).toThrow();
  });

  it('accepts a valid explicit IANA timezone when no branch is scoped', () => {
    expect(resolveReportTimeZone(undefined, 'America/New_York')).toBe('America/New_York');
  });

  it('rejects an invalid explicit timezone string', () => {
    expect(() => resolveReportTimeZone(undefined, 'Not/AZone')).toThrow();
  });
});
