import { BadRequestException } from '@nestjs/common';
import { IANAZone } from 'luxon';

const MAX_RANGE_DAYS = 366;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ReportDateRange {
  from: Date;
  to: Date;
}

/**
 * Validates and parses a report date range: both bounds required,
 * `from` not after `to`, and the span capped at 366 days (docs task
 * Phase 4) — a deliberately generous but finite ceiling that keeps
 * every report query bounded without the caller having to guess an
 * explicit row limit.
 */
export function parseReportDateRange(from: string | undefined, to: string | undefined): ReportDateRange {
  if (!from || !to) {
    throw new BadRequestException('Both from and to are required');
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new BadRequestException('from and to must be valid dates');
  }
  if (fromDate > toDate) {
    throw new BadRequestException('from must not be after to');
  }
  if ((toDate.getTime() - fromDate.getTime()) / MILLIS_PER_DAY > MAX_RANGE_DAYS) {
    throw new BadRequestException(`Date range must not exceed ${MAX_RANGE_DAYS} days`);
  }
  return { from: fromDate, to: toDate };
}

/**
 * Resolves which single IANA timezone a report's daily/local-date
 * grouping should use. A branch-scoped report always uses that branch's
 * own timezone. An organization-wide report spanning potentially many
 * branches with different timezones has no single correct answer on its
 * own, so it requires an explicit, validated `timezone` query parameter
 * instead of silently picking one or mixing ambiguous local-day
 * boundaries (docs task Phase 4: "Do not silently mix ambiguous local
 * day boundaries").
 */
export function resolveReportTimeZone(branchTimeZone: string | undefined, explicitTimeZone: string | undefined): string {
  if (branchTimeZone) {
    return branchTimeZone;
  }
  if (!explicitTimeZone) {
    throw new BadRequestException(
      'An explicit timezone query parameter is required for an organization-wide (multi-branch) report',
    );
  }
  if (!IANAZone.isValidZone(explicitTimeZone)) {
    throw new BadRequestException('timezone must be a valid IANA time zone identifier');
  }
  return explicitTimeZone;
}
