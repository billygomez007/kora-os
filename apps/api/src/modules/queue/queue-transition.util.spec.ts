import { describe, expect, it } from 'vitest';
import { QueueEntryStatus } from '../../generated/prisma/client.js';
import { assertQueueTransitionAllowed } from './queue-transition.util.js';

describe('assertQueueTransitionAllowed', () => {
  const allowed: Array<[QueueEntryStatus, QueueEntryStatus]> = [
    [QueueEntryStatus.WAITING, QueueEntryStatus.CALLED],
    [QueueEntryStatus.WAITING, QueueEntryStatus.IN_SERVICE],
    [QueueEntryStatus.WAITING, QueueEntryStatus.CANCELLED],
    [QueueEntryStatus.WAITING, QueueEntryStatus.NO_SHOW],
    [QueueEntryStatus.CALLED, QueueEntryStatus.WAITING],
    [QueueEntryStatus.CALLED, QueueEntryStatus.IN_SERVICE],
    [QueueEntryStatus.CALLED, QueueEntryStatus.CANCELLED],
    [QueueEntryStatus.CALLED, QueueEntryStatus.NO_SHOW],
    [QueueEntryStatus.IN_SERVICE, QueueEntryStatus.COMPLETED],
  ];

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(() => assertQueueTransitionAllowed(from, to)).not.toThrow();
  });

  const rejected: Array<[QueueEntryStatus, QueueEntryStatus]> = [
    [QueueEntryStatus.WAITING, QueueEntryStatus.COMPLETED],
    [QueueEntryStatus.CALLED, QueueEntryStatus.COMPLETED],
    [QueueEntryStatus.IN_SERVICE, QueueEntryStatus.WAITING],
    [QueueEntryStatus.IN_SERVICE, QueueEntryStatus.CALLED],
    [QueueEntryStatus.IN_SERVICE, QueueEntryStatus.CANCELLED],
    [QueueEntryStatus.IN_SERVICE, QueueEntryStatus.NO_SHOW],
    [QueueEntryStatus.COMPLETED, QueueEntryStatus.WAITING],
    [QueueEntryStatus.CANCELLED, QueueEntryStatus.WAITING],
    [QueueEntryStatus.NO_SHOW, QueueEntryStatus.WAITING],
    [QueueEntryStatus.WAITING, QueueEntryStatus.WAITING],
  ];

  it.each(rejected)('rejects %s -> %s', (from, to) => {
    expect(() => assertQueueTransitionAllowed(from, to)).toThrow();
  });

  it('terminal states have no outgoing transitions', () => {
    for (const terminal of [QueueEntryStatus.COMPLETED, QueueEntryStatus.CANCELLED, QueueEntryStatus.NO_SHOW]) {
      for (const target of Object.values(QueueEntryStatus)) {
        expect(() => assertQueueTransitionAllowed(terminal, target)).toThrow();
      }
    }
  });
});
