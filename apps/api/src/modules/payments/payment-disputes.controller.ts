import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { ListPaymentDisputesQueryDto } from './dto/list-payment-disputes-query.dto.js';
import { ResolvePaymentDisputeDto } from './dto/resolve-payment-dispute.dto.js';
import { PaymentDisputesService } from './payment-disputes.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/payment-disputes')
export class PaymentDisputesController {
  constructor(private readonly disputesService: PaymentDisputesService) {}

  @RequirePermissions('payments.resolve')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: ListPaymentDisputesQueryDto) {
    return this.disputesService.list(tenant, { status: query.status, cursor: query.cursor, limit: query.limit });
  }

  @RequirePermissions('payments.resolve')
  @Get(':disputeId')
  async get(@CurrentTenant() tenant: TenantContext, @Param('disputeId') disputeId: string) {
    return this.disputesService.get(tenant, disputeId);
  }

  @RequirePermissions('payments.resolve')
  @Post(':disputeId/resolve')
  async resolve(
    @CurrentTenant() tenant: TenantContext,
    @Param('disputeId') disputeId: string,
    @Body() dto: ResolvePaymentDisputeDto,
    @Req() request: RequestWithId,
  ) {
    return this.disputesService.resolve(tenant, disputeId, dto, request.requestId);
  }
}
