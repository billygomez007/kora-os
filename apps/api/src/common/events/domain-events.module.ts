import { Global, Module } from '@nestjs/common';
import { DomainEventEmitter } from './domain-event-emitter.service.js';

/** Global so every feature module can inject DomainEventEmitter without
 * re-importing this module — the same convention DatabaseModule uses for
 * PrismaService. */
@Global()
@Module({
  providers: [DomainEventEmitter],
  exports: [DomainEventEmitter],
})
export class DomainEventsModule {}
