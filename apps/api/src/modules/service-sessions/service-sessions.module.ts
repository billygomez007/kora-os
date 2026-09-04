import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';
import { ServiceSessionQueriesService } from './service-session-queries.service.js';
import { ServiceSessionsController } from './service-sessions.controller.js';
import { ServiceSessionsService } from './service-sessions.service.js';

@Module({
  imports: [AuditModule, AuthorizationModule, AvailabilityModule],
  controllers: [ServiceSessionsController],
  providers: [ServiceSessionsService, ServiceSessionQueriesService],
  exports: [ServiceSessionsService],
})
export class ServiceSessionsModule {}
