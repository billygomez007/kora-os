import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';
import { ServiceSessionsModule } from '../service-sessions/service-sessions.module.js';
import { AppointmentCheckInController } from './appointment-check-in.controller.js';
import { BranchQueueController } from './branch-queue.controller.js';
import { QueueCommandsService } from './queue-commands.service.js';
import { QueueEntriesController } from './queue-entries.controller.js';
import { QueueIntakeService } from './queue-intake.service.js';
import { QueueQueriesService } from './queue-queries.service.js';

@Module({
  imports: [AuditModule, AuthorizationModule, AvailabilityModule, ServiceSessionsModule],
  controllers: [BranchQueueController, QueueEntriesController, AppointmentCheckInController],
  providers: [QueueIntakeService, QueueCommandsService, QueueQueriesService],
})
export class QueueModule {}
