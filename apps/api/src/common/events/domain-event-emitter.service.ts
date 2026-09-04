import { EventEmitter } from 'node:events';
import { Injectable, Logger } from '@nestjs/common';

export type DomainEventName =
  | 'ServiceCreated'
  | 'ServiceUpdated'
  | 'ServiceArchived'
  | 'ServiceRestored'
  | 'AvailabilityChanged'
  | 'AppointmentCreated'
  | 'AppointmentCancelled'
  | 'AppointmentRescheduled'
  | 'AppointmentNoShowMarked';

export interface DomainEventPayload {
  organizationId: string;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  [key: string]: unknown;
}

/**
 * Minimal in-process domain-event hook (docs task Phase 21). No external
 * notification provider is integrated yet — see docs/ARCHITECTURE.md
 * section 6 for exactly where a future outbox/notification subscriber
 * attaches to these same event names. Emitting is fire-and-forget and
 * synchronous within the current process only; it is never a substitute
 * for the durable, queryable audit trail AuditService writes, and a
 * listener throwing must never be allowed to fail the request that
 * triggered the event (see `emit`, which isolates listener errors).
 */
@Injectable()
export class DomainEventEmitter {
  private readonly logger = new Logger(DomainEventEmitter.name);
  private readonly emitter = new EventEmitter();

  /** Runs each listener in its own try/catch — Node's EventEmitter does
   * not do this itself, and a listener throwing must never break the
   * request that triggered the event. */
  emit(event: DomainEventName, payload: DomainEventPayload): void {
    for (const listener of this.emitter.listeners(event)) {
      try {
        (listener as (value: DomainEventPayload) => void)(payload);
      } catch (error) {
        this.logger.error(
          `Domain event listener for ${event} threw: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  on(event: DomainEventName, listener: (payload: DomainEventPayload) => void): void {
    this.emitter.on(event, listener);
  }
}
