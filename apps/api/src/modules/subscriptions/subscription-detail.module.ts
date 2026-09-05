import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { SubscriptionDetailService } from './subscription-detail.service.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsModule } from './subscriptions.module.js';

@Module({
  imports: [SubscriptionsModule, AuthorizationModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionDetailService],
})
export class SubscriptionDetailModule {}
