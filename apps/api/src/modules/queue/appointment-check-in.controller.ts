import { Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { QueueIntakeService } from './queue-intake.service.js';

/** Deliberately not branch-scoped in the route (docs task suggested
 * surface: `/organizations/:organizationId/appointments/:id/check-in`)
 * — the branch is resolved from the appointment itself, and
 * QueueIntakeService verifies it against the actor's own tenant context. */
@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/appointments')
export class AppointmentCheckInController {
  constructor(private readonly intakeService: QueueIntakeService) {}

  @RequirePermissions('queue.manage')
  @Post(':appointmentId/check-in')
  async checkIn(
    @CurrentTenant() tenant: TenantContext,
    @Param('appointmentId') appointmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.intakeService.checkInAppointment(
      tenant,
      {
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        actorMembershipId: tenant.membershipId,
        requestId: request.requestId,
      },
      appointmentId,
      idempotencyKey,
    );
  }
}
