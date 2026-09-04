import type { PaymentRecord } from '../../generated/prisma/client.js';

export interface PaymentRecordView {
  id: string;
  organizationId: string;
  branchId: string;
  checkoutId: string;
  reference: string;
  method: string;
  status: string;
  appliedAmountMinor: number;
  tenderedAmountMinor: number | null;
  /** Derived, never stored: `tenderedAmountMinor - appliedAmountMinor`
   * for a CASH payment — the change handed back to the customer. Never
   * itself treated as revenue or persisted (docs task Phase 2: "return
   * the calculated change, never treat it as revenue"). */
  changeMinor: number | null;
  currency: string;
  externalReference: string | null;
  note: string | null;
  recordedByMembershipId: string;
  confirmationRequiredByStaffProfileId: string;
  confirmedByMembershipId: string | null;
  recordedAt: string;
  confirmedAt: string | null;
  disputedAt: string | null;
  voidedAt: string | null;
  voidedByMembershipId: string | null;
  voidReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A staff member's *claim* that money was received — never itself
 * revenue (docs task Phase 2). This view never carries a "verified" or
 * "posted" flag; whether it has actually contributed to a posted
 * Transaction is only ever true once `status === 'CONFIRMED'` *and* a
 * Transaction has been posted for its Checkout (visible separately via
 * `GET .../transactions/:id`, never inferred from this view alone).
 */
export function toPaymentRecordView(payment: PaymentRecord): PaymentRecordView {
  return {
    id: payment.id,
    organizationId: payment.organizationId,
    branchId: payment.branchId,
    checkoutId: payment.checkoutId,
    reference: payment.reference,
    method: payment.method,
    status: payment.status,
    appliedAmountMinor: payment.appliedAmountMinor,
    tenderedAmountMinor: payment.tenderedAmountMinor,
    changeMinor:
      payment.tenderedAmountMinor !== null ? payment.tenderedAmountMinor - payment.appliedAmountMinor : null,
    currency: payment.currency,
    externalReference: payment.externalReference,
    note: payment.note,
    recordedByMembershipId: payment.recordedByMembershipId,
    confirmationRequiredByStaffProfileId: payment.confirmationRequiredByStaffProfileId,
    confirmedByMembershipId: payment.confirmedByMembershipId,
    recordedAt: payment.recordedAt.toISOString(),
    confirmedAt: payment.confirmedAt?.toISOString() ?? null,
    disputedAt: payment.disputedAt?.toISOString() ?? null,
    voidedAt: payment.voidedAt?.toISOString() ?? null,
    voidedByMembershipId: payment.voidedByMembershipId,
    voidReason: payment.voidReason,
    version: payment.version,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}
