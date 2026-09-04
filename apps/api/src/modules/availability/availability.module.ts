import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { DiscoveryModule } from '../discovery/discovery.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { AvailabilityEngineService } from './availability-engine.service.js';
import { OrganizationAvailabilityController } from './organization-availability.controller.js';
import { PublicAvailabilityController } from './public-availability.controller.js';
import { PublicAvailabilityService } from './public-availability.service.js';

@Module({
  imports: [AuthorizationModule, DiscoveryModule, SchedulingModule],
  controllers: [PublicAvailabilityController, OrganizationAvailabilityController],
  providers: [AvailabilityEngineService, PublicAvailabilityService],
  exports: [AvailabilityEngineService],
})
export class AvailabilityModule {}
