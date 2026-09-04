import type { Prisma } from '../../generated/prisma/client.js';

export const transactionCorrectionViewInclude = {
  items: true,
} satisfies Prisma.TransactionCorrectionInclude;

type TransactionCorrectionWithRelations = Prisma.TransactionCorrectionGetPayload<{
  include: typeof transactionCorrectionViewInclude;
}>;

export interface TransactionCorrectionItemView {
  id: string;
  originalTransactionLineItemId: string;
  requestedAmountMinor: number;
}

export interface TransactionCorrectionView {
  id: string;
  organizationId: string;
  branchId: string;
  originalTransactionId: string;
  correctionType: string;
  status: string;
  reason: string;
  currency: string;
  returnMethod: string;
  totalRequestedMinor: number;
  requestedByMembershipId: string;
  requestedAt: string;
  approvedByMembershipId: string | null;
  approvedAt: string | null;
  rejectedByMembershipId: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  cancelledByMembershipId: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  executedByMembershipId: string | null;
  executedAt: string | null;
  correctiveTransactionId: string | null;
  soloOwnerOverride: boolean;
  soloOwnerOverrideReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: TransactionCorrectionItemView[];
}

/**
 * The original SALE Transaction is never mutated by any of this — this
 * view describes only the correction *request/decision/execution*
 * record, never the corrective Transaction's own financial values
 * (those live on the Transaction/Receipt/CommissionAccrual views
 * produced once EXECUTED — see TransactionCorrectionExecutionService).
 */
export function toTransactionCorrectionView(correction: TransactionCorrectionWithRelations): TransactionCorrectionView {
  return {
    id: correction.id,
    organizationId: correction.organizationId,
    branchId: correction.branchId,
    originalTransactionId: correction.originalTransactionId,
    correctionType: correction.correctionType,
    status: correction.status,
    reason: correction.reason,
    currency: correction.currency,
    returnMethod: correction.returnMethod,
    totalRequestedMinor: correction.totalRequestedMinor,
    requestedByMembershipId: correction.requestedByMembershipId,
    requestedAt: correction.requestedAt.toISOString(),
    approvedByMembershipId: correction.approvedByMembershipId,
    approvedAt: correction.approvedAt?.toISOString() ?? null,
    rejectedByMembershipId: correction.rejectedByMembershipId,
    rejectedAt: correction.rejectedAt?.toISOString() ?? null,
    rejectionReason: correction.rejectionReason,
    cancelledByMembershipId: correction.cancelledByMembershipId,
    cancelledAt: correction.cancelledAt?.toISOString() ?? null,
    cancellationReason: correction.cancellationReason,
    executedByMembershipId: correction.executedByMembershipId,
    executedAt: correction.executedAt?.toISOString() ?? null,
    correctiveTransactionId: correction.correctiveTransactionId,
    soloOwnerOverride: correction.soloOwnerOverride,
    soloOwnerOverrideReason: correction.soloOwnerOverrideReason,
    version: correction.version,
    createdAt: correction.createdAt.toISOString(),
    updatedAt: correction.updatedAt.toISOString(),
    items: correction.items.map((item) => ({
      id: item.id,
      originalTransactionLineItemId: item.originalTransactionLineItemId,
      requestedAmountMinor: item.requestedAmountMinor,
    })),
  };
}
