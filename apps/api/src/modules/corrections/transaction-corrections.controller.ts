import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { ApproveCorrectionDto } from './dto/approve-correction.dto.js';
import { CancelCorrectionDto } from './dto/cancel-correction.dto.js';
import { ExecuteCorrectionDto } from './dto/execute-correction.dto.js';
import { ListCorrectionsQueryDto } from './dto/list-corrections-query.dto.js';
import { RejectCorrectionDto } from './dto/reject-correction.dto.js';
import { RequestRefundDto } from './dto/request-refund.dto.js';
import { RequestReversalDto } from './dto/request-reversal.dto.js';
import { TransactionCorrectionExecutionService } from './transaction-correction-execution.service.js';
import { TransactionCorrectionsService } from './transaction-corrections.service.js';

function actorFrom(tenant: TenantContext, request: RequestWithId) {
  return { organizationId: tenant.organizationId, userId: tenant.userId, membershipId: tenant.membershipId, requestId: request.requestId };
}

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/transaction-corrections')
export class TransactionCorrectionsController {
  constructor(
    private readonly correctionsService: TransactionCorrectionsService,
    private readonly executionService: TransactionCorrectionExecutionService,
  ) {}

  @RequirePermissions('refunds.read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: ListCorrectionsQueryDto) {
    return this.correctionsService.list(tenant, {
      branchId: query.branchId,
      originalTransactionId: query.originalTransactionId,
      correctionType: query.correctionType,
      status: query.status,
      requestedByMembershipId: query.requestedByMembershipId,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @RequirePermissions('refunds.read')
  @Get(':correctionId')
  async get(@CurrentTenant() tenant: TenantContext, @Param('correctionId') correctionId: string) {
    return this.correctionsService.get(tenant, correctionId);
  }

  @RequirePermissions('refunds.approve')
  @Post(':correctionId/approve')
  async approve(
    @CurrentTenant() tenant: TenantContext,
    @Param('correctionId') correctionId: string,
    @Body() dto: ApproveCorrectionDto,
    @Req() request: RequestWithId,
  ) {
    return this.correctionsService.approve(tenant, correctionId, dto, actorFrom(tenant, request));
  }

  @RequirePermissions('refunds.approve')
  @Post(':correctionId/reject')
  async reject(
    @CurrentTenant() tenant: TenantContext,
    @Param('correctionId') correctionId: string,
    @Body() dto: RejectCorrectionDto,
    @Req() request: RequestWithId,
  ) {
    return this.correctionsService.reject(tenant, correctionId, dto, actorFrom(tenant, request));
  }

  @RequirePermissions('refunds.request')
  @Post(':correctionId/cancel')
  async cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param('correctionId') correctionId: string,
    @Body() dto: CancelCorrectionDto,
    @Req() request: RequestWithId,
  ) {
    return this.correctionsService.cancel(tenant, correctionId, dto, actorFrom(tenant, request));
  }

  @RequirePermissions('refunds.execute')
  @Post(':correctionId/execute')
  async execute(
    @CurrentTenant() tenant: TenantContext,
    @Param('correctionId') correctionId: string,
    @Body() dto: ExecuteCorrectionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.executionService.execute(tenant, correctionId, dto, idempotencyKey, actorFrom(tenant, request));
  }
}

/** Separate controller only for its distinct route prefix
 * (`/transactions/:transactionId/{refund,reversal}-requests`) — same
 * guard, same underlying service. */
@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/transactions/:transactionId')
export class TransactionCorrectionRequestsController {
  constructor(private readonly correctionsService: TransactionCorrectionsService) {}

  @RequirePermissions('refunds.request')
  @Post('refund-requests')
  async requestRefund(
    @CurrentTenant() tenant: TenantContext,
    @Param('transactionId') transactionId: string,
    @Body() dto: RequestRefundDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.correctionsService.requestRefund(tenant, transactionId, dto, idempotencyKey, actorFrom(tenant, request));
  }

  @RequirePermissions('transactions.reverse')
  @Post('reversal-requests')
  async requestReversal(
    @CurrentTenant() tenant: TenantContext,
    @Param('transactionId') transactionId: string,
    @Body() dto: RequestReversalDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.correctionsService.requestReversal(tenant, transactionId, dto, idempotencyKey, actorFrom(tenant, request));
  }
}
