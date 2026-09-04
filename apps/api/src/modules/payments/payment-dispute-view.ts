import type { PaymentDispute } from '../../generated/prisma/client.js';

export interface PaymentDisputeView {
  id: string;
  organizationId: string;
  paymentRecordId: string;
  status: string;
  reason: string;
  openedByMembershipId: string;
  openedAt: string;
  resolvedByMembershipId: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  resolutionNote: string | null;
}

export function toPaymentDisputeView(dispute: PaymentDispute): PaymentDisputeView {
  return {
    id: dispute.id,
    organizationId: dispute.organizationId,
    paymentRecordId: dispute.paymentRecordId,
    status: dispute.status,
    reason: dispute.reason,
    openedByMembershipId: dispute.openedByMembershipId,
    openedAt: dispute.openedAt.toISOString(),
    resolvedByMembershipId: dispute.resolvedByMembershipId,
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
    resolution: dispute.resolution,
    resolutionNote: dispute.resolutionNote,
  };
}
