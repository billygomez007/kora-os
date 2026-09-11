import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequireBranchParam } from '../../common/authorization/decorators/require-branch-param.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { AppointmentBookingService } from './appointment-booking.service.js';
import { AppointmentCommandsService } from './appointment-commands.service.js';
import { AppointmentQueriesService } from './appointment-queries.service.js';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto.js';
import { CreateStaffAppointmentDto } from './dto/create-staff-appointment.dto.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';

@UseGuards(TenantAccessGuard)
@RequireBranchParam('branchId')
@Controller('organizations/:organizationId/branches/:branchId/appointments')
export class OrganizationAppointmentsController {
  constructor(
    private readonly bookingService: AppointmentBookingService,
    private readonly commandsService: AppointmentCommandsService,
    private readonly queriesService: AppointmentQueriesService,
  ) {}

  @RequirePermissions('appointments.read')
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    const assignedStaffProfileId =
      await this.resolveAppointmentReadScope(tenant);

    return this.queriesService.listForOrganizationBranch(
      tenant.organizationId,
      branchId,
      {
        from: query.from,
        to: query.to,
        cursor: query.cursor,
        limit: query.limit,
        assignedStaffProfileId,
      },
    );
  }

  @RequirePermissions('appointments.read')
  @Get(':appointmentId')
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('appointmentId') appointmentId: string,
  ) {
    const assignedStaffProfileId =
      await this.resolveAppointmentReadScope(tenant);

    return this.queriesService.getForOrganization(
      tenant.organizationId,
      branchId,
      appointmentId,
      assignedStaffProfileId,
    );
  }

  @RequirePermissions('appointments.manage')
  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Body() dto: CreateStaffAppointmentDto,
    @Req() request: RequestWithId,
  ) {
    return this.bookingService.createStaffAppointment({
      organizationId: tenant.organizationId,
      branchId,
      serviceIds: dto.serviceIds,
      staffProfileId: dto.staffProfileId,
      startAtIso: dto.startAt,
      customerProfileId: dto.customerProfileId,
      newCustomer: dto.newCustomer,
      idempotencyKey: dto.idempotencyKey,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      requestId: request.requestId,
    });
  }

  @RequirePermissions('appointments.manage')
  @Post(':appointmentId/cancel')
  async cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: CancelAppointmentDto,
    @Req() request: RequestWithId,
  ) {
    return this.commandsService.cancel(
      appointmentId,
      {
        organizationId: tenant.organizationId,
        branchId,
        actorUserId: tenant.userId,
        actorMembershipId: tenant.membershipId,
        requestId: request.requestId,
      },
      dto.reason,
    );
  }

  @RequirePermissions('appointments.manage')
  @Post(':appointmentId/reschedule')
  async reschedule(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: RescheduleAppointmentDto,
    @Req() request: RequestWithId,
  ) {
    return this.commandsService.reschedule(
      appointmentId,
      {
        organizationId: tenant.organizationId,
        branchId,
        actorUserId: tenant.userId,
        actorMembershipId: tenant.membershipId,
        requestId: request.requestId,
      },
      dto.startAt,
      dto.staffProfileId,
    );
  }

  @RequirePermissions('appointments.manage')
  @Post(':appointmentId/no-show')
  async markNoShow(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Param('appointmentId') appointmentId: string,
    @Req() request: RequestWithId,
  ) {
    return this.commandsService.markNoShow(appointmentId, {
      organizationId: tenant.organizationId,
      branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      requestId: request.requestId,
    });
  }
  private async resolveAppointmentReadScope(
    tenant: TenantContext,
  ): Promise<string | undefined> {
    if (
      tenant.isOwner ||
      tenant.permissionCodes.has('appointments.manage')
    ) {
      return undefined;
    }

    const staffProfile =
      await this.queriesService.resolveStaffProfileForMembership(
        tenant.organizationId,
        tenant.membershipId,
      );

    return staffProfile.id;
  }

}
