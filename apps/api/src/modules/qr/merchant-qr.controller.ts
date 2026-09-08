import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CreateQrCodeDto } from './dto/create-qr-code.dto.js';
import { UpdateQrStatusDto } from './dto/update-qr-status.dto.js';
import { QrService } from './qr.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/qr-codes')
export class MerchantQrController {
  constructor(private readonly qrService: QrService) {}

  @RequirePermissions('products.read')
  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.qrService.listForOrganization(tenant.organizationId);
  }

  @RequirePermissions('products.read')
  @Get('business')
  business(@CurrentTenant() tenant: TenantContext) {
    return this.qrService.getBusinessQr(tenant.organizationId);
  }

  @RequirePermissions('products.manage')
  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateQrCodeDto,
    @Req() request: RequestWithId,
  ) {
    return this.qrService.createForOrganization(
      {
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        actorMembershipId: tenant.membershipId,
        requestId: request.requestId,
      },
      dto,
    );
  }

  @RequirePermissions('products.manage')
  @Patch(':qrCodeId/status')
  updateStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('qrCodeId') qrCodeId: string,
    @Body() dto: UpdateQrStatusDto,
  ) {
    return this.qrService.updateStatus(
      tenant.organizationId,
      qrCodeId,
      dto.isActive,
    );
  }

  @RequirePermissions('products.read')
  @Get(':qrCodeId')
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('qrCodeId') qrCodeId: string,
  ) {
    return this.qrService.getForOrganization(tenant.organizationId, qrCodeId);
  }

  @RequirePermissions('products.manage')
  @Post('business/ensure')
  ensureBusiness(
    @CurrentTenant() tenant: TenantContext,
    @Req() request: RequestWithId,
  ) {
    return this.qrService.ensureBusinessQr({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      requestId: request.requestId,
    });
  }
}
