import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CashSessionsService } from './cash-sessions.service.js';
import { CloseCashSessionDto } from './dto/close-cash-session.dto.js';
import { ListCashSessionsQueryDto } from './dto/list-cash-sessions-query.dto.js';
import { OpenCashSessionDto } from './dto/open-cash-session.dto.js';
import { RecordCashMovementDto } from './dto/record-cash-movement.dto.js';
import { ReviewCashSessionDto } from './dto/review-cash-session.dto.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/cash-sessions')
export class CashSessionsController {
  constructor(private readonly sessionsService: CashSessionsService) {}

  @RequirePermissions('cash_sessions.read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: ListCashSessionsQueryDto) {
    return this.sessionsService.list(tenant, {
      branchId: query.branchId,
      registerId: query.registerId,
      openedByMembershipId: query.openedByMembershipId,
      currency: query.currency,
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @RequirePermissions('cash_sessions.read')
  @Get(':cashSessionId')
  async get(@CurrentTenant() tenant: TenantContext, @Param('cashSessionId') cashSessionId: string) {
    return this.sessionsService.get(tenant, cashSessionId);
  }

  @RequirePermissions('cash_sessions.open')
  @Post('open')
  async open(@CurrentTenant() tenant: TenantContext, @Body() dto: OpenCashSessionDto, @Req() request: RequestWithId) {
    return this.sessionsService.open(tenant, dto, {
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      membershipId: tenant.membershipId,
      requestId: request.requestId,
    });
  }

  @RequirePermissions('cash_sessions.operate')
  @Post(':cashSessionId/movements')
  async recordMovement(
    @CurrentTenant() tenant: TenantContext,
    @Param('cashSessionId') cashSessionId: string,
    @Body() dto: RecordCashMovementDto,
    @Req() request: RequestWithId,
  ) {
    return this.sessionsService.recordMovement(tenant, cashSessionId, dto, {
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      membershipId: tenant.membershipId,
      requestId: request.requestId,
    });
  }

  @RequirePermissions('cash_sessions.close')
  @Post(':cashSessionId/close')
  async close(
    @CurrentTenant() tenant: TenantContext,
    @Param('cashSessionId') cashSessionId: string,
    @Body() dto: CloseCashSessionDto,
    @Req() request: RequestWithId,
  ) {
    return this.sessionsService.close(tenant, cashSessionId, dto, {
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      membershipId: tenant.membershipId,
      requestId: request.requestId,
    });
  }

  @RequirePermissions('cash_sessions.reconcile')
  @Post(':cashSessionId/review')
  async review(
    @CurrentTenant() tenant: TenantContext,
    @Param('cashSessionId') cashSessionId: string,
    @Body() dto: ReviewCashSessionDto,
    @Req() request: RequestWithId,
  ) {
    return this.sessionsService.review(tenant, cashSessionId, dto, {
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      membershipId: tenant.membershipId,
      requestId: request.requestId,
    });
  }
}
