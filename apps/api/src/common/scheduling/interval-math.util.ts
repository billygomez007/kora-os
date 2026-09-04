import { localTimeToMinutes, minutesToLocalTime } from './local-time.util.js';

export interface LocalTimeInterval {
  startLocalTime: string;
  endLocalTime: string;
}

type MinuteRange = [number, number];

function toMinuteRanges(intervals: LocalTimeInterval[]): MinuteRange[] {
  return intervals.map((interval) => [
    localTimeToMinutes(interval.startLocalTime),
    localTimeToMinutes(interval.endLocalTime),
  ]);
}

function fromMinuteRanges(ranges: MinuteRange[]): LocalTimeInterval[] {
  return ranges.map(([start, end]) => ({
    startLocalTime: minutesToLocalTime(start),
    endLocalTime: minutesToLocalTime(end),
  }));
}

/** Sorts and merges touching/overlapping ranges into their minimal
 * disjoint form. */
function mergeMinuteRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: MinuteRange[] = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

function intersectMinuteRanges(a: MinuteRange[], b: MinuteRange[]): MinuteRange[] {
  const result: MinuteRange[] = [];
  for (const [aStart, aEnd] of a) {
    for (const [bStart, bEnd] of b) {
      const start = Math.max(aStart, bStart);
      const end = Math.min(aEnd, bEnd);
      if (start < end) {
        result.push([start, end]);
      }
    }
  }
  return mergeMinuteRanges(result);
}

function subtractMinuteRanges(base: MinuteRange[], remove: MinuteRange[]): MinuteRange[] {
  let result = mergeMinuteRanges(base);
  for (const [removeStart, removeEnd] of remove) {
    const next: MinuteRange[] = [];
    for (const [start, end] of result) {
      if (removeEnd <= start || removeStart >= end) {
        next.push([start, end]);
        continue;
      }
      if (removeStart > start) {
        next.push([start, removeStart]);
      }
      if (removeEnd < end) {
        next.push([removeEnd, end]);
      }
    }
    result = next;
  }
  return result;
}

/** Branch-open intervals ∩ staff-available intervals — a provider is
 * bookable only where both hold (docs task Phase 14: "Branch opening
 * hours and staff availability are separate. A provider is bookable only
 * during the intersection of both"). */
export function intersectLocalIntervals(
  a: LocalTimeInterval[],
  b: LocalTimeInterval[],
): LocalTimeInterval[] {
  return fromMinuteRanges(intersectMinuteRanges(toMinuteRanges(a), toMinuteRanges(b)));
}

/** Adds SPECIAL_AVAILABILITY windows on top of the recurring rule. */
export function mergeLocalIntervals(...groups: LocalTimeInterval[][]): LocalTimeInterval[] {
  return fromMinuteRanges(mergeMinuteRanges(groups.flatMap(toMinuteRanges)));
}

/** Removes TIME_OFF/SICK_LEAVE/HOLIDAY windows from availability. */
export function subtractLocalIntervals(
  base: LocalTimeInterval[],
  remove: LocalTimeInterval[],
): LocalTimeInterval[] {
  return fromMinuteRanges(subtractMinuteRanges(toMinuteRanges(base), toMinuteRanges(remove)));
}
