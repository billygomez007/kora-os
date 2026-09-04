import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequireAnyPermission } from '../../common/authorization/decorators/require-any-permission.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { StartServiceSessionDto } from '../service-sessions/dto/start-service-session.dto.js';
import { ServiceSessionsService } from '../service-sessions/service-sessions.service.js';
import { AssignQueueStaffDto } from './dto/assign-queue-staff.dto.js';
import { CancelQueueEntryDto } from './dto/cancel-queue-entry.dto.js';
import { QueueCommandsService } from './queue-commands.service.js';

/** No `:branchId` route param exists here (docs task suggested API
 * surface) — every command loads the entry first and re-checks branch
 * access against the actor's own tenant context (see
 * QueueCommandsService/assertMembershipHasBranchAccess), the same
 * pattern id-scoped appointment/service-session routes already use. */
@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/queue-entries')
export class QueueEntriesController {
  constructor(
    private readonly commandsService: QueueCommandsService,
    private readonly serviceSessionsService: ServiceSessionsService,
  ) {}

  @RequirePermissions('queue.read')
  @Get(':queueEntryId')
  async get(@CurrentTenant() tenant: TenantContext, @Param('queueEntryId') queueEntryId: string) {
    return this.commandsService.getOne(tenant, queueEntryId);
  }

  @RequirePermissions('queue.manage')
  @Post(':queueEntryId/call')
  async call(
    @CurrentTenant() tenant: TenantContext,
    @Param('queueEntryId') queueEntryId: string,
    @Req() request: RequestWithId,
  ) {
    return this.commandsService.call(tenant, request.requestId, queueEntryId);
  }

  @RequirePermissions('queue.manage')
  @Post(':queueEntryId/return-to-waiting')
  async returnToWaiting(
    @CurrentTenant() tenant: TenantContext,
    @Param('queueEntryId') queueEntryId: string,
    @Req() request: RequestWithId,
  ) {
    return this.commandsService.returnToWaiting(tenant, request.requestId, queueEntryId);
  }

  @RequirePermissions('queue.manage')
  @Post(':queueEntryId/assign')
  async assign(
    @CurrentTenant() tenant: TenantContext,
    @Param('queueEntryId') queueEntryId: string,
    @Body() dto: AssignQueueStaffDto,
    @Req() request: RequestWithId,
  ) {
    return this.commandsService.assign(tenant, request.requestId, queueEntryId, dto.staffProfileId);
  }

  @RequirePermissions('queue.manage')
  @Post(':queueEntryId/cancel')
  async cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param('queueEntryId') queueEntryId: string,
    @Body() dto: CancelQueueEntryDto,
    @Req() request: RequestWithId,
  ) {
    return this.commandsService.cancel(tenant, request.requestId, queueEntryId, dto.reason);
  }

  @RequirePermissions('queue.manage')
  @Post(':queueEntryId/no-show')
  async noShow(
    @CurrentTenant() tenant: TenantContext,
    @Param('queueEntryId') queueEntryId: string,
    @Req() request: RequestWithId,
  ) {
    return this.commandsService.noShow(tenant, request.requestId, queueEntryId);
  }

  /** The guard's `@RequireAnyPermission` is only the coarse "can reach
   * this route at all" gate — `service_sessions.start` (receptionist,
   * limited to the already-assigned provider), `.perform` (a provider
   * starting their own work), or `.manage` (owner/manager, unrestricted)
   * all pass it. ServiceSessionsService.start then applies the
   * fine-grained rule each specific permission actually carries. */
  @RequireAnyPermission('service_sessions.start', 'service_sessions.perform', 'service_sessions.manage')
  @Post(':queueEntryId/start-service')
  async startService(
    @CurrentTenant() tenant: TenantContext,
    @Param('queueEntryId') queueEntryId: string,
    @Body() dto: StartServiceSessionDto,
    @Req() request: RequestWithId,
  ) {
    return this.serviceSessionsService.start(tenant, queueEntryId, dto, request.requestId);
  }
}
