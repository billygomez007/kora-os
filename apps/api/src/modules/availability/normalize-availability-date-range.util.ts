import { BadRequestException } from '@nestjs/common';
import { isValidLocalDate } from '../../common/scheduling/local-time.util.js';

/** Shared by both the public and organization-side availability
 * controllers: either a single `date` or a bounded `fromDate`/`toDate`
 * range must be supplied, and both normalize into the same
 * fromLocalDate/toLocalDate shape AvailabilityEngineService expects. */
export function normalizeAvailabilityDateRange(query: {
  date?: string;
  fromDate?: string;
  toDate?: string;
}): { fromLocalDate: string; toLocalDate: string } {
  if (query.date) {
    if (!isValidLocalDate(query.date)) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD date');
    }
    return { fromLocalDate: query.date, toLocalDate: query.date };
  }
  if (query.fromDate && query.toDate) {
    if (!isValidLocalDate(query.fromDate) || !isValidLocalDate(query.toDate)) {
      throw new BadRequestException('fromDate and toDate must be valid YYYY-MM-DD dates');
    }
    return { fromLocalDate: query.fromDate, toLocalDate: query.toDate };
  }
  throw new BadRequestException('Provide either date, or both fromDate and toDate');
}
