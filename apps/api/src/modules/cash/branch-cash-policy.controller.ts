import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { BranchCashPolicyService } from './branch-cash-policy.service.js';
import { UpdateCashPolicyDto } from './dto/update-cash-policy.dto.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/branches/:branchId/cash-policy')
export class BranchCashPolicyController {
  constructor(private readonly policyService: BranchCashPolicyService) {}

  @RequirePermissions('cash_registers.read')
  @Get()
  async get(@CurrentTenant() tenant: TenantContext, @Param('branchId') branchId: string) {
    return this.policyService.get(tenant, branchId);
  }

  @RequirePermissions('cash_registers.manage')
  @Put()
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateCashPolicyDto,
    @Req() request: RequestWithId,
  ) {
    return this.policyService.update(tenant, branchId, dto, request.requestId);
  }
}
