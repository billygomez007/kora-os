import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module.js';
import { DiscoveryModule } from '../discovery/discovery.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { AppointmentBookingService } from './appointment-booking.service.js';
import { AppointmentCommandsService } from './appointment-commands.service.js';
import { AppointmentQueriesService } from './appointment-queries.service.js';
import { CustomerAppointmentsController } from './customer-appointments.controller.js';
import { OrganizationAppointmentsController } from './organization-appointments.controller.js';

@Module({
  imports: [
    AuditModule,
    AuthorizationModule,
    AvailabilityModule,
    SchedulingModule,
    DiscoveryModule,
    SubscriptionsModule,
    CustomerProfileModule,
  ],
  controllers: [CustomerAppointmentsController, OrganizationAppointmentsController],
  providers: [AppointmentBookingService, AppointmentCommandsService, AppointmentQueriesService],
})
export class AppointmentsModule {}
