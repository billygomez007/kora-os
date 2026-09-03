import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  Prisma,
  SubscriptionEvent,
  SubscriptionStatus,
} from '../../generated/prisma/client.js';

type TransactionClient = Prisma.TransactionClient;

export interface RecordSubscriptionEventInput {
  organizationId: string;
  subscriptionId: string;
  type: string;
  effectiveAt: Date;
  previousStatus?: SubscriptionStatus | null;
  newStatus: SubscriptionStatus;
  source: string;
  sourceEventId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Append-only subscription lifecycle history (docs/DATA_MODEL.md section
 * 4). Like AuditService, this exposes only `record` and
 * `listForOrganization` — no update or delete method exists.
 */
@Injectable()
export class SubscriptionEventService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: RecordSubscriptionEventInput,
    client: TransactionClient = this.prisma,
  ): Promise<SubscriptionEvent> {
    return client.subscriptionEvent.create({
      data: {
        organizationId: input.organizationId,
        subscriptionId: input.subscriptionId,
        type: input.type,
        effectiveAt: input.effectiveAt,
        previousStatus: input.previousStatus ?? null,
        newStatus: input.newStatus,
        source: input.source,
        sourceEventId: input.sourceEventId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async listForOrganization(
    organizationId: string,
    client: TransactionClient = this.prisma,
  ): Promise<SubscriptionEvent[]> {
    return client.subscriptionEvent.findMany({
      where: { organizationId },
      orderBy: { effectiveAt: 'desc' },
    });
  }
}
