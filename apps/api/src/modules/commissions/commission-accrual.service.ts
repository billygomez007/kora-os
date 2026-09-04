import { Injectable } from '@nestjs/common';
import { CommissionAccrualSource, CommissionCalculationBasis, CommissionRuleType } from '../../generated/prisma/client.js';
import type { Prisma, Transaction as TransactionModel, TransactionLineItem } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { allocateAdjustmentsAcrossLines } from './commission-adjustment-allocation.util.js';
import { toCommissionAccrualView, type CommissionAccrualView } from './commission-accrual-view.js';
import { calculateCommissionAmount } from './commission-calculation.util.js';
import { selectMostSpecificRule } from './commission-rule-precedence.util.js';

type TransactionClient = Prisma.TransactionClient;

export interface AccrualActor {
  organizationId: string;
  userId: string;
  membershipId: string;
  requestId: string;
}

/**
 * Calculates and persists one immutable CommissionAccrual per
 * TransactionLineItem, derived exclusively from the immutable
 * Transaction/TransactionLineItem snapshots handed in — never from
 * mutable Service prices, current checkout data, or PaymentRecord
 * amounts (docs task Phase 2). Called only from TransactionPostingService,
 * inside the same database transaction that posts the parent Transaction,
 * so a failure here rolls back the Transaction too, and a failure
 * anywhere else in that same transaction leaves no accrual behind.
 *
 * `accrueForTransaction` is deliberately idempotent — it first loads any
 * accruals that already exist for this transaction and only creates the
 * ones still missing — so the exact same call also serves as the
 * internal `ensureDerivedRecords` repair path (see TransactionPostingService.
 * ensureDerivedRecords), with no separate code path to keep in sync.
 */
@Injectable()
export class CommissionAccrualService {
  constructor(private readonly auditService: AuditService) {}

  async accrueForTransaction(
    tx: TransactionClient,
    transaction: TransactionModel,
    lineItems: readonly TransactionLineItem[],
    actor: AccrualActor,
  ): Promise<CommissionAccrualView[]> {
    if (lineItems.length === 0) {
      return [];
    }

    const existingAccruals = await tx.commissionAccrual.findMany({ where: { transactionId: transaction.id } });
    const alreadyAccruedLineItemIds = new Set(existingAccruals.map((accrual) => accrual.transactionLineItemId));
    const pendingLineItems = lineItems.filter((item) => !alreadyAccruedLineItemIds.has(item.id));
    if (pendingLineItems.length === 0) {
      return existingAccruals.map(toCommissionAccrualView);
    }

    // Computed once across every line item of the transaction (not only
    // the pending ones) so the allocation is always the same regardless
    // of which subset happens to be pending on a given call — the
    // allocation is a property of the whole transaction, not of any one
    // repair attempt.
    const netAllocation = allocateAdjustmentsAcrossLines(
      lineItems.map((item) => ({ lineId: item.id, grossAmountMinor: item.priceMinorSnapshot, displayOrder: item.displayOrder })),
      transaction.adjustmentTotalMinor,
    );

    const candidateRules = await tx.commissionRule.findMany({
      where: {
        organizationId: transaction.organizationId,
        effectiveFrom: { lte: transaction.postedAt },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: transaction.postedAt } }],
      },
    });

    const created: CommissionAccrualView[] = [];
    for (const item of pendingLineItems) {
      const matchedRule = selectMostSpecificRule(
        candidateRules,
        { branchId: transaction.branchId, staffProfileId: item.staffProfileId, serviceId: item.serviceId },
        transaction.currency,
      );

      const basis = matchedRule?.basis ?? CommissionCalculationBasis.GROSS_LINE;
      const basisAmountMinor =
        basis === CommissionCalculationBasis.GROSS_LINE ? item.priceMinorSnapshot : netAllocation.get(item.id)!;
      const calculatedAmountMinor = calculateCommissionAmount(matchedRule, basisAmountMinor);

      const row = await tx.commissionAccrual.create({
        data: {
          organizationId: transaction.organizationId,
          transactionId: transaction.id,
          transactionLineItemId: item.id,
          staffProfileId: item.staffProfileId,
          commissionRuleId: matchedRule?.id ?? null,
          source: matchedRule ? CommissionAccrualSource.POLICY : CommissionAccrualSource.NO_POLICY,
          ruleTypeSnapshot: matchedRule?.type ?? null,
          rateBasisPointsSnapshot: matchedRule?.type === CommissionRuleType.PERCENTAGE ? matchedRule.rateBasisPoints : null,
          fixedAmountMinorSnapshot: matchedRule?.type === CommissionRuleType.FIXED ? matchedRule.fixedAmountMinor : null,
          basisSnapshot: basis,
          basisAmountMinor,
          calculatedAmountMinor,
          currency: transaction.currency,
          calculatedAt: new Date(),
        },
      });
      created.push(toCommissionAccrualView(row));
    }

    const totalCalculatedMinor = created.reduce((sum, accrual) => sum + accrual.calculatedAmountMinor, 0);
    await this.auditService.record(
      {
        organizationId: actor.organizationId,
        branchId: transaction.branchId,
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        action: 'commission.accrued',
        entityType: 'transaction',
        entityId: transaction.id,
        requestId: actor.requestId,
        source: 'commissions',
        newState: { accrualCount: created.length, totalCalculatedMinor, currency: transaction.currency },
      },
      tx,
    );

    return [...existingAccruals.map(toCommissionAccrualView), ...created];
  }
}
