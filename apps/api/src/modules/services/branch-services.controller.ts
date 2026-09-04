import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequireBranchParam } from '../../common/authorization/decorators/require-branch-param.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { BranchServicesService } from './branch-services.service.js';
import { AssignStaffServiceDto } from './dto/assign-staff-service.dto.js';
import { UpsertBranchServiceDto } from './dto/upsert-branch-service.dto.js';

@UseGuards(TenantAccessGuard)
@RequireBranchParam('branchId')
@Controller('organizations/:organizationId/branches/:branchId/services')
export class BranchServicesController {
  constructor(private readonly branchServicesService: BranchServicesService) {}

  @RequirePermissions('services.read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Param('branchId') branchId: string) {
    return this.branchServicesService.list(tenant.organizationId, branchId);
  }

  @RequirePermissions('services.manage')
  @Put(':serviceId')
  async upsert(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpsertBranchServiceDto,
    @Req() request: RequestWithId,
  ) {
    return this.branchServicesService.upsert(actorFrom(tenant, branchId, request), serviceId, dto);
  }

  @RequirePermissions('services.read')
  @Get(':serviceId/staff')
  async listStaff(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('serviceId') serviceId: string,
  ) {
    return this.branchServicesService.listStaff(tenant.organizationId, branchId, serviceId);
  }

  @RequirePermissions('services.manage')
  @Post(':serviceId/staff')
  async assignStaff(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: AssignStaffServiceDto,
    @Req() request: RequestWithId,
  ) {
    return this.branchServicesService.assignStaff(
      actorFrom(tenant, branchId, request),
      serviceId,
      dto,
    );
  }

  @RequirePermissions('services.manage')
  @Delete(':serviceId/staff/:staffProfileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unassignStaff(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('serviceId') serviceId: string,
    @Param('staffProfileId') staffProfileId: string,
    @Req() request: RequestWithId,
  ) {
    await this.branchServicesService.unassignStaff(
      actorFrom(tenant, branchId, request),
      serviceId,
      staffProfileId,
    );
  }
}

function actorFrom(tenant: TenantContext, branchId: string, request: RequestWithId) {
  return {
    organizationId: tenant.organizationId,
    branchId,
    actorUserId: tenant.userId,
    actorMembershipId: tenant.membershipId,
    requestId: request.requestId,
  };
}
