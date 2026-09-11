import { Module } from '@nestjs/common';
import { PlatformModule as PlatformAuthorizationModule } from '../../common/platform/platform.module.js';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';

@Module({
  imports: [PlatformAuthorizationModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
