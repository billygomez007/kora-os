import { describe, expect, it } from 'vitest';
import { MAX_MINOR_AMOUNT, assertSafeMoneyAmount, sumMinorAmounts } from './assert-safe-money-amount.util.js';

describe('assertSafeMoneyAmount', () => {
  it('accepts zero when min defaults to 0', () => {
    expect(() => assertSafeMoneyAmount(0, 'amount')).not.toThrow();
  });

  it('rejects a negative amount', () => {
    expect(() => assertSafeMoneyAmount(-1, 'amount')).toThrow();
  });

  it('rejects zero when min is 1', () => {
    expect(() => assertSafeMoneyAmount(0, 'amount', { min: 1 })).toThrow();
  });

  it('accepts a positive amount when min is 1', () => {
    expect(() => assertSafeMoneyAmount(1, 'amount', { min: 1 })).not.toThrow();
  });

  it('rejects a non-integer amount', () => {
    expect(() => assertSafeMoneyAmount(10.5, 'amount')).toThrow();
  });

  it('rejects an amount above MAX_MINOR_AMOUNT', () => {
    expect(() => assertSafeMoneyAmount(MAX_MINOR_AMOUNT + 1, 'amount')).toThrow();
  });

  it('accepts an amount exactly at MAX_MINOR_AMOUNT', () => {
    expect(() => assertSafeMoneyAmount(MAX_MINOR_AMOUNT, 'amount')).not.toThrow();
  });
});

describe('sumMinorAmounts', () => {
  it('sums an empty array to zero', () => {
    expect(sumMinorAmounts([], 'amount')).toBe(0);
  });

  it('sums several amounts', () => {
    expect(sumMinorAmounts([100, 200, 300], 'amount')).toBe(600);
  });

  it('throws when the running total exceeds the PostgreSQL Int column ceiling', () => {
    expect(() => sumMinorAmounts([MAX_MINOR_AMOUNT, MAX_MINOR_AMOUNT, MAX_MINOR_AMOUNT, MAX_MINOR_AMOUNT, MAX_MINOR_AMOUNT], 'amount')).toThrow();
  });
});
