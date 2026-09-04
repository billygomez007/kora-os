import type { Prisma } from '../../generated/prisma/client.js';

export const receiptViewInclude = {
  lineItems: true,
  paymentSummaries: true,
  // Only ever populated for a corrective receipt; both Receipt and
  // Transaction are immutable once created, so joining to them at read
  // time (rather than a further denormalized snapshot column) is safe
  // and always yields unchanging historical data.
  originalReceipt: { select: { receiptNumber: true, transaction: { select: { reference: true } } } },
} satisfies Prisma.ReceiptInclude;

type ReceiptWithRelations = Prisma.ReceiptGetPayload<{ include: typeof receiptViewInclude }>;

export interface ReceiptLineItemView {
  id: string;
  serviceName: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: string;
  displayOrder: number;
}

export interface ReceiptPaymentSummaryView {
  id: string;
  method: string;
  amountMinor: number;
  currency: string;
  safeReference: string | null;
}

export interface ReceiptView {
  id: string;
  organizationId: string;
  branchId: string;
  transactionId: string;
  customerRecordId: string;
  receiptNumber: string;
  sequenceNumber: number;
  /** SALE_RECEIPT, REFUND_RECEIPT, or REVERSAL_RECORD (docs task Phase
   * 5) — never a statutory tax invoice or credit note. */
  kind: string;
  originalReceiptId: string | null;
  originalReceiptNumber: string | null;
  originalTransactionReference: string | null;
  correctionReason: string | null;
  remainingRefundableMinor: number | null;
  businessName: string;
  branchName: string;
  branchPhone: string | null;
  branchAddress: string | null;
  customerName: string;
  currency: string;
  subtotalMinor: number;
  adjustmentTotalMinor: number;
  totalMinor: number;
  issuedAt: string;
  issuedByMembershipId: string;
  lineItems: ReceiptLineItemView[];
  paymentSummaries: ReceiptPaymentSummaryView[];
}

/**
 * Not a statutory VAT/tax invoice — a plain, immutable service receipt.
 * Every field here is a snapshot taken atomically at issuance time
 * (docs task Phase 3); this view never joins back to a live Branch/
 * CustomerRecord/PaymentRecord row to fill in a value.
 */
export function toReceiptView(receipt: ReceiptWithRelations): ReceiptView {
  return {
    id: receipt.id,
    organizationId: receipt.organizationId,
    branchId: receipt.branchId,
    transactionId: receipt.transactionId,
    customerRecordId: receipt.customerRecordId,
    receiptNumber: receipt.receiptNumber,
    sequenceNumber: receipt.sequenceNumber,
    kind: receipt.kind,
    originalReceiptId: receipt.originalReceiptId,
    originalReceiptNumber: receipt.originalReceipt?.receiptNumber ?? null,
    originalTransactionReference: receipt.originalReceipt?.transaction.reference ?? null,
    correctionReason: receipt.correctionReason,
    remainingRefundableMinor: receipt.remainingRefundableMinorSnapshot,
    businessName: receipt.businessNameSnapshot,
    branchName: receipt.branchNameSnapshot,
    branchPhone: receipt.branchPhoneSnapshot,
    branchAddress: receipt.branchAddressSnapshot,
    customerName: receipt.customerNameSnapshot,
    currency: receipt.currency,
    subtotalMinor: receipt.subtotalMinorSnapshot,
    adjustmentTotalMinor: receipt.adjustmentTotalMinorSnapshot,
    totalMinor: receipt.totalMinorSnapshot,
    issuedAt: receipt.issuedAt.toISOString(),
    issuedByMembershipId: receipt.issuedByMembershipId,
    lineItems: receipt.lineItems
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((item) => ({
        id: item.id,
        serviceName: item.serviceNameSnapshot,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinorSnapshot,
        lineTotalMinor: item.lineTotalMinorSnapshot,
        currency: item.currencySnapshot,
        displayOrder: item.displayOrder,
      })),
    paymentSummaries: receipt.paymentSummaries.map((summary) => ({
      id: summary.id,
      method: summary.method,
      amountMinor: summary.amountMinorSnapshot,
      currency: summary.currencySnapshot,
      safeReference: summary.safeReferenceSnapshot,
    })),
  };
}
