import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { BusinessProfileController } from './business-profile.controller.js';
import { BusinessProfileService } from './business-profile.service.js';
import { DiscoveryController } from './discovery.controller.js';
import { DiscoveryService } from './discovery.service.js';

@Module({
  imports: [AuthorizationModule],
  controllers: [DiscoveryController, BusinessProfileController],
  providers: [DiscoveryService, BusinessProfileService],
})
export class DiscoveryModule {}
