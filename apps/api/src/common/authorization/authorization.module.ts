import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../../modules/subscriptions/subscriptions.module.js';
import { TenantAccessGuard } from './tenant-access.guard.js';
import { TenantContextService } from './tenant-context.service.js';

@Module({
  imports: [SubscriptionsModule],
  providers: [TenantContextService, TenantAccessGuard],
  exports: [TenantContextService, TenantAccessGuard],
})
export class AuthorizationModule {}
