import type { Prisma } from '../../generated/prisma/client.js';

type QueueEntryWithRelations = Prisma.QueueEntryGetPayload<{
  include: {
    customerRecord: true;
    services: { include: { service: true } };
  };
}>;

export interface QueueEntryServiceView {
  serviceId: string;
  serviceName: string;
  displayOrder: number;
}

export interface QueueEntryView {
  id: string;
  organizationId: string;
  branchId: string;
  businessDate: string;
  ticketNumber: number;
  source: string;
  appointmentId: string | null;
  customerRecordId: string;
  customerName: string;
  customerPhoneE164: string | null;
  status: string;
  priority: string;
  assignedStaffProfileId: string | null;
  notes: string | null;
  joinedAt: string;
  calledAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  services: QueueEntryServiceView[];
}

/**
 * The single response shape for every queue-entry endpoint. Carries the
 * customer's name and phone — the minimum staff need to call a waiting
 * customer by name and reach them if they have stepped away — but
 * nothing else about their CustomerRecord (no notes, no cross-org
 * history, none of which is queried here in the first place).
 */
export function toQueueEntryView(entry: QueueEntryWithRelations): QueueEntryView {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    businessDate: toLocalDateString(entry.businessDate),
    ticketNumber: entry.ticketNumber,
    source: entry.source,
    appointmentId: entry.appointmentId,
    customerRecordId: entry.customerRecordId,
    customerName: entry.customerRecord.name,
    customerPhoneE164: entry.customerRecord.phoneE164,
    status: entry.status,
    priority: entry.priority,
    assignedStaffProfileId: entry.assignedStaffProfileId,
    notes: entry.notes,
    joinedAt: entry.joinedAt.toISOString(),
    calledAt: entry.calledAt?.toISOString() ?? null,
    serviceStartedAt: entry.serviceStartedAt?.toISOString() ?? null,
    completedAt: entry.completedAt?.toISOString() ?? null,
    cancelledAt: entry.cancelledAt?.toISOString() ?? null,
    noShowAt: entry.noShowAt?.toISOString() ?? null,
    version: entry.version,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    services: entry.services
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((item) => ({
        serviceId: item.serviceId,
        serviceName: item.service.name,
        displayOrder: item.displayOrder,
      })),
  };
}

function toLocalDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export const queueEntryViewInclude = {
  customerRecord: true,
  services: { include: { service: true } },
} as const;
