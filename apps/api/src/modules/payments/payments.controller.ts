import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequireAnyPermission } from '../../common/authorization/decorators/require-any-permission.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto.js';
import { DisputePaymentDto } from './dto/dispute-payment.dto.js';
import { VoidPaymentDto } from './dto/void-payment.dto.js';
import { PaymentVerificationsService } from './payment-verifications.service.js';
import { PaymentsService } from './payments.service.js';

/** No `:branchId` route param exists here — every action loads the
 * payment first and re-checks branch access against the caller's own
 * tenant context, the same pattern every other id-scoped financial route
 * uses. */
@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly verificationsService: PaymentVerificationsService,
  ) {}

  /** The guard's `@RequireAnyPermission` is only the coarse "can reach
   * this route at all" gate — `assertConfirmAuthorized` (called inside
   * PaymentVerificationsService.confirm) applies the fine-grained rule
   * for each specific permission the caller holds. */
  @RequireAnyPermission('payments.verify_own', 'payments.resolve')
  @Post(':paymentId/confirm')
  async confirm(
    @CurrentTenant() tenant: TenantContext,
    @Param('paymentId') paymentId: string,
    @Body() dto: ConfirmPaymentDto,
    @Req() request: RequestWithId,
  ) {
    return this.verificationsService.confirm(tenant, paymentId, dto, request.requestId);
  }

  @RequirePermissions('payments.verify_own')
  @Post(':paymentId/dispute')
  async dispute(
    @CurrentTenant() tenant: TenantContext,
    @Param('paymentId') paymentId: string,
    @Body() dto: DisputePaymentDto,
    @Req() request: RequestWithId,
  ) {
    return this.verificationsService.dispute(tenant, paymentId, dto, request.requestId);
  }

  @RequirePermissions('payments.resolve')
  @Post(':paymentId/void')
  async void(
    @CurrentTenant() tenant: TenantContext,
    @Param('paymentId') paymentId: string,
    @Body() dto: VoidPaymentDto,
    @Req() request: RequestWithId,
  ) {
    return this.paymentsService.void(tenant, paymentId, dto, request.requestId);
  }
}
