import type { Prisma } from '../../generated/prisma/client.js';

export const customerRecordInclude = {
  _count: {
    select: {
      appointments: true,
      queueEntries: true,
      serviceSessions: true,
      transactions: true,
      receipts: true,
    },
  },
} satisfies Prisma.CustomerRecordInclude;

export type CustomerRecordWithCounts =
  Prisma.CustomerRecordGetPayload<{
    include: typeof customerRecordInclude;
  }>;

export interface CustomerView {
  id: string;
  organizationId: string;
  customerProfileId: string | null;
  name: string;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activity: {
    appointments: number;
    queueVisits: number;
    serviceSessions: number;
    transactions: number;
    receipts: number;
  };
}

export function toCustomerView(
  customer: CustomerRecordWithCounts,
): CustomerView {
  return {
    id: customer.id,
    organizationId: customer.organizationId,
    customerProfileId: customer.customerProfileId,
    name: customer.name,
    phoneE164: customer.phoneE164,
    email: customer.emailNormalized,
    notes: customer.notes,
    archivedAt: customer.archivedAt,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    activity: {
      appointments: customer._count.appointments,
      queueVisits: customer._count.queueEntries,
      serviceSessions: customer._count.serviceSessions,
      transactions: customer._count.transactions,
      receipts: customer._count.receipts,
    },
  };
}
