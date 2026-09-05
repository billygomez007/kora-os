import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface.js';
import type { StaffInvitationStatus } from '../../generated/prisma/client.js';
import { CreateStaffInvitationDto } from './dto/create-staff-invitation.dto.js';
import { StaffInvitationService } from './staff-invitation.service.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';

@Controller()
export class StaffInvitationsController {
  constructor(private readonly staffInvitationService: StaffInvitationService) {}

  @UseGuards(TenantAccessGuard)
  @RequirePermissions('staff.invite')
  @Post('organizations/:organizationId/staff-invitations')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateStaffInvitationDto,
    @Req() request: RequestWithId,
  ) {
    return this.staffInvitationService.create({
      organizationId: tenant.organizationId,
      invitedByMembershipId: tenant.membershipId,
      actorUserId: tenant.userId,
      email: dto.email,
      phone: dto.phone,
      roleId: dto.roleId,
      branchId: dto.branchId,
      requestId: request.requestId,
    });
  }

  @UseGuards(TenantAccessGuard)
  @RequirePermissions('staff.read')
  @Get('organizations/:organizationId/staff-invitations')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: StaffInvitationStatus,
  ) {
    return this.staffInvitationService.list(tenant.organizationId, status);
  }

  @UseGuards(TenantAccessGuard)
  @RequirePermissions('staff.invite')
  @Get('organizations/:organizationId/staff-invitations/assignable-roles')
  async assignableRoles(@CurrentTenant() tenant: TenantContext) {
    return this.staffInvitationService.listAssignableRoles(tenant.organizationId);
  }

  @Public()
  @Get('staff-invitations/:token')
  async getByToken(@Param('token') token: string) {
    return this.staffInvitationService.getByToken(token);
  }

  @Post('staff-invitations/:token/accept')
  async accept(
    @Param('token') token: string,
    @CurrentUser() user: RequestUser,
    @Req() request: RequestWithId,
  ) {
    return this.staffInvitationService.accept(token, user.id, request.requestId);
  }

  @Post('staff-invitations/:token/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reject(
    @Param('token') token: string,
    @CurrentUser() user: RequestUser,
    @Req() request: RequestWithId,
  ) {
    await this.staffInvitationService.reject(token, user.id, request.requestId);
  }

  @UseGuards(TenantAccessGuard)
  @RequirePermissions('staff.invite')
  @Post('organizations/:organizationId/staff-invitations/:invitationId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @Param('invitationId') invitationId: string,
    @Req() request: RequestWithId,
  ) {
    await this.staffInvitationService.revoke({
      organizationId: tenant.organizationId,
      invitationId,
      actorMembershipId: tenant.membershipId,
      actorUserId: tenant.userId,
      requestId: request.requestId,
    });
  }
}
