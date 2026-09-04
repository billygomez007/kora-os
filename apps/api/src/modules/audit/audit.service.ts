import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuditEvent, Prisma } from '../../generated/prisma/client.js';

type TransactionClient = Prisma.TransactionClient;

export interface RecordAuditEventInput {
  organizationId?: string | null;
  branchId?: string | null;
  /** Null for a pre-authentication event with no resolved user yet — e.g.
   * an OTP request for an email with no Kora account (docs task Phase E).
   * `entityType`/`entityId` carry the event's subject in that case. */
  actorUserId?: string | null;
  actorMembershipId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string;
  source: string;
  sourceDeviceId?: string | null;
  previousState?: Prisma.InputJsonValue | null;
  newState?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Append-only audit trail (docs/SECURITY.md section 19). This service
 * deliberately exposes only `record` (insert) and `listForOrganization`
 * (read) — no update or delete method exists, so audit history cannot be
 * casually modified through application code.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: RecordAuditEventInput,
    client: TransactionClient = this.prisma,
  ): Promise<AuditEvent> {
    return client.auditEvent.create({
      data: {
        organizationId: input.organizationId ?? null,
        branchId: input.branchId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorMembershipId: input.actorMembershipId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId,
        source: input.source,
        sourceDeviceId: input.sourceDeviceId ?? null,
        previousState: input.previousState ?? undefined,
        newState: input.newState ?? undefined,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async listForOrganization(
    organizationId: string,
    client: TransactionClient = this.prisma,
  ): Promise<AuditEvent[]> {
    return client.auditEvent.findMany({
      where: { organizationId },
      orderBy: { occurredAt: 'desc' },
    });
  }
}
