import { describe, expect, it } from 'vitest';
import { CashLedgerEntryType } from '../../generated/prisma/client.js';
import { calculateExpectedClosingCashMinor } from './cash-expected-balance.util.js';

describe('calculateExpectedClosingCashMinor', () => {
  it('returns zero for no entries', () => {
    expect(calculateExpectedClosingCashMinor([])).toBe(0);
  });

  it('adds the opening float, payments received, and manual cash in', () => {
    const total = calculateExpectedClosingCashMinor([
      { type: CashLedgerEntryType.OPENING_FLOAT, amountMinor: 10_000 },
      { type: CashLedgerEntryType.PAYMENT_RECEIVED, amountMinor: 5_000 },
      { type: CashLedgerEntryType.CASH_IN, amountMinor: 1_000 },
    ]);
    expect(total).toBe(16_000);
  });

  it('subtracts manual cash out, safe drops, and executed cash refunds', () => {
    const total = calculateExpectedClosingCashMinor([
      { type: CashLedgerEntryType.OPENING_FLOAT, amountMinor: 10_000 },
      { type: CashLedgerEntryType.CASH_OUT, amountMinor: 2_000 },
      { type: CashLedgerEntryType.SAFE_DROP, amountMinor: 3_000 },
      { type: CashLedgerEntryType.REFUND_PAID, amountMinor: 1_000 },
    ]);
    expect(total).toBe(4_000);
  });

  it('matches the full documented formula', () => {
    const total = calculateExpectedClosingCashMinor([
      { type: CashLedgerEntryType.OPENING_FLOAT, amountMinor: 20_000 },
      { type: CashLedgerEntryType.PAYMENT_RECEIVED, amountMinor: 8_000 },
      { type: CashLedgerEntryType.PAYMENT_RECEIVED, amountMinor: 5_500 },
      { type: CashLedgerEntryType.CASH_IN, amountMinor: 2_000 },
      { type: CashLedgerEntryType.CASH_OUT, amountMinor: 1_500 },
      { type: CashLedgerEntryType.SAFE_DROP, amountMinor: 10_000 },
      { type: CashLedgerEntryType.REFUND_PAID, amountMinor: 3_000 },
    ]);
    // 20000 + 8000 + 5500 + 2000 - 1500 - 10000 - 3000
    expect(total).toBe(21_000);
  });

  it('is order-independent', () => {
    const entries = [
      { type: CashLedgerEntryType.OPENING_FLOAT, amountMinor: 5_000 },
      { type: CashLedgerEntryType.CASH_OUT, amountMinor: 2_000 },
      { type: CashLedgerEntryType.PAYMENT_RECEIVED, amountMinor: 1_000 },
    ];
    const reversed = [...entries].reverse();
    expect(calculateExpectedClosingCashMinor(entries)).toBe(calculateExpectedClosingCashMinor(reversed));
  });
});
