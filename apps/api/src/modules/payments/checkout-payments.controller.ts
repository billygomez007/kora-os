import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { RecordPaymentDto } from './dto/record-payment.dto.js';
import { PaymentsService } from './payments.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/checkouts/:checkoutId/payments')
export class CheckoutPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @RequirePermissions('payments.read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Param('checkoutId') checkoutId: string) {
    return this.paymentsService.listForCheckout(tenant, checkoutId);
  }

  @RequirePermissions('payments.record')
  @Post()
  async record(
    @CurrentTenant() tenant: TenantContext,
    @Param('checkoutId') checkoutId: string,
    @Body() dto: RecordPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.paymentsService.record(tenant, checkoutId, dto, idempotencyKey, request.requestId);
  }
}
