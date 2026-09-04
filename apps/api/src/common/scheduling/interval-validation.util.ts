import { BadRequestException } from '@nestjs/common';
import { compareLocalTimes } from './local-time.util.js';

export interface LocalInterval {
  startLocalTime: string;
  endLocalTime: string;
}

/** A single interval must start strictly before it ends. */
export function assertValidIntervalOrder(interval: LocalInterval): void {
  if (compareLocalTimes(interval.startLocalTime, interval.endLocalTime) >= 0) {
    throw new BadRequestException(
      `startLocalTime (${interval.startLocalTime}) must be before endLocalTime (${interval.endLocalTime})`,
    );
  }
}

/**
 * Rejects any pair of intervals in the same group (already filtered to
 * one day-of-week, or one exception date, by the caller) that overlap —
 * docs task Phase 13/14: "Validation against overlapping or invalid
 * intervals" / "No overlapping intervals that would make availability
 * ambiguous". Touching intervals (one ends exactly when the next starts)
 * are allowed, the same "adjacent is fine, overlap is not" rule the
 * double-booking exclusion constraint uses.
 */
export function assertNoOverlappingIntervals<T extends LocalInterval>(intervals: T[]): void {
  for (const interval of intervals) {
    assertValidIntervalOrder(interval);
  }
  const sorted = [...intervals].sort((a, b) => compareLocalTimes(a.startLocalTime, b.startLocalTime));
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (compareLocalTimes(current.startLocalTime, previous.endLocalTime) < 0) {
      throw new BadRequestException(
        `Overlapping intervals: ${previous.startLocalTime}-${previous.endLocalTime} and ${current.startLocalTime}-${current.endLocalTime}`,
      );
    }
  }
}
