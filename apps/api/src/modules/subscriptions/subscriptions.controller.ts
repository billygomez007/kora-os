import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { SubscriptionDetailService } from './subscription-detail.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptionDetailService: SubscriptionDetailService) {}

  @RequirePermissions('subscriptions.read')
  @Get()
  async get(@Param('organizationId') organizationId: string) {
    return this.subscriptionDetailService.getForOrganization(organizationId);
  }
}
