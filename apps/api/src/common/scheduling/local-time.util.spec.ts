import {
  addDaysToLocalDate,
  compareLocalTimes,
  dayOfWeekForLocalDate,
  isValidLocalDate,
  isValidLocalTime,
  localToUtc,
  minutesToLocalTime,
  localTimeToMinutes,
  utcToLocalDate,
} from './local-time.util.js';

describe('local-time.util', () => {
  it('validates HH:mm strings', () => {
    expect(isValidLocalTime('09:00')).toBe(true);
    expect(isValidLocalTime('23:59')).toBe(true);
    expect(isValidLocalTime('24:00')).toBe(false);
    expect(isValidLocalTime('9:00')).toBe(false);
    expect(isValidLocalTime('09:60')).toBe(false);
    expect(isValidLocalTime('not-a-time')).toBe(false);
  });

  it('validates YYYY-MM-DD local dates', () => {
    expect(isValidLocalDate('2026-09-10')).toBe(true);
    expect(isValidLocalDate('2026-02-30')).toBe(false);
    expect(isValidLocalDate('09-10-2026')).toBe(false);
  });

  it('compares local times lexicographically', () => {
    expect(compareLocalTimes('09:00', '17:00')).toBeLessThan(0);
    expect(compareLocalTimes('17:00', '09:00')).toBeGreaterThan(0);
    expect(compareLocalTimes('09:00', '09:00')).toBe(0);
  });

  it('converts between local-time strings and minutes', () => {
    expect(localTimeToMinutes('09:30')).toBe(570);
    expect(minutesToLocalTime(570)).toBe('09:30');
    expect(minutesToLocalTime(0)).toBe('00:00');
  });

  it('converts a branch-local wall-clock time to the correct UTC instant (Africa/Accra, UTC+0, no DST)', () => {
    const utc = localToUtc('2026-09-10', '09:00', 'Africa/Accra');
    expect(utc.toISOString()).toBe('2026-09-10T09:00:00.000Z');
  });

  it('converts a branch-local wall-clock time in a positive-offset zone correctly', () => {
    // Africa/Johannesburg is UTC+2 year-round (no DST).
    const utc = localToUtc('2026-09-10', '09:00', 'Africa/Johannesburg');
    expect(utc.toISOString()).toBe('2026-09-10T07:00:00.000Z');
  });

  it('converts a branch-local wall-clock time across a DST boundary correctly', () => {
    // America/New_York spring-forwards at 2am on 2026-03-08 (the second
    // Sunday of March): 2026-03-07 is still EST (UTC-5); 2026-03-08 at
    // 09:00 is already EDT (UTC-4), since the 2am changeover has already
    // passed by then. The same local wall-clock time must produce
    // different UTC instants either side of the transition.
    const beforeDst = localToUtc('2026-03-07', '09:00', 'America/New_York');
    const afterDst = localToUtc('2026-03-08', '09:00', 'America/New_York');
    expect(beforeDst.toISOString()).toBe('2026-03-07T14:00:00.000Z');
    expect(afterDst.toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('round-trips a UTC instant back to the correct local date near a day boundary', () => {
    // 23:30 in Accra (UTC+0) on 2026-09-10 is still 2026-09-10 in Accra,
    // but already 2026-09-11 in a positive-offset zone.
    const instant = localToUtc('2026-09-10', '23:30', 'Africa/Accra');
    expect(utcToLocalDate(instant, 'Africa/Accra')).toBe('2026-09-10');
    expect(utcToLocalDate(instant, 'Africa/Johannesburg')).toBe('2026-09-11');
  });

  it('computes the correct day of week (0=Sunday..6=Saturday) in the given zone', () => {
    // 2026-09-10 is a Thursday.
    expect(dayOfWeekForLocalDate('2026-09-10', 'Africa/Accra')).toBe(4);
    // 2026-09-13 is a Sunday.
    expect(dayOfWeekForLocalDate('2026-09-13', 'Africa/Accra')).toBe(0);
  });

  it('adds days to a local date without a timezone', () => {
    expect(addDaysToLocalDate('2026-09-10', 1)).toBe('2026-09-11');
    expect(addDaysToLocalDate('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('throws rather than silently guessing for an invalid zone', () => {
    expect(() => localToUtc('2026-09-10', '09:00', 'Not/AZone')).toThrow();
  });
});
