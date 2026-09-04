import type { Prisma } from '../../generated/prisma/client.js';

type ServiceSessionWithItems = Prisma.ServiceSessionGetPayload<{ include: { items: true } }>;

export interface ServiceSessionItemView {
  serviceId: string;
  staffProfileId: string;
  serviceName: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  displayOrder: number;
}

export interface ServiceSessionView {
  id: string;
  organizationId: string;
  branchId: string;
  queueEntryId: string;
  appointmentId: string | null;
  customerRecordId: string;
  assignedStaffProfileId: string;
  status: string;
  currency: string;
  serviceTotalMinor: number;
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelDisposition: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: ServiceSessionItemView[];
}

/**
 * `serviceTotalMinor` is the value of performed services, not proof that
 * money was received — this view (and the model behind it) never carries
 * a payment, transaction, receipt, or commission field, because none of
 * those exist yet (deliberately deferred, docs task Phase 4).
 */
export function toServiceSessionView(session: ServiceSessionWithItems): ServiceSessionView {
  return {
    id: session.id,
    organizationId: session.organizationId,
    branchId: session.branchId,
    queueEntryId: session.queueEntryId,
    appointmentId: session.appointmentId,
    customerRecordId: session.customerRecordId,
    assignedStaffProfileId: session.assignedStaffProfileId,
    status: session.status,
    currency: session.currency,
    serviceTotalMinor: session.serviceTotalMinor,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    cancelledAt: session.cancelledAt?.toISOString() ?? null,
    cancelReason: session.cancelReason,
    cancelDisposition: session.cancelDisposition,
    version: session.version,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    items: session.items
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((item) => ({
        serviceId: item.serviceId,
        staffProfileId: item.staffProfileId,
        serviceName: item.serviceNameSnapshot,
        durationMinutes: item.durationMinutesSnapshot,
        priceMinor: item.priceMinorSnapshot,
        currency: item.currencySnapshot,
        displayOrder: item.displayOrder,
      })),
  };
}
