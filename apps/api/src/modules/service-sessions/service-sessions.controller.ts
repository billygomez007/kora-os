import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CancelServiceSessionDto } from './dto/cancel-service-session.dto.js';
import { ListServiceSessionsQueryDto } from './dto/list-service-sessions-query.dto.js';
import { ReplaceServiceSessionItemsDto } from './dto/replace-service-session-items.dto.js';
import { ServiceSessionQueriesService } from './service-session-queries.service.js';
import { ServiceSessionsService } from './service-sessions.service.js';

/**
 * No `:branchId` route param exists here (docs task suggested API
 * surface) — mutating routes below rely entirely on
 * ServiceSessionsService's own OR-permission (`service_sessions.perform`
 * or `.manage`) and own-session-only checks rather than
 * `@RequirePermissions`, since NestJS's decorator only expresses "every
 * listed code required," not "either of these two."
 */
@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/service-sessions')
export class ServiceSessionsController {
  constructor(
    private readonly sessionsService: ServiceSessionsService,
    private readonly queriesService: ServiceSessionQueriesService,
  ) {}

  @RequirePermissions('service_sessions.read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: ListServiceSessionsQueryDto) {
    return this.queriesService.list(tenant, {
      branchId: query.branchId,
      status: query.status,
      assignedStaffProfileId: query.assignedStaffProfileId,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @RequirePermissions('service_sessions.read')
  @Get(':serviceSessionId')
  async get(@CurrentTenant() tenant: TenantContext, @Param('serviceSessionId') serviceSessionId: string) {
    return this.queriesService.get(tenant, serviceSessionId);
  }

  @Put(':serviceSessionId/items')
  async replaceItems(
    @CurrentTenant() tenant: TenantContext,
    @Param('serviceSessionId') serviceSessionId: string,
    @Body() dto: ReplaceServiceSessionItemsDto,
    @Req() request: RequestWithId,
  ) {
    return this.sessionsService.replaceItems(tenant, serviceSessionId, dto, request.requestId);
  }

  @Post(':serviceSessionId/complete')
  async complete(
    @CurrentTenant() tenant: TenantContext,
    @Param('serviceSessionId') serviceSessionId: string,
    @Req() request: RequestWithId,
  ) {
    return this.sessionsService.complete(tenant, serviceSessionId, request.requestId);
  }

  @Post(':serviceSessionId/cancel')
  async cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param('serviceSessionId') serviceSessionId: string,
    @Body() dto: CancelServiceSessionDto,
    @Req() request: RequestWithId,
  ) {
    return this.sessionsService.cancel(tenant, serviceSessionId, dto, request.requestId);
  }
}
