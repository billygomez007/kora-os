import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { PrismaService } from '../../database/prisma.service.js';
import { QueueEntryStatus } from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { AvailabilityEngineService } from '../availability/availability-engine.service.js';
import { queueEntryViewInclude, toQueueEntryView, type QueueEntryView } from './queue-entry-view.js';
import { assertQueueTransitionAllowed } from './queue-transition.util.js';
import { bumpQueueRevision } from './queue-ticket.util.js';

type QueueEntryWithServices = Prisma.QueueEntryGetPayload<{ include: { services: true } }>;

/** No `:branchId` route param exists for any of these commands (docs
 * task suggested surface: `/organizations/:organizationId/queue-
 * entries/:id/*`) — every method loads the entry first via
 * `loadOwnedEntry`, which re-checks branch access against the caller's
 * own tenant context, the same pattern id-scoped appointment/service-
 * session routes already use. */
@Injectable()
export class QueueCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityEngine: AvailabilityEngineService,
    private readonly auditService: AuditService,
  ) {}

  async call(tenant: TenantContext, requestId: string, queueEntryId: string): Promise<QueueEntryView> {
    const entry = await this.loadOwnedEntry(tenant, queueEntryId);
    return this.transition(tenant, requestId, entry, QueueEntryStatus.CALLED, {
      action: 'queue.entry.called',
      data: { calledAt: new Date() },
    });
  }

  async returnToWaiting(tenant: TenantContext, requestId: string, queueEntryId: string): Promise<QueueEntryView> {
    const entry = await this.loadOwnedEntry(tenant, queueEntryId);
    return this.transition(tenant, requestId, entry, QueueEntryStatus.WAITING, {
      action: 'queue.entry.returned_to_waiting',
      data: {},
    });
  }

  async cancel(
    tenant: TenantContext,
    requestId: string,
    queueEntryId: string,
    reason: string | undefined,
  ): Promise<QueueEntryView> {
    const entry = await this.loadOwnedEntry(tenant, queueEntryId);
    return this.transition(tenant, requestId, entry, QueueEntryStatus.CANCELLED, {
      action: 'queue.entry.cancelled',
      data: { cancelledAt: new Date() },
      reason,
    });
  }

  async noShow(tenant: TenantContext, requestId: string, queueEntryId: string): Promise<QueueEntryView> {
    const entry = await this.loadOwnedEntry(tenant, queueEntryId);
    return this.transition(tenant, requestId, entry, QueueEntryStatus.NO_SHOW, {
      action: 'queue.entry.no_show',
      data: { noShowAt: new Date() },
    });
  }

  async assign(
    tenant: TenantContext,
    requestId: string,
    queueEntryId: string,
    staffProfileId: string,
  ): Promise<QueueEntryView> {
    const entry = await this.loadOwnedEntry(tenant, queueEntryId);
    if (entry.status !== QueueEntryStatus.WAITING && entry.status !== QueueEntryStatus.CALLED) {
      throw new ConflictException({
        code: 'QUEUE_ENTRY_INVALID_TRANSITION',
        message: 'A provider can only be assigned while the queue entry is waiting or called.',
      });
    }

    const serviceIds = entry.services.map((service) => service.serviceId);
    const eligible = await this.availabilityEngine.resolveEligibleProviders(
      tenant.organizationId,
      entry.branchId,
      serviceIds,
      staffProfileId,
    );
    if (eligible.length === 0) {
      throw new BadRequestException('The selected staff member cannot perform the requested services at this branch');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.queueEntry.updateMany({
        where: { id: queueEntryId, version: entry.version },
        data: { assignedStaffProfileId: staffProfileId, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException('This queue entry was already updated by someone else');
      }
      await bumpQueueRevision(tx, entry.branchQueueDayId);
      return tx.queueEntry.findUniqueOrThrow({ where: { id: queueEntryId }, include: queueEntryViewInclude });
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: entry.branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: 'queue.entry.assigned',
      entityType: 'queue_entry',
      entityId: queueEntryId,
      requestId,
      source: 'queue',
      previousState: { assignedStaffProfileId: entry.assignedStaffProfileId },
      newState: { assignedStaffProfileId: staffProfileId },
    });

    return toQueueEntryView(updated);
  }

  async getOne(tenant: TenantContext, queueEntryId: string): Promise<QueueEntryView> {
    const entry = await this.prisma.queueEntry.findFirst({
      where: { id: queueEntryId, organizationId: tenant.organizationId },
      include: queueEntryViewInclude,
    });
    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }
    assertMembershipHasBranchAccess(tenant, entry.branchId);
    return toQueueEntryView(entry);
  }

  private async loadOwnedEntry(tenant: TenantContext, queueEntryId: string): Promise<QueueEntryWithServices> {
    const entry = await this.prisma.queueEntry.findFirst({
      where: { id: queueEntryId, organizationId: tenant.organizationId },
      include: { services: true },
    });
    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }
    assertMembershipHasBranchAccess(tenant, entry.branchId);
    return entry;
  }

  private async transition(
    tenant: TenantContext,
    requestId: string,
    entry: QueueEntryWithServices,
    newStatus: QueueEntryStatus,
    options: { action: string; data: Prisma.QueueEntryUpdateInput; reason?: string },
  ): Promise<QueueEntryView> {
    assertQueueTransitionAllowed(entry.status, newStatus);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.queueEntry.updateMany({
        where: { id: entry.id, status: entry.status, version: entry.version },
        data: { ...options.data, status: newStatus, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException('This queue entry was already updated by someone else');
      }
      await tx.queueEntryStatusHistory.create({
        data: {
          organizationId: tenant.organizationId,
          queueEntryId: entry.id,
          previousStatus: entry.status,
          newStatus,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          reason: options.reason,
        },
      });
      await bumpQueueRevision(tx, entry.branchQueueDayId);
      return tx.queueEntry.findUniqueOrThrow({ where: { id: entry.id }, include: queueEntryViewInclude });
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: entry.branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: options.action,
      entityType: 'queue_entry',
      entityId: entry.id,
      requestId,
      source: 'queue',
      previousState: { status: entry.status },
      newState: { status: newStatus, reason: options.reason ?? null },
    });

    return toQueueEntryView(updated);
  }
}
