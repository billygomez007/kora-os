import { roundHalfUpDivision } from './commission-calculation.util.js';

/**
 * PERCENTAGE correction rule (docs task Phase 4): "calculate the
 * adjustment from the refunded commission basis using the original
 * snapshotted basis points" — recomputed fresh, not prorated from the
 * original result. This function derives that refunded *basis* (the
 * proportional share of the original accrual's own basisAmountMinor
 * corresponding to the fraction of the original line being refunded/
 * reversed); the caller then feeds it into `calculateCommissionAmount`
 * with the original rule snapshot to get the adjustment amount itself —
 * the exact same rounding path a normal accrual already uses, just
 * applied to a shrunk basis.
 */
export function calculatePercentageAdjustmentBasis(
  originalAccrualBasisAmountMinor: number,
  requestedAmountMinor: number,
  originalLineAmountMinor: number,
): number {
  if (originalLineAmountMinor <= 0) {
    return 0;
  }
  return Number(
    roundHalfUpDivision(BigInt(originalAccrualBasisAmountMinor) * BigInt(requestedAmountMinor), BigInt(originalLineAmountMinor)),
  );
}

/**
 * FIXED correction rule (docs task Phase 4): "full refund/reversal
 * reverses the remaining original fixed accrual; partial refund
 * prorates the original fixed accrual by refunded basis/original
 * basis." A full-line correction (`requestedAmountMinor >=
 * originalLineAmountMinor`) always returns exactly the remaining
 * balance — bypassing the proportional formula entirely — so a full
 * reversal can never be left short by a rounding residue. A partial
 * correction prorates the *original calculated amount* (not the rate
 * itself, since FIXED has no rate), then is still capped at whatever
 * remains, so cumulative adjustments can never exceed the original
 * accrual regardless of calling order (docs task Phase 4: "cumulative
 * adjustments must never exceed the original accrual").
 */
export function calculateFixedAdjustmentAmount(
  originalCalculatedAmountMinor: number,
  alreadyAdjustedMinor: number,
  requestedAmountMinor: number,
  originalLineAmountMinor: number,
): number {
  const remaining = Math.max(originalCalculatedAmountMinor - alreadyAdjustedMinor, 0);
  if (originalLineAmountMinor <= 0 || requestedAmountMinor >= originalLineAmountMinor) {
    return remaining;
  }
  const prorated = Number(
    roundHalfUpDivision(BigInt(originalCalculatedAmountMinor) * BigInt(requestedAmountMinor), BigInt(originalLineAmountMinor)),
  );
  return Math.min(prorated, remaining);
}
