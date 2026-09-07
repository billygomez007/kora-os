import type { Prisma } from '../../generated/prisma/client.js';

export const transactionViewInclude = {
  items: true,
  allocations: true,
} satisfies Prisma.TransactionInclude;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof transactionViewInclude;
}>;

export interface TransactionLineItemView {
  id: string;
  kind: string;
  serviceId: string | null;
  staffProfileId: string | null;
  serviceName: string | null;
  durationMinutes: number | null;
  productId: string | null;
  productVariantId: string | null;
  productName: string | null;
  variantName: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  unitPriceMinor: number;
  priceMinor: number;
  currency: string;
  displayOrder: number;
}

export interface TransactionPaymentAllocationView {
  id: string;
  paymentRecordId: string;
  appliedAmountMinor: number;
  createdAt: string;
}

export interface TransactionView {
  id: string;
  organizationId: string;
  branchId: string;
  checkoutId: string | null;
  serviceSessionId: string | null;
  customerRecordId: string | null;
  assignedStaffProfileId: string;
  reference: string;
  status: string;
  /** SALE, REFUND, or REVERSAL (docs task Phase 3) — a REFUND/REVERSAL
   * always carries `correctedTransactionId` and null checkout/service-
   * session ids, since a correction has neither of its own. */
  kind: string;
  correctedTransactionId: string | null;
  currency: string;
  subtotalMinor: number;
  adjustmentTotalMinor: number;
  totalMinor: number;
  postedAt: string;
  createdAt: string;
  items: TransactionLineItemView[];
  allocations: TransactionPaymentAllocationView[];
}

/**
 * The only thing a future reporting phase may ever count as business
 * revenue (docs task Phase 4) when `kind === 'SALE'` — every value here
 * is copied at posting time from an already-immutable Checkout snapshot,
 * never recomputed from live catalogue data. `*Minor` fields are always
 * non-negative magnitudes regardless of kind; a REFUND/REVERSAL's
 * negative contribution to net revenue is derived at the reporting
 * layer from `kind`, never stored as a negative value here.
 */
export function toTransactionView(
  transaction: TransactionWithRelations,
): TransactionView {
  return {
    id: transaction.id,
    organizationId: transaction.organizationId,
    branchId: transaction.branchId,
    checkoutId: transaction.checkoutId,
    serviceSessionId: transaction.serviceSessionId,
    customerRecordId: transaction.customerRecordId,
    assignedStaffProfileId: transaction.assignedStaffProfileId,
    reference: transaction.reference,
    status: transaction.status,
    kind: transaction.kind,
    correctedTransactionId: transaction.correctedTransactionId,
    currency: transaction.currency,
    subtotalMinor: transaction.subtotalMinor,
    adjustmentTotalMinor: transaction.adjustmentTotalMinor,
    totalMinor: transaction.totalMinor,
    postedAt: transaction.postedAt.toISOString(),
    createdAt: transaction.createdAt.toISOString(),
    items: transaction.items
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        serviceId: item.serviceId,
        staffProfileId: item.staffProfileId,
        serviceName: item.serviceNameSnapshot,
        durationMinutes: item.durationMinutesSnapshot,
        productId: item.productId,
        productVariantId: item.productVariantId,
        productName: item.productNameSnapshot,
        variantName: item.variantNameSnapshot,
        sku: item.skuSnapshot,
        barcode: item.barcodeSnapshot,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinorSnapshot,
        priceMinor: item.priceMinorSnapshot,
        currency: item.currencySnapshot,
        displayOrder: item.displayOrder,
      })),
    allocations: transaction.allocations
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((allocation) => ({
        id: allocation.id,
        paymentRecordId: allocation.paymentRecordId,
        appliedAmountMinor: allocation.appliedAmountMinor,
        createdAt: allocation.createdAt.toISOString(),
      })),
  };
}
