import { describe, expect, it } from 'vitest';
import { calculateFixedAdjustmentAmount, calculatePercentageAdjustmentBasis } from './commission-adjustment-calculation.util.js';

describe('calculatePercentageAdjustmentBasis', () => {
  it('returns the full original basis for a full-line refund', () => {
    expect(calculatePercentageAdjustmentBasis(10_000, 5_000, 5_000)).toBe(10_000);
  });

  it('halves the basis for a half-line refund', () => {
    expect(calculatePercentageAdjustmentBasis(10_000, 2_500, 5_000)).toBe(5_000);
  });

  it('rounds half up', () => {
    // 999 * 1 / 3 = 333, exact, no rounding needed here; use a case that lands on .5
    expect(calculatePercentageAdjustmentBasis(1, 1, 2)).toBe(1); // 0.5 -> rounds up to 1
  });

  it('returns zero when the original line amount is zero', () => {
    expect(calculatePercentageAdjustmentBasis(10_000, 0, 0)).toBe(0);
  });
});

describe('calculateFixedAdjustmentAmount', () => {
  it('returns the exact remaining amount for a full-line refund, bypassing proration', () => {
    // Even with an original amount that would prorate awkwardly, a full
    // correction always returns the exact remaining balance.
    expect(calculateFixedAdjustmentAmount(1_000, 0, 3_333, 3_333)).toBe(1_000);
  });

  it('prorates for a partial refund', () => {
    expect(calculateFixedAdjustmentAmount(1_000, 0, 2_500, 5_000)).toBe(500);
  });

  it('never exceeds what remains after prior adjustments', () => {
    // Original accrual was 1000, already adjusted 900 by a prior partial
    // refund; a second partial refund proportionally computes 300, but
    // must be capped at the 100 that actually remains.
    expect(calculateFixedAdjustmentAmount(1_000, 900, 3_000, 10_000)).toBe(100);
  });

  it('a full-line correction after prior partial adjustments still returns exactly the remainder', () => {
    expect(calculateFixedAdjustmentAmount(1_000, 400, 5_000, 5_000)).toBe(600);
  });

  it('never returns a negative amount even if already-adjusted somehow exceeds the original', () => {
    expect(calculateFixedAdjustmentAmount(1_000, 1_000, 100, 1_000)).toBe(0);
  });
});
