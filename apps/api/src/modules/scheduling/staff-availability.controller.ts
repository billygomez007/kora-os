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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequireBranchParam } from '../../common/authorization/decorators/require-branch-param.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CreateStaffAvailabilityExceptionDto } from './dto/create-staff-availability-exception.dto.js';
import { ReplaceStaffAvailabilityRulesDto } from './dto/replace-staff-availability-rules.dto.js';
import { StaffAvailabilityService } from './staff-availability.service.js';

@UseGuards(TenantAccessGuard)
@RequireBranchParam('branchId')
@Controller('organizations/:organizationId/branches/:branchId/staff/:staffProfileId')
export class StaffAvailabilityController {
  constructor(private readonly staffAvailabilityService: StaffAvailabilityService) {}

  @RequirePermissions('availability.read')
  @Get('availability-rules')
  async listRules(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('staffProfileId') staffProfileId: string,
  ) {
    return this.staffAvailabilityService.listRules(tenant.organizationId, branchId, staffProfileId);
  }

  @RequirePermissions('availability.manage')
  @Put('availability-rules')
  async replaceRules(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('staffProfileId') staffProfileId: string,
    @Body() dto: ReplaceStaffAvailabilityRulesDto,
    @Req() request: RequestWithId,
  ) {
    return this.staffAvailabilityService.replaceRules(
      actorFrom(tenant, branchId, staffProfileId, request),
      dto,
    );
  }

  @RequirePermissions('availability.read')
  @Get('availability-exceptions')
  async listExceptions(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('staffProfileId') staffProfileId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.staffAvailabilityService.listExceptions(
      tenant.organizationId,
      branchId,
      staffProfileId,
      { from, to },
    );
  }

  @RequirePermissions('availability.manage')
  @Post('availability-exceptions')
  async createException(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('staffProfileId') staffProfileId: string,
    @Body() dto: CreateStaffAvailabilityExceptionDto,
    @Req() request: RequestWithId,
  ) {
    return this.staffAvailabilityService.createException(
      actorFrom(tenant, branchId, staffProfileId, request),
      dto,
    );
  }

  @RequirePermissions('availability.manage')
  @Delete('availability-exceptions/:exceptionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteException(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('staffProfileId') staffProfileId: string,
    @Param('exceptionId') exceptionId: string,
    @Req() request: RequestWithId,
  ) {
    await this.staffAvailabilityService.deleteException(
      actorFrom(tenant, branchId, staffProfileId, request),
      exceptionId,
    );
  }
}

function actorFrom(
  tenant: TenantContext,
  branchId: string,
  staffProfileId: string,
  request: RequestWithId,
) {
  return {
    organizationId: tenant.organizationId,
    branchId,
    staffProfileId,
    actorUserId: tenant.userId,
    actorMembershipId: tenant.membershipId,
    requestId: request.requestId,
  };
}
