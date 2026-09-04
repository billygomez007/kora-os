import { CommissionRuleType } from '../../generated/prisma/client.js';

const BASIS_POINTS_DENOMINATOR = 10_000n;

/**
 * Exact integer round-half-up of `numerator / denominator`, both BigInt
 * and non-negative — `floor((2*numerator + denominator) / (2*denominator))`,
 * the standard integer form that never computes a fractional intermediate
 * value, so no floating-point rounding error can creep in (docs task
 * Phase 2: "Percentage commissions must round half-up to the nearest
 * minor currency unit").
 */
export function roundHalfUpDivision(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error('roundHalfUpDivision requires a positive denominator');
  }
  if (numerator < 0n) {
    throw new Error('roundHalfUpDivision requires a non-negative numerator');
  }
  return (2n * numerator + denominator) / (2n * denominator);
}

export interface CommissionRuleForCalculation {
  type: CommissionRuleType;
  rateBasisPoints: number | null;
  fixedAmountMinor: number | null;
}

/**
 * Pure calculation from an already scope- and currency-matched rule (or
 * `null`, the NO_POLICY case) plus a basis amount to the commission
 * owed, in integer minor units. Returns exactly 0 for a NONE-type rule
 * or a `null` rule — a missing or explicitly-zero policy is never an
 * error and never blocks Transaction posting (docs task Phase 1:
 * "Missing policy must not prevent legitimate transaction posting").
 * `basisAmountMinor` is assumed already validated non-negative by the
 * caller (it is itself either a TransactionLineItem price snapshot or a
 * largest-remainder-allocated net share of one — see
 * commission-adjustment-allocation.util.ts).
 */
export function calculateCommissionAmount(
  rule: CommissionRuleForCalculation | null,
  basisAmountMinor: number,
): number {
  if (!rule || rule.type === CommissionRuleType.NONE) {
    return 0;
  }
  if (rule.type === CommissionRuleType.FIXED) {
    return rule.fixedAmountMinor!;
  }
  const amount = roundHalfUpDivision(
    BigInt(basisAmountMinor) * BigInt(rule.rateBasisPoints!),
    BASIS_POINTS_DENOMINATOR,
  );
  return Number(amount);
}
