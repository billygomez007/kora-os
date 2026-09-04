import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
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
}
