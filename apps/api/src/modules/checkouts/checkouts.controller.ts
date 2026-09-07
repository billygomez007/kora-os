import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CheckoutsService } from './checkouts.service.js';
import { CreateCheckoutAdjustmentDto } from './dto/create-checkout-adjustment.dto.js';
import { CreateProductCheckoutDto } from './dto/create-product-checkout.dto.js';
import { ListCheckoutsQueryDto } from './dto/list-checkouts-query.dto.js';
import { VoidCheckoutDto } from './dto/void-checkout.dto.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/checkouts')
export class CheckoutsController {
  constructor(private readonly checkoutsService: CheckoutsService) {}

  /** Product-only checkout — a retail sale with no ServiceSession
   * (docs task: product/mixed checkout). The service-session-scoped
   * `POST .../service-sessions/:id/checkout` (CheckoutCreationController)
   * is unaffected and remains the only way to create a service or mixed
   * checkout. */
  @RequirePermissions('checkouts.create')
  @Post()
  async createProductCheckout(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateProductCheckoutDto,
    @Req() request: RequestWithId,
  ) {
    return this.checkoutsService.createForProductSale(tenant, dto, request.requestId);
  }

  @RequirePermissions('checkouts.read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: ListCheckoutsQueryDto) {
    return this.checkoutsService.list(tenant, {
      branchId: query.branchId,
      status: query.status,
      assignedStaffProfileId: query.assignedStaffProfileId,
      customerRecordId: query.customerRecordId,
      serviceSessionId: query.serviceSessionId,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @RequirePermissions('checkouts.read')
  @Get(':checkoutId')
  async get(@CurrentTenant() tenant: TenantContext, @Param('checkoutId') checkoutId: string) {
    return this.checkoutsService.get(tenant, checkoutId);
  }

  @RequirePermissions('checkouts.adjust')
  @Post(':checkoutId/adjustments')
  async addAdjustment(
    @CurrentTenant() tenant: TenantContext,
    @Param('checkoutId') checkoutId: string,
    @Body() dto: CreateCheckoutAdjustmentDto,
    @Req() request: RequestWithId,
  ) {
    return this.checkoutsService.addAdjustment(tenant, checkoutId, dto, request.requestId);
  }

  @RequirePermissions('checkouts.void')
  @Post(':checkoutId/void')
  async void(
    @CurrentTenant() tenant: TenantContext,
    @Param('checkoutId') checkoutId: string,
    @Body() dto: VoidCheckoutDto,
    @Req() request: RequestWithId,
  ) {
    return this.checkoutsService.void(tenant, checkoutId, dto, request.requestId);
  }
}
