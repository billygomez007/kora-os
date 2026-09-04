import { sumMinorAmounts } from '../../common/money/assert-safe-money-amount.util.js';
import { PaymentRecordStatus } from '../../generated/prisma/client.js';

export interface CheckoutSettlementPaymentSnapshot {
  status: PaymentRecordStatus;
  appliedAmountMinor: number;
}

export type CheckoutSettlementOutcome = 'DISPUTED' | 'AWAITING_VERIFICATION' | 'OPEN' | 'READY_TO_SETTLE';

/**
 * The centralized Checkout status recalculation rule (docs task Phase 2,
 * verbatim): "If an unresolved dispute exists: DISPUTED. Otherwise, if
 * any payment awaits confirmation: AWAITING_VERIFICATION. Otherwise, if
 * confirmed payments are below the total: OPEN. If confirmed applied
 * payments exactly equal the total: settle by posting one Transaction
 * atomically."
 *
 * Pure and side-effect-free — the caller (CheckoutSettlementService)
 * resolves every input from a row-locked Checkout and its payments
 * first, then applies whichever outcome this returns (updating status,
 * or invoking TransactionPostingService for `READY_TO_SETTLE`). A VOIDED
 * or already-SETTLED Checkout is never passed through this function —
 * the caller short-circuits on a terminal Checkout before ever calling
 * it (both are terminal states with no recalculation, docs task Phase
 * 2: "SETTLED and VOIDED are terminal").
 *
 * `payments` must already exclude VOIDED payment records — a voided
 * payment no longer contributes to the balance in any way (docs task
 * Phase 2), so it is deliberately not this function's concern to filter
 * it out; the caller's query is.
 */
export function deriveCheckoutSettlement(
  payments: readonly CheckoutSettlementPaymentSnapshot[],
  hasUnresolvedDispute: boolean,
  totalMinor: number,
): CheckoutSettlementOutcome {
  if (hasUnresolvedDispute) {
    return 'DISPUTED';
  }
  const hasPendingConfirmation = payments.some((payment) => payment.status === PaymentRecordStatus.RECORDED);
  if (hasPendingConfirmation) {
    return 'AWAITING_VERIFICATION';
  }
  const confirmedTotal = sumMinorAmounts(
    payments.filter((payment) => payment.status === PaymentRecordStatus.CONFIRMED).map((payment) => payment.appliedAmountMinor),
    'confirmed applied payments',
  );
  return confirmedTotal < totalMinor ? 'OPEN' : 'READY_TO_SETTLE';
}
