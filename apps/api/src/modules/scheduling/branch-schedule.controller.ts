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
import { BranchScheduleService } from './branch-schedule.service.js';
import { CreateBranchScheduleExceptionDto } from './dto/create-branch-schedule-exception.dto.js';
import { ReplaceBusinessHoursDto } from './dto/replace-business-hours.dto.js';
import { UpsertBookingPolicyDto } from './dto/upsert-booking-policy.dto.js';

@UseGuards(TenantAccessGuard)
@RequireBranchParam('branchId')
@Controller('organizations/:organizationId/branches/:branchId')
export class BranchScheduleController {
  constructor(private readonly branchScheduleService: BranchScheduleService) {}

  @RequirePermissions('availability.read')
  @Get('business-hours')
  async listBusinessHours(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
  ) {
    return this.branchScheduleService.listBusinessHours(tenant.organizationId, branchId);
  }

  @RequirePermissions('availability.manage')
  @Put('business-hours')
  async replaceBusinessHours(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Body() dto: ReplaceBusinessHoursDto,
    @Req() request: RequestWithId,
  ) {
    return this.branchScheduleService.replaceBusinessHours(actorFrom(tenant, branchId, request), dto);
  }

  @RequirePermissions('availability.read')
  @Get('schedule-exceptions')
  async listScheduleExceptions(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.branchScheduleService.listScheduleExceptions(tenant.organizationId, branchId, {
      from,
      to,
    });
  }

  @RequirePermissions('availability.manage')
  @Post('schedule-exceptions')
  async upsertScheduleException(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Body() dto: CreateBranchScheduleExceptionDto,
    @Req() request: RequestWithId,
  ) {
    return this.branchScheduleService.upsertScheduleException(
      actorFrom(tenant, branchId, request),
      dto,
    );
  }

  @RequirePermissions('availability.manage')
  @Delete('schedule-exceptions/:exceptionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteScheduleException(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('exceptionId') exceptionId: string,
    @Req() request: RequestWithId,
  ) {
    await this.branchScheduleService.deleteScheduleException(
      actorFrom(tenant, branchId, request),
      exceptionId,
    );
  }

  @RequirePermissions('availability.read')
  @Get('booking-policy')
  async getBookingPolicy(@CurrentTenant() tenant: TenantContext, @Param('branchId') branchId: string) {
    return this.branchScheduleService.getBookingPolicy(tenant.organizationId, branchId);
  }

  @RequirePermissions('availability.manage')
  @Put('booking-policy')
  async upsertBookingPolicy(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Body() dto: UpsertBookingPolicyDto,
    @Req() request: RequestWithId,
  ) {
    return this.branchScheduleService.upsertBookingPolicy(actorFrom(tenant, branchId, request), dto);
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
