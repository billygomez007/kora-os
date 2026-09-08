import type { Prisma } from '../../generated/prisma/client.js';

export const checkoutViewInclude = {
  items: true,
  adjustments: true,
} satisfies Prisma.CheckoutInclude;

type CheckoutWithRelations = Prisma.CheckoutGetPayload<{ include: typeof checkoutViewInclude }>;

export interface CheckoutLineItemView {
  id: string;
  serviceId: string;
  staffProfileId: string;
  serviceName: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  displayOrder: number;
}

export interface CheckoutAdjustmentView {
  id: string;
  type: string;
  amountMinor: number;
  reason: string;
  createdByMembershipId: string;
  createdAt: string;
}

export interface CheckoutView {
  id: string;
  organizationId: string;
  branchId: string;
  serviceSessionId: string;
  customerRecordId: string;
  assignedStaffProfileId: string;
  reference: string;
  status: string;
  currency: string;
  subtotalMinor: number;
  adjustmentTotalMinor: number;
  totalMinor: number;
  version: number;
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
  voidedAt: string | null;
  voidedByMembershipId: string | null;
  voidReason: string | null;
  items: CheckoutLineItemView[];
  adjustments: CheckoutAdjustmentView[];
}

/**
 * `subtotalMinor`/`totalMinor` are the amount due for a completed
 * ServiceSession — not proof any money was received. This view never
 * carries a "paid" or "balance" field of its own; a caller derives what
 * remains outstanding from the checkout's own `status` plus the payments
 * collection (`GET .../checkouts/:id/payments`), never from a value
 * this view precomputes (docs task: "PaymentRecord represents a claim
 * that money was received — not immediately verified revenue").
 */
export function toCheckoutView(checkout: CheckoutWithRelations): CheckoutView {
  return {
    id: checkout.id,
    organizationId: checkout.organizationId,
    branchId: checkout.branchId,
    serviceSessionId: checkout.serviceSessionId,
    customerRecordId: checkout.customerRecordId,
    assignedStaffProfileId: checkout.assignedStaffProfileId,
    reference: checkout.reference,
    status: checkout.status,
    currency: checkout.currency,
    subtotalMinor: checkout.subtotalMinor,
    adjustmentTotalMinor: checkout.adjustmentTotalMinor,
    totalMinor: checkout.totalMinor,
    version: checkout.version,
    createdByMembershipId: checkout.createdByMembershipId,
    createdAt: checkout.createdAt.toISOString(),
    updatedAt: checkout.updatedAt.toISOString(),
    settledAt: checkout.settledAt?.toISOString() ?? null,
    voidedAt: checkout.voidedAt?.toISOString() ?? null,
    voidedByMembershipId: checkout.voidedByMembershipId,
    voidReason: checkout.voidReason,
    items: checkout.items
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
    adjustments: checkout.adjustments
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((adjustment) => ({
        id: adjustment.id,
        type: adjustment.type,
        amountMinor: adjustment.amountMinor,
        reason: adjustment.reason,
        createdByMembershipId: adjustment.createdByMembershipId,
        createdAt: adjustment.createdAt.toISOString(),
      })),
  };
}
