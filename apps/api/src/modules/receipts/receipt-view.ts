import type { Prisma } from '../../generated/prisma/client.js';

export const receiptViewInclude = {
  lineItems: true,
  paymentSummaries: true,
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
