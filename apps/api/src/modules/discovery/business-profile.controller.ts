import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequireBranchParam } from '../../common/authorization/decorators/require-branch-param.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { BusinessProfileService } from './business-profile.service.js';
import { UpdateBranchDiscoveryDto } from './dto/update-branch-discovery.dto.js';
import { UpsertBusinessProfileDto } from './dto/upsert-business-profile.dto.js';

@UseGuards(TenantAccessGuard)
@RequirePermissions('business_profile.manage')
@Controller()
export class BusinessProfileController {
  constructor(private readonly businessProfileService: BusinessProfileService) {}

  @Get('organizations/:organizationId/business-profile')
  async get(@CurrentTenant() tenant: TenantContext) {
    return this.businessProfileService.getForOrganization(tenant.organizationId);
  }

  @Put('organizations/:organizationId/business-profile')
  async upsert(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertBusinessProfileDto,
  ) {
    return this.businessProfileService.upsert(tenant.organizationId, dto);
  }

  @Post('organizations/:organizationId/business-profile/publish')
  async publish(@CurrentTenant() tenant: TenantContext) {
    return this.businessProfileService.publish(tenant.organizationId);
  }

  @Post('organizations/:organizationId/business-profile/unpublish')
  async unpublish(@CurrentTenant() tenant: TenantContext) {
    return this.businessProfileService.unpublish(tenant.organizationId);
  }

  @RequireBranchParam('branchId')
  @Put('organizations/:organizationId/branches/:branchId/discovery')
  async updateBranchDiscovery(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchDiscoveryDto,
  ) {
    return this.businessProfileService.updateBranchDiscovery(
      tenant.organizationId,
      branchId,
      dto,
    );
  }
}
