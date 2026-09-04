import { todayInZone } from '../../common/scheduling/local-time.util.js';
import type { Prisma } from '../../generated/prisma/client.js';

/** The branch-local business date "right now" — never the API server's
 * own timezone (docs task Phase 1: "The business date must be calculated
 * using the branch timezone, not the API server timezone"). */
export function resolveCurrentBusinessDate(branchTimeZone: string): string {
  return todayInZone(branchTimeZone);
}

/**
 * Atomically issues the next ticket number for one (organization, branch,
 * business date) and bumps the polling revision, in a single native
 * Postgres `INSERT ... ON CONFLICT DO UPDATE` (docs task Phase 1:
 * "Atomically issue the next human-friendly queue ticket number" /
 * "Prevent duplicate ticket numbers under concurrent requests") — there
 * is no separate read-then-write step for a concurrent second caller to
 * race against; the unique index on (organizationId, branchId,
 * businessDate) is what the upsert's ON CONFLICT target relies on, and
 * `QueueEntry`'s own `@@unique([branchId, businessDate, ticketNumber])`
 * is a second, structural line of defense. Must be called with the same
 * transaction client the rest of the intake write uses, so a failure
 * anywhere else in that transaction also rolls this allocation back.
 */
export async function allocateQueueTicket(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId: string,
  businessDate: string,
): Promise<{ branchQueueDayId: string; ticketNumber: number }> {
  const businessDateValue = new Date(businessDate);
  const day = await tx.branchQueueDay.upsert({
    where: {
      organizationId_branchId_businessDate: {
        organizationId,
        branchId,
        businessDate: businessDateValue,
      },
    },
    update: { lastTicketNumber: { increment: 1 }, revision: { increment: 1 } },
    create: {
      organizationId,
      branchId,
      businessDate: businessDateValue,
      lastTicketNumber: 1,
      revision: 1,
    },
  });
  return { branchQueueDayId: day.id, ticketNumber: day.lastTicketNumber };
}

/** Bumps only the revision — used by every command that mutates a
 * QueueEntry without allocating a new ticket (docs task Phase 3: "Every
 * successful mutation must atomically increment the applicable
 * BranchQueueDay.revision"). */
export async function bumpQueueRevision(
  tx: Prisma.TransactionClient,
  branchQueueDayId: string,
): Promise<void> {
  await tx.branchQueueDay.update({
    where: { id: branchQueueDayId },
    data: { revision: { increment: 1 } },
  });
}
