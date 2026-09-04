import { BadRequestException } from '@nestjs/common';

/** A per-field business ceiling, deliberately far below the 32-bit
 * PostgreSQL `Int` column limit (`POSTGRES_INT_MAX` below) so that
 * summing several such fields together (a checkout's subtotal plus
 * adjustments, or several payment allocations) still has enormous
 * headroom before ever approaching the column's real limit — docs task
 * Phase 1: "Add explicit overflow validation." 500,000,000 minor units
 * is GHS 5,000,000.00 in a 2-decimal currency, far beyond any single
 * realistic checkout. */
export const MAX_MINOR_AMOUNT = 500_000_000;

/** The actual ceiling of a PostgreSQL 32-bit `Int` column — every
 * `*Minor` column in the financial schema uses this type. */
const POSTGRES_INT_MAX = 2_147_483_647;

/**
 * Rejects anything that is not a safe, non-overflowing integer number of
 * minor currency units — never trusted from a client without this check
 * (docs task Phase 1/2: "Never accept authoritative values from the
 * client" / "Add explicit overflow validation"). `min` defaults to 0
 * (allows a zero subtotal/total); callers that require a strictly
 * positive amount (an applied payment, an adjustment magnitude) pass
 * `{ min: 1 }`.
 */
export function assertSafeMoneyAmount(
  value: number,
  field: string,
  options: { min?: number } = {},
): void {
  const min = options.min ?? 0;
  if (!Number.isInteger(value)) {
    throw new BadRequestException(`${field} must be an integer number of minor currency units`);
  }
  if (value < min) {
    throw new BadRequestException(
      min > 0 ? `${field} must be greater than zero` : `${field} must not be negative`,
    );
  }
  if (value > MAX_MINOR_AMOUNT) {
    throw new BadRequestException(`${field} exceeds the maximum supported amount`);
  }
}

/**
 * Sums a set of already-validated minor-unit amounts, defensively
 * re-checking the running total against PostgreSQL's real `Int` column
 * ceiling as it accumulates — distinct from, and stricter about
 * overflow than, the per-field `MAX_MINOR_AMOUNT` business ceiling each
 * value was already checked against individually.
 */
export function sumMinorAmounts(values: readonly number[], field: string): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (total > POSTGRES_INT_MAX) {
      throw new BadRequestException(`${field} exceeds the maximum supported amount`);
    }
  }
  return total;
}
