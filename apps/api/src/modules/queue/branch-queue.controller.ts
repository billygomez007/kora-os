import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
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
import { CreateWalkInDto } from './dto/create-walk-in.dto.js';
import { ListQueueQueryDto } from './dto/list-queue-query.dto.js';
import { QueueIntakeService } from './queue-intake.service.js';
import { QueueQueriesService } from './queue-queries.service.js';

@UseGuards(TenantAccessGuard)
@RequireBranchParam('branchId')
@Controller('organizations/:organizationId/branches/:branchId/queue')
export class BranchQueueController {
  constructor(
    private readonly intakeService: QueueIntakeService,
    private readonly queriesService: QueueQueriesService,
  ) {}

  @RequirePermissions('queue.read')
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Query() query: ListQueueQueryDto,
  ) {
    return this.queriesService.listForBranch(tenant, branchId, {
      businessDate: query.businessDate,
      status: query.status,
      assignedStaffProfileId: query.assignedStaffProfileId,
    });
  }

  @RequirePermissions('queue.manage')
  @Post('walk-ins')
  async createWalkIn(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Body() dto: CreateWalkInDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.intakeService.createWalkIn(
      {
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        actorMembershipId: tenant.membershipId,
        requestId: request.requestId,
      },
      branchId,
      dto,
      idempotencyKey,
    );
  }
}
