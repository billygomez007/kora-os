import type { Prisma } from '../../generated/prisma/client.js';

type AppointmentWithItems = Prisma.AppointmentGetPayload<{ include: { items: true } }>;

export interface AppointmentItemView {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  displayOrder: number;
}

export interface AppointmentView {
  id: string;
  reference: string;
  organizationId: string;
  branchId: string;
  status: string;
  source: string;
  customerProfileId: string | null;
  customerRecordId: string;
  assignedStaffProfileId: string;
  startAt: string;
  endAt: string;
  occupiedStartAt: string;
  occupiedEndAt: string;
  branchTimeZone: string;
  currency: string;
  totalPriceMinor: number;
  cancelledAt: string | null;
  cancelledReason: string | null;
  noShowMarkedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: AppointmentItemView[];
}

/**
 * The single response shape for every appointment endpoint (docs task
 * Phase 20: "Business appointment responses may include only the
 * customer information necessary to provide the booked service"). This
 * intentionally carries only appointment-scoped identifiers — no
 * membership, role, financial, audit, subscription, or cross-organization
 * data reaches it, structurally, because none of that is queried in the
 * first place (see AppointmentBookingService/AppointmentCommandsService/
 * AppointmentQueriesService, which never select it).
 */
export function toAppointmentView(appointment: AppointmentWithItems): AppointmentView {
  return {
    id: appointment.id,
    reference: appointment.reference,
    organizationId: appointment.organizationId,
    branchId: appointment.branchId,
    status: appointment.status,
    source: appointment.source,
    customerProfileId: appointment.customerProfileId,
    customerRecordId: appointment.customerRecordId,
    assignedStaffProfileId: appointment.assignedStaffProfileId,
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    occupiedStartAt: appointment.occupiedStartAt.toISOString(),
    occupiedEndAt: appointment.occupiedEndAt.toISOString(),
    branchTimeZone: appointment.branchTimeZone,
    currency: appointment.currency,
    totalPriceMinor: appointment.totalPriceMinor,
    cancelledAt: appointment.cancelledAt?.toISOString() ?? null,
    cancelledReason: appointment.cancelledReason,
    noShowMarkedAt: appointment.noShowMarkedAt?.toISOString() ?? null,
    version: appointment.version,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
    items: appointment.items
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((item) => ({
        serviceId: item.serviceId,
        serviceName: item.serviceNameSnapshot,
        durationMinutes: item.durationMinutesSnapshot,
        priceMinor: item.priceMinorSnapshot,
        currency: item.currencySnapshot,
        displayOrder: item.displayOrder,
      })),
  };
}
