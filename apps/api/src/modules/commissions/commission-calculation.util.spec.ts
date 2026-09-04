import { describe, expect, it } from 'vitest';
import { CommissionRuleType } from '../../generated/prisma/client.js';
import { calculateCommissionAmount, roundHalfUpDivision } from './commission-calculation.util.js';

describe('roundHalfUpDivision', () => {
  it('rounds exactly 0.5 up', () => {
    expect(roundHalfUpDivision(5n, 10n)).toBe(1n);
  });

  it('rounds down below 0.5', () => {
    expect(roundHalfUpDivision(4n, 10n)).toBe(0n);
  });

  it('rounds up above 0.5', () => {
    expect(roundHalfUpDivision(6n, 10n)).toBe(1n);
  });

  it('handles zero numerator', () => {
    expect(roundHalfUpDivision(0n, 10n)).toBe(0n);
  });

  it('handles an exact division with no remainder', () => {
    expect(roundHalfUpDivision(20n, 10n)).toBe(2n);
  });

  it('rejects a negative numerator', () => {
    expect(() => roundHalfUpDivision(-1n, 10n)).toThrow();
  });

  it('rejects a non-positive denominator', () => {
    expect(() => roundHalfUpDivision(1n, 0n)).toThrow();
  });

  it('handles a large basis-points-style division correctly', () => {
    // 12.5% of 333 = 41.625 -> rounds to 42
    expect(roundHalfUpDivision(333n * 1250n, 10_000n)).toBe(42n);
  });
});

describe('calculateCommissionAmount', () => {
  it('returns 0 for a null rule (NO_POLICY)', () => {
    expect(calculateCommissionAmount(null, 10_000)).toBe(0);
  });

  it('returns 0 for a NONE-type rule regardless of basis amount', () => {
    expect(calculateCommissionAmount({ type: CommissionRuleType.NONE, rateBasisPoints: null, fixedAmountMinor: null }, 10_000)).toBe(0);
  });

  it('returns the fixed amount for a FIXED-type rule regardless of basis amount', () => {
    expect(
      calculateCommissionAmount({ type: CommissionRuleType.FIXED, rateBasisPoints: null, fixedAmountMinor: 500 }, 999_999),
    ).toBe(500);
  });

  it('calculates a PERCENTAGE commission at 10% (1000 basis points)', () => {
    expect(
      calculateCommissionAmount({ type: CommissionRuleType.PERCENTAGE, rateBasisPoints: 1000, fixedAmountMinor: null }, 10_000),
    ).toBe(1000);
  });

  it('rounds a PERCENTAGE commission half-up to the nearest minor unit', () => {
    // 33.33% (3333 bp) of 100 = 33.33 -> rounds to 33
    expect(
      calculateCommissionAmount({ type: CommissionRuleType.PERCENTAGE, rateBasisPoints: 3333, fixedAmountMinor: null }, 100),
    ).toBe(33);
    // 33.35% (3335 bp) of 100 = 33.35 -> rounds to 33 (still below .5 of a unit... verify with an exact .5 case below)
  });

  it('rounds a PERCENTAGE commission with an exact .5 remainder up', () => {
    // 25% of 2 = 0.5 -> rounds up to 1
    expect(
      calculateCommissionAmount({ type: CommissionRuleType.PERCENTAGE, rateBasisPoints: 2500, fixedAmountMinor: null }, 2),
    ).toBe(1);
  });

  it('returns 0 for a 0-basis-point PERCENTAGE rule', () => {
    expect(
      calculateCommissionAmount({ type: CommissionRuleType.PERCENTAGE, rateBasisPoints: 0, fixedAmountMinor: null }, 10_000),
    ).toBe(0);
  });

  it('returns the full basis amount for a 10000-basis-point (100%) PERCENTAGE rule', () => {
    expect(
      calculateCommissionAmount({ type: CommissionRuleType.PERCENTAGE, rateBasisPoints: 10_000, fixedAmountMinor: null }, 12_345),
    ).toBe(12_345);
  });

  it('returns 0 when the basis amount is 0', () => {
    expect(
      calculateCommissionAmount({ type: CommissionRuleType.PERCENTAGE, rateBasisPoints: 5000, fixedAmountMinor: null }, 0),
    ).toBe(0);
  });
});
