import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CheckoutsService } from './checkouts.service.js';
import { CreateServiceCheckoutDto } from './dto/create-service-checkout.dto.js';

/** No `:branchId` route param exists here (matches every other id-scoped
 * service-session route) — CheckoutsService.create loads the session
 * first and re-checks branch access against the caller's own tenant
 * context. */
@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/service-sessions/:serviceSessionId/checkout')
export class CheckoutCreationController {
  constructor(private readonly checkoutsService: CheckoutsService) {}

  @RequirePermissions('checkouts.create')
  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Param('serviceSessionId') serviceSessionId: string,
    @Body() dto: CreateServiceCheckoutDto,
    @Req() request: RequestWithId,
  ) {
    return this.checkoutsService.create(tenant, serviceSessionId, request.requestId, dto.productItems);
  }
}
