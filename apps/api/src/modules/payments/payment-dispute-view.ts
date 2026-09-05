import type { PaymentDispute, PaymentRecord } from '../../generated/prisma/client.js';
import { toPaymentRecordView, type PaymentRecordView } from './payment-record-view.js';

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
  /** The safe payment-claim summary this dispute is about — embedded
   * so an owner/manager resolution screen never has to guess a
   * checkout id to look it up separately (no standalone "get payment
   * by id" endpoint exists). `undefined` only if the caller did not
   * supply it (kept optional so existing callers of
   * [toPaymentDisputeView] are unaffected). */
  payment?: PaymentRecordView;
}

export function toPaymentDisputeView(dispute: PaymentDispute, payment?: PaymentRecord): PaymentDisputeView {
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
    payment: payment ? toPaymentRecordView(payment) : undefined,
  };
}
