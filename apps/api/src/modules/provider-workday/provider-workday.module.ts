import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { ProviderWorkdayController } from './provider-workday.controller.js';
import { ProviderWorkdayService } from './provider-workday.service.js';

@Module({
  imports: [AuthorizationModule],
  controllers: [ProviderWorkdayController],
  providers: [ProviderWorkdayService],
})
export class ProviderWorkdayModule {}
