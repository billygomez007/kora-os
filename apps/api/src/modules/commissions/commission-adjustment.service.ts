import { Injectable } from '@nestjs/common';
import { CommissionAccrualKind, CommissionRuleType } from '../../generated/prisma/client.js';
import type { Prisma, Transaction as TransactionModel, TransactionLineItem } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { calculateFixedAdjustmentAmount, calculatePercentageAdjustmentBasis } from './commission-adjustment-calculation.util.js';
import { toCommissionAccrualView, type CommissionAccrualView } from './commission-accrual-view.js';
import { calculateCommissionAmount } from './commission-calculation.util.js';
import type { AccrualActor } from './commission-accrual.service.js';

type TransactionClient = Prisma.TransactionClient;

export interface CorrectiveLineItemPairing {
  correctiveLineItem: TransactionLineItem;
  originalTransactionLineItemId: string;
  /** The original TransactionLineItem's own full gross price — the
   * denominator every proration below is computed against. */
  originalLineAmountMinor: number;
}

/**
 * Calculates and persists one immutable, corrective CommissionAccrual
 * per corrective line item, derived exclusively from the *original*
 * EARNED accrual's own immutable snapshot (docs task Phase 4: "Never
 * resolve a correction using the current CommissionRule") — the current
 * CommissionRule is never consulted here at all, even if it has since
 * changed or been deactivated. Called only from
 * TransactionCorrectionsService.execute, inside the same database
 * transaction that posts the corrective Transaction, so a failure here
 * rolls back the whole execution.
 */
@Injectable()
export class CommissionAdjustmentService {
  constructor(private readonly auditService: AuditService) {}

  async adjustForCorrection(
    tx: TransactionClient,
    correctiveTransaction: TransactionModel,
    pairings: readonly CorrectiveLineItemPairing[],
    kind: typeof CommissionAccrualKind.REFUNDED | typeof CommissionAccrualKind.REVERSED,
    actor: AccrualActor,
  ): Promise<CommissionAccrualView[]> {
    const created: CommissionAccrualView[] = [];

    for (const pairing of pairings) {
      const originalAccrual = await tx.commissionAccrual.findUnique({
        where: {
          organizationId_transactionLineItemId: {
            organizationId: correctiveTransaction.organizationId,
            transactionLineItemId: pairing.originalTransactionLineItemId,
          },
        },
      });
      // Every SALE line item always gets an accrual row (even a
      // zero-value NO_POLICY one) — this is defensive only.
      if (!originalAccrual) {
        continue;
      }

      const priorAdjustments = await tx.commissionAccrual.findMany({
        where: { originalAccrualId: originalAccrual.id },
        select: { calculatedAmountMinor: true },
      });
      const alreadyAdjustedMinor = priorAdjustments.reduce((sum, row) => sum + row.calculatedAmountMinor, 0);

      const requestedAmountMinor = pairing.correctiveLineItem.priceMinorSnapshot;
      let calculatedAmountMinor: number;
      if (originalAccrual.ruleTypeSnapshot === CommissionRuleType.PERCENTAGE) {
        const refundedBasisAmountMinor = calculatePercentageAdjustmentBasis(
          originalAccrual.basisAmountMinor,
          requestedAmountMinor,
          pairing.originalLineAmountMinor,
        );
        const fresh = calculateCommissionAmount(
          { type: CommissionRuleType.PERCENTAGE, rateBasisPoints: originalAccrual.rateBasisPointsSnapshot, fixedAmountMinor: null },
          refundedBasisAmountMinor,
        );
        calculatedAmountMinor = Math.min(fresh, Math.max(originalAccrual.calculatedAmountMinor - alreadyAdjustedMinor, 0));
      } else if (originalAccrual.ruleTypeSnapshot === CommissionRuleType.FIXED) {
        calculatedAmountMinor = calculateFixedAdjustmentAmount(
          originalAccrual.calculatedAmountMinor,
          alreadyAdjustedMinor,
          requestedAmountMinor,
          pairing.originalLineAmountMinor,
        );
      } else {
        // NONE or NO_POLICY — always an explicit zero-value adjustment
        // (docs task Phase 4: "create explicit zero-value adjustment
        // records").
        calculatedAmountMinor = 0;
      }

      const row = await tx.commissionAccrual.create({
        data: {
          organizationId: correctiveTransaction.organizationId,
          transactionId: correctiveTransaction.id,
          transactionLineItemId: pairing.correctiveLineItem.id,
          staffProfileId: originalAccrual.staffProfileId,
          commissionRuleId: originalAccrual.commissionRuleId,
          kind,
          originalAccrualId: originalAccrual.id,
          source: originalAccrual.source,
          ruleTypeSnapshot: originalAccrual.ruleTypeSnapshot,
          rateBasisPointsSnapshot: originalAccrual.rateBasisPointsSnapshot,
          fixedAmountMinorSnapshot: originalAccrual.fixedAmountMinorSnapshot,
          basisSnapshot: originalAccrual.basisSnapshot,
          basisAmountMinor: requestedAmountMinor,
          calculatedAmountMinor,
          currency: originalAccrual.currency,
          calculatedAt: new Date(),
        },
      });
      created.push(toCommissionAccrualView(row));
    }

    if (created.length > 0) {
      const totalAdjustedMinor = created.reduce((sum, accrual) => sum + accrual.calculatedAmountMinor, 0);
      await this.auditService.record(
        {
          organizationId: actor.organizationId,
          branchId: correctiveTransaction.branchId,
          actorUserId: actor.userId,
          actorMembershipId: actor.membershipId,
          action: 'commission.accrued',
          entityType: 'transaction',
          entityId: correctiveTransaction.id,
          requestId: actor.requestId,
          source: 'commissions',
          newState: { kind, accrualCount: created.length, totalAdjustedMinor, currency: correctiveTransaction.currency },
        },
        tx,
      );
    }

    return created;
  }
}
