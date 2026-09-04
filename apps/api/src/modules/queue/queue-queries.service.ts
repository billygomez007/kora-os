import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { QueueEntryStatus } from '../../generated/prisma/client.js';
import { queueEntryViewInclude, toQueueEntryView, type QueueEntryView } from './queue-entry-view.js';
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
   * day's entries regardless of the `status`/`assignedStaffProfileId`
   * filters applied to `entries` itself, so a filtered view never
   * misrepresents the day's totals.
   */
  async listForBranch(
    organizationId: string,
    branchId: string,
    options: { businessDate?: string; status?: QueueEntryStatus; assignedStaffProfileId?: string },
  ): Promise<QueueListView> {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, organizationId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const businessDate = options.businessDate ?? resolveCurrentBusinessDate(branch.timeZone);
    const businessDateValue = new Date(businessDate);

    const [day, allStatusesForDay, entries] = await Promise.all([
      this.prisma.branchQueueDay.findUnique({
        where: { organizationId_branchId_businessDate: { organizationId, branchId, businessDate: businessDateValue } },
      }),
      this.prisma.queueEntry.findMany({
        where: { organizationId, branchId, businessDate: businessDateValue },
        select: { status: true },
      }),
      this.prisma.queueEntry.findMany({
        where: {
          organizationId,
          branchId,
          businessDate: businessDateValue,
          ...(options.status ? { status: options.status } : {}),
          ...(options.assignedStaffProfileId ? { assignedStaffProfileId: options.assignedStaffProfileId } : {}),
        },
        include: queueEntryViewInclude,
        // Priority classification, then join time, then ticket number,
        // then id as the final stable tie-breaker (docs task Phase 3).
        orderBy: [{ priority: 'desc' }, { joinedAt: 'asc' }, { ticketNumber: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const counts: Record<Lowercase<QueueEntryStatus>, number> = {
      waiting: 0,
      called: 0,
      in_service: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };
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
}
