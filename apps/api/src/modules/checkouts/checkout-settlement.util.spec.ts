import { describe, expect, it } from 'vitest';
import { PaymentRecordStatus } from '../../generated/prisma/client.js';
import { deriveCheckoutSettlement, type CheckoutSettlementPaymentSnapshot } from './checkout-settlement.util.js';

function payment(status: PaymentRecordStatus, appliedAmountMinor: number): CheckoutSettlementPaymentSnapshot {
  return { status, appliedAmountMinor };
}

describe('deriveCheckoutSettlement', () => {
  it('returns OPEN when there are no payments at all', () => {
    expect(deriveCheckoutSettlement([], false, 1000)).toBe('OPEN');
  });

  it('returns AWAITING_VERIFICATION when a payment is still RECORDED', () => {
    const outcome = deriveCheckoutSettlement([payment(PaymentRecordStatus.RECORDED, 1000)], false, 1000);
    expect(outcome).toBe('AWAITING_VERIFICATION');
  });

  it('returns OPEN when confirmed payments are below the total', () => {
    const outcome = deriveCheckoutSettlement([payment(PaymentRecordStatus.CONFIRMED, 500)], false, 1000);
    expect(outcome).toBe('OPEN');
  });

  it('returns READY_TO_SETTLE when confirmed payments exactly equal the total', () => {
    const outcome = deriveCheckoutSettlement(
      [payment(PaymentRecordStatus.CONFIRMED, 400), payment(PaymentRecordStatus.CONFIRMED, 600)],
      false,
      1000,
    );
    expect(outcome).toBe('READY_TO_SETTLE');
  });

  it('returns DISPUTED whenever an unresolved dispute exists, even if the total is otherwise covered', () => {
    const outcome = deriveCheckoutSettlement([payment(PaymentRecordStatus.CONFIRMED, 1000)], true, 1000);
    expect(outcome).toBe('DISPUTED');
  });

  it('prioritizes DISPUTED over AWAITING_VERIFICATION', () => {
    const outcome = deriveCheckoutSettlement([payment(PaymentRecordStatus.RECORDED, 1000)], true, 1000);
    expect(outcome).toBe('DISPUTED');
  });

  it('ignores VOIDED payments entirely when the caller has already filtered them out', () => {
    // The caller is responsible for excluding VOIDED rows before calling
    // this function — a checkout with only a voided payment and nothing
    // else behaves exactly like a checkout with no payments.
    const outcome = deriveCheckoutSettlement([], false, 1000);
    expect(outcome).toBe('OPEN');
  });

  it('treats a zero-total checkout with no payments as READY_TO_SETTLE', () => {
    // Not reachable in practice (Checkout creation rejects a zero total
    // outright), but the pure function itself is total-agnostic.
    expect(deriveCheckoutSettlement([], false, 0)).toBe('READY_TO_SETTLE');
  });
});
