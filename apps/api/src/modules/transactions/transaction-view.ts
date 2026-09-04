import type { Prisma } from '../../generated/prisma/client.js';

export const transactionViewInclude = {
  items: true,
  allocations: true,
} satisfies Prisma.TransactionInclude;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{ include: typeof transactionViewInclude }>;

export interface TransactionLineItemView {
  id: string;
  serviceId: string;
  staffProfileId: string;
  serviceName: string;
  durationMinutes: number;
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
  checkoutId: string;
  serviceSessionId: string;
  customerRecordId: string;
  assignedStaffProfileId: string;
  reference: string;
  status: string;
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
 * revenue (docs task Phase 4) — every value here is copied at posting
 * time from an already-immutable Checkout snapshot, never recomputed
 * from live catalogue data. No commission, receipt, or refund field
 * exists on this view; none of those concepts are implemented yet.
 */
export function toTransactionView(transaction: TransactionWithRelations): TransactionView {
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
        serviceId: item.serviceId,
        staffProfileId: item.staffProfileId,
        serviceName: item.serviceNameSnapshot,
        durationMinutes: item.durationMinutesSnapshot,
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
