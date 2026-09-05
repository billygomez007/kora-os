import { Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service.js';
import { SubscriptionAccessService } from './subscription-access.service.js';
import { SubscriptionEventService } from './subscription-event.service.js';

/**
 * Foundational, provider-only module -- deliberately never imports
 * AuthorizationModule, since AuthorizationModule itself imports this
 * module (TenantContextService resolves accessMode via
 * SubscriptionAccessService). The HTTP-facing subscription-detail
 * endpoint lives in the separate SubscriptionDetailModule instead,
 * which imports both this module and AuthorizationModule side by
 * side -- the same shape OrganizationsModule already uses -- rather
 * than risking a circular module dependency here.
 */
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
