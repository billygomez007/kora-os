import { Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service.js';
import { SubscriptionAccessService } from './subscription-access.service.js';
import { SubscriptionEventService } from './subscription-event.service.js';

@Module({
  providers: [
    EntitlementsService,
    SubscriptionAccessService,
    SubscriptionEventService,
  ],
  exports: [
    EntitlementsService,
    SubscriptionAccessService,
    SubscriptionEventService,
  ],
})
export class SubscriptionsModule {}
