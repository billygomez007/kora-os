import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Shared `include` for every query that feeds {@link toAppointmentView}
 * (docs task "Customer Marketplace Design Batch 02": the appointment
 * list/detail/confirmation screens need to identify which business and
 * provider an appointment is for, which the bare `organizationId`/
 * `branchId`/`assignedStaffProfileId` columns alone cannot do). Every
 * relation here already exists on `Appointment` -- this adds no new
 * columns, only reads three already-related rows alongside it.
 */
export const APPOINTMENT_VIEW_INCLUDE = {
  items: true,
  organization: { include: { publicProfile: true } },
  assignedStaffProfile: { include: { membership: { include: { user: true } } } },
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_VIEW_INCLUDE }>;

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
  /** The organization's own registered name -- always present,
   * independent of whether a public discovery profile currently exists
   * (docs task Batch 02). */
  businessName: string;
  /** Only present while the organization currently has a public
   * discovery profile; `null` once unpublished after the fact. Lets a
   * client re-fetch richer public business/branch data (images, phone,
   * coordinates, hours) from the existing discovery endpoints rather
   * than duplicating it here. */
  businessSlug: string | null;
  /** The assigned provider's public display name. Every CONFIRMED
   * appointment already has a specific `assignedStaffProfileId` (booking
   * resolves "any available provider" to one atomically) -- this is
   * never null in practice, but stays nullable rather than throwing if a
   * future data anomaly leaves it unresolvable. */
  providerDisplayName: string | null;
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
export function toAppointmentView(appointment: AppointmentWithRelations): AppointmentView {
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
    businessName: appointment.organization.name,
    businessSlug: appointment.organization.publicProfile?.slug ?? null,
    providerDisplayName: appointment.assignedStaffProfile.membership.user.displayName ?? null,
  };
}
