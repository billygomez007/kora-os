import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { ListMyVerificationsQueryDto } from './dto/list-my-verifications-query.dto.js';
import { PaymentVerificationsService } from './payment-verifications.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/payment-verifications')
export class PaymentVerificationsController {
  constructor(private readonly verificationsService: PaymentVerificationsService) {}

  @RequirePermissions('payments.verify_own')
  @Get('pending')
  async pending(@CurrentTenant() tenant: TenantContext) {
    return this.verificationsService.listPendingForProvider(tenant);
  }

  @RequirePermissions('payments.verify_own')
  @Get()
  async mine(@CurrentTenant() tenant: TenantContext, @Query() query: ListMyVerificationsQueryDto) {
    return this.verificationsService.listMineForProvider(tenant, query.status);
  }
}
