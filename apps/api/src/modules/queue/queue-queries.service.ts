import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { QueueEntryStatus } from '../../generated/prisma/client.js';
import {
  queueEntryViewInclude,
  toQueueEntryView,
  type QueueEntryView,
} from './queue-entry-view.js';
import { resolveCurrentBusinessDate } from './queue-ticket.util.js';

export interface QueueListView {
  branchId: string;
  businessDate: string;
  revision: number;
  serverTime: string;
  entries: QueueEntryView[];
  counts: Record<Lowercase<QueueEntryStatus>, number>;
}

@Injectable()
export class QueueQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A safe polling foundation for Android/iOS (docs task Phase 3):
   * `businessDate` + `revision` let a client detect "nothing changed"
   * without re-fetching entries, and `serverTime` lets it reason about
   * its own clock skew. Counts are always computed across the whole
   * day's entries regardless of filters for queue managers. Restricted
   * readers are always scoped to their server-resolved StaffProfile for
   * both entries and counts.
   */
  async listForBranch(
    tenant: TenantContext,
    branchId: string,
    options: {
      businessDate?: string;
      status?: QueueEntryStatus;
      assignedStaffProfileId?: string;
    },
  ): Promise<QueueListView> {
    const organizationId = tenant.organizationId;
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const businessDate =
      options.businessDate ?? resolveCurrentBusinessDate(branch.timeZone);
    const businessDateValue = new Date(businessDate);
    const canManageQueue =
      tenant.isOwner || tenant.permissionCodes.has('queue.manage');
    const ownStaffProfile = canManageQueue
      ? null
      : await this.prisma.staffProfile.findUnique({
          where: {
            organizationId_membershipId: {
              organizationId,
              membershipId: tenant.membershipId,
            },
          },
          select: { id: true },
        });
    const assignedStaffProfileId = canManageQueue
      ? options.assignedStaffProfileId
      : (ownStaffProfile?.id ?? null);
    const providerScope = assignedStaffProfileId
      ? { assignedStaffProfileId }
      : {};

    if (!canManageQueue && !ownStaffProfile) {
      return {
        branchId,
        businessDate,
        revision: 0,
        serverTime: new Date().toISOString(),
        entries: [],
        counts: this.emptyCounts(),
      };
    }

    const [day, allStatusesForDay, entries] = await Promise.all([
      this.prisma.branchQueueDay.findUnique({
        where: {
          organizationId_branchId_businessDate: {
            organizationId,
            branchId,
            businessDate: businessDateValue,
          },
        },
      }),
      this.prisma.queueEntry.findMany({
        where: {
          organizationId,
          branchId,
          businessDate: businessDateValue,
          ...providerScope,
        },
        select: { status: true },
      }),
      this.prisma.queueEntry.findMany({
        where: {
          organizationId,
          branchId,
          businessDate: businessDateValue,
          ...(options.status ? { status: options.status } : {}),
          ...providerScope,
        },
        include: queueEntryViewInclude,
        // Priority classification, then join time, then ticket number,
        // then id as the final stable tie-breaker (docs task Phase 3).
        orderBy: [
          { priority: 'desc' },
          { joinedAt: 'asc' },
          { ticketNumber: 'asc' },
          { id: 'asc' },
        ],
      }),
    ]);

    const counts = this.emptyCounts();
    for (const row of allStatusesForDay) {
      counts[row.status.toLowerCase() as Lowercase<QueueEntryStatus>] += 1;
    }

    return {
      branchId,
      businessDate,
      revision: day?.revision ?? 0,
      serverTime: new Date().toISOString(),
      entries: entries.map(toQueueEntryView),
      counts,
    };
  }

  private emptyCounts(): Record<Lowercase<QueueEntryStatus>, number> {
    return {
      waiting: 0,
      called: 0,
      in_service: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };
  }
}
