import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { BranchScheduleController } from './branch-schedule.controller.js';
import { BranchScheduleService } from './branch-schedule.service.js';
import { StaffAvailabilityController } from './staff-availability.controller.js';
import { StaffAvailabilityService } from './staff-availability.service.js';

@Module({
  imports: [AuditModule, AuthorizationModule],
  controllers: [BranchScheduleController, StaffAvailabilityController],
  providers: [BranchScheduleService, StaffAvailabilityService],
  exports: [BranchScheduleService, StaffAvailabilityService],
})
export class SchedulingModule {}
