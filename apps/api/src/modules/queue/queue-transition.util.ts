import { ConflictException } from '@nestjs/common';
import { QueueEntryStatus } from '../../generated/prisma/client.js';

/**
 * Explicit allow-list state machine (docs task Phase 3). IN_SERVICE is
 * reachable only through ServiceSessionsService.start, and COMPLETED
 * only through ServiceSessionsService.complete — neither appears as a
 * target of any plain queue command here, so a manual "complete this
 * queue entry" call is structurally impossible. Terminal states
 * (COMPLETED, CANCELLED, NO_SHOW) have no outgoing transitions at all.
 */
const ALLOWED_TRANSITIONS: Record<QueueEntryStatus, readonly QueueEntryStatus[]> = {
  [QueueEntryStatus.WAITING]: [
    QueueEntryStatus.CALLED,
    QueueEntryStatus.IN_SERVICE,
    QueueEntryStatus.CANCELLED,
    QueueEntryStatus.NO_SHOW,
  ],
  [QueueEntryStatus.CALLED]: [
    QueueEntryStatus.WAITING,
    QueueEntryStatus.IN_SERVICE,
    QueueEntryStatus.CANCELLED,
    QueueEntryStatus.NO_SHOW,
  ],
  [QueueEntryStatus.IN_SERVICE]: [QueueEntryStatus.COMPLETED],
  [QueueEntryStatus.COMPLETED]: [],
  [QueueEntryStatus.CANCELLED]: [],
  [QueueEntryStatus.NO_SHOW]: [],
};

export function assertQueueTransitionAllowed(
  current: QueueEntryStatus,
  next: QueueEntryStatus,
): void {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new ConflictException({
      code: 'QUEUE_ENTRY_INVALID_TRANSITION',
      message: `Cannot move a queue entry from ${current} to ${next}.`,
    });
  }
}
