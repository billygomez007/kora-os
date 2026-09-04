import type { CommissionAccrual } from '../../generated/prisma/client.js';

export interface CommissionAccrualView {
  id: string;
  organizationId: string;
  transactionId: string;
  transactionLineItemId: string;
  staffProfileId: string;
  commissionRuleId: string | null;
  /** EARNED (a normal sale accrual) or REFUNDED/REVERSED (a corrective
   * adjustment — docs task Phase 4). Always a non-negative magnitude;
   * the reporting layer derives the reduction from `kind`. */
  kind: string;
  /** The EARNED accrual this row adjusts — set only for REFUNDED/
   * REVERSED. */
  originalAccrualId: string | null;
  source: string;
  ruleTypeSnapshot: string | null;
  rateBasisPointsSnapshot: number | null;
  fixedAmountMinorSnapshot: number | null;
  basisSnapshot: string;
  basisAmountMinor: number;
  calculatedAmountMinor: number;
  currency: string;
  calculatedAt: string;
  createdAt: string;
}

/**
 * Immutable by construction — this view never carries an update
 * timestamp separate from `createdAt`, because no update path exists
 * for a CommissionAccrual at all (docs task Phase 1: "be immutable after
 * creation").
 */
export function toCommissionAccrualView(accrual: CommissionAccrual): CommissionAccrualView {
  return {
    id: accrual.id,
    organizationId: accrual.organizationId,
    transactionId: accrual.transactionId,
    transactionLineItemId: accrual.transactionLineItemId,
    staffProfileId: accrual.staffProfileId,
    commissionRuleId: accrual.commissionRuleId,
    kind: accrual.kind,
    originalAccrualId: accrual.originalAccrualId,
    source: accrual.source,
    ruleTypeSnapshot: accrual.ruleTypeSnapshot,
    rateBasisPointsSnapshot: accrual.rateBasisPointsSnapshot,
    fixedAmountMinorSnapshot: accrual.fixedAmountMinorSnapshot,
    basisSnapshot: accrual.basisSnapshot,
    basisAmountMinor: accrual.basisAmountMinor,
    calculatedAmountMinor: accrual.calculatedAmountMinor,
    currency: accrual.currency,
    calculatedAt: accrual.calculatedAt.toISOString(),
    createdAt: accrual.createdAt.toISOString(),
  };
}
