import { ConflictException, Injectable } from '@nestjs/common';
import { deriveCheckoutSettlement } from '../checkouts/checkout-settlement.util.js';
import { CheckoutStatus, PaymentRecordStatus } from '../../generated/prisma/client.js';
import type { Checkout, Prisma } from '../../generated/prisma/client.js';
import { TransactionPostingService, type PostTransactionActor } from '../transactions/transaction-posting.service.js';
import type { TransactionView } from '../transactions/transaction-view.js';

type TransactionClient = Prisma.TransactionClient;

const NON_TERMINAL_STATUS_MAP: Record<'DISPUTED' | 'AWAITING_VERIFICATION' | 'OPEN', CheckoutStatus> = {
  DISPUTED: CheckoutStatus.DISPUTED,
  AWAITING_VERIFICATION: CheckoutStatus.AWAITING_VERIFICATION,
  OPEN: CheckoutStatus.OPEN,
};

export interface CheckoutSettlementResult {
  checkout: Checkout;
  transaction: TransactionView | null;
}

/**
 * The single choke point every payment mutation (record, confirm,
 * dispute, void, resolve) passes through to keep a Checkout's derived
 * status correct and to post its Transaction exactly once (docs task
 * Phase 2/4/5). `lockCheckout` must be the very first database action of
 * every one of those mutations' own transaction, before it reads or
 * writes any PaymentRecord for that checkout — the row lock it takes is
 * the sole thing serializing every concurrent mutation against one
 * Checkout, which is what makes "lock the Checkout before calculating
 * confirmed totals" and "concurrent confirmations produce exactly one
 * Transaction" true (see TransactionPostingService's own header
 * comment). Every caller acquires this same lock as its first act, in
 * the same order, so no deadlock between two callers is possible.
 */
@Injectable()
export class CheckoutSettlementService {
  constructor(private readonly transactionPosting: TransactionPostingService) {}

  async lockCheckout(tx: TransactionClient, checkoutId: string): Promise<Checkout> {
    await tx.$queryRaw`SELECT id FROM checkouts WHERE id = ${checkoutId}::uuid FOR UPDATE`;
    return tx.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
  }

  /**
   * Recalculates and applies the derived status for an already
   * lock-held Checkout, posting its Transaction when confirmed payments
   * now exactly cover the total. A no-op for a Checkout already SETTLED
   * or VOIDED (both terminal, docs task Phase 2).
   */
  async recalculate(
    tx: TransactionClient,
    lockedCheckout: Checkout,
    actor: PostTransactionActor,
  ): Promise<CheckoutSettlementResult> {
    if (lockedCheckout.status === CheckoutStatus.SETTLED || lockedCheckout.status === CheckoutStatus.VOIDED) {
      return { checkout: lockedCheckout, transaction: null };
    }

    const activePayments = await tx.paymentRecord.findMany({
      where: { checkoutId: lockedCheckout.id, status: { not: PaymentRecordStatus.VOIDED } },
    });
    const hasUnresolvedDispute = activePayments.some((payment) => payment.status === PaymentRecordStatus.DISPUTED);
    const outcome = deriveCheckoutSettlement(
      activePayments.map((payment) => ({ status: payment.status, appliedAmountMinor: payment.appliedAmountMinor })),
      hasUnresolvedDispute,
      lockedCheckout.totalMinor,
    );

    if (outcome === 'READY_TO_SETTLE') {
      const transaction = await this.transactionPosting.postForCheckout(tx, lockedCheckout, actor);
      const settledCheckout = await tx.checkout.findUniqueOrThrow({ where: { id: lockedCheckout.id } });
      return { checkout: settledCheckout, transaction };
    }

    const newStatus = NON_TERMINAL_STATUS_MAP[outcome];
    if (newStatus !== lockedCheckout.status) {
      const result = await tx.checkout.updateMany({
        where: { id: lockedCheckout.id, version: lockedCheckout.version },
        data: { status: newStatus, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException('This checkout was already updated by someone else');
      }
    }
    const updated = await tx.checkout.findUniqueOrThrow({ where: { id: lockedCheckout.id } });
    return { checkout: updated, transaction: null };
  }
}
