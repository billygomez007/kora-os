import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface.js';
import { CustomerProfileService } from '../customer-profile/customer-profile.service.js';
import { AppointmentBookingService } from './appointment-booking.service.js';
import { AppointmentCommandsService } from './appointment-commands.service.js';
import { AppointmentQueriesService } from './appointment-queries.service.js';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';

@Controller('me/appointments')
export class CustomerAppointmentsController {
  constructor(
    private readonly bookingService: AppointmentBookingService,
    private readonly commandsService: AppointmentCommandsService,
    private readonly queriesService: AppointmentQueriesService,
    private readonly customerProfileService: CustomerProfileService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAppointmentDto,
    @Req() request: RequestWithId,
  ) {
    return this.bookingService.createCustomerAppointment({
      userId: user.id,
      businessSlug: dto.businessSlug,
      branchId: dto.branchId,
      serviceIds: dto.serviceIds,
      requestedStaffProfileId: dto.staffProfileId,
      startAtIso: dto.startAt,
      idempotencyKey: dto.idempotencyKey,
      requestId: request.requestId,
    });
  }

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const customerProfileId = await this.customerProfileService.getOrCreateId(user.id);
    return this.queriesService.listForCustomer(customerProfileId, {
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':appointmentId')
  async get(@CurrentUser() user: RequestUser, @Param('appointmentId') appointmentId: string) {
    const customerProfileId = await this.customerProfileService.getOrCreateId(user.id);
    return this.queriesService.getForCustomer(customerProfileId, appointmentId);
  }

  @Post(':appointmentId/cancel')
  async cancel(
    @CurrentUser() user: RequestUser,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: CancelAppointmentDto,
    @Req() request: RequestWithId,
  ) {
    const customerProfileId = await this.customerProfileService.getOrCreateId(user.id);
    return this.commandsService.cancel(
      appointmentId,
      { customerUserId: user.id, customerProfileId, requestId: request.requestId },
      dto.reason,
    );
  }

  @Post(':appointmentId/reschedule')
  async reschedule(
    @CurrentUser() user: RequestUser,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: RescheduleAppointmentDto,
    @Req() request: RequestWithId,
  ) {
    const customerProfileId = await this.customerProfileService.getOrCreateId(user.id);
    return this.commandsService.reschedule(
      appointmentId,
      { customerUserId: user.id, customerProfileId, requestId: request.requestId },
      dto.startAt,
      dto.staffProfileId,
    );
  }
}
