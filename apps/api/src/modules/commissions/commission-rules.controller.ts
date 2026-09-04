import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CommissionRulesService } from './commission-rules.service.js';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto.js';
import { DeactivateCommissionRuleDto } from './dto/deactivate-commission-rule.dto.js';
import { ListCommissionRulesQueryDto } from './dto/list-commission-rules-query.dto.js';
import { SupersedeCommissionRuleDto } from './dto/supersede-commission-rule.dto.js';

/** Reading and managing commission *policy* (as opposed to what an
 * individual accrued) is gated by `commissions.manage` throughout —
 * owner/manager only. */
@UseGuards(TenantAccessGuard)
@RequirePermissions('commissions.manage')
@Controller('organizations/:organizationId/commission-rules')
export class CommissionRulesController {
  constructor(private readonly rulesService: CommissionRulesService) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: ListCommissionRulesQueryDto) {
    return this.rulesService.list(tenant, {
      branchId: query.branchId,
      staffProfileId: query.staffProfileId,
      serviceId: query.serviceId,
      currentOnly: query.currentOnly,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Get(':ruleId')
  async get(@CurrentTenant() tenant: TenantContext, @Param('ruleId') ruleId: string) {
    return this.rulesService.get(tenant, ruleId);
  }

  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateCommissionRuleDto,
    @Req() request: RequestWithId,
  ) {
    return this.rulesService.create(tenant, dto, request.requestId);
  }

  @Post(':ruleId/supersede')
  async supersede(
    @CurrentTenant() tenant: TenantContext,
    @Param('ruleId') ruleId: string,
    @Body() dto: SupersedeCommissionRuleDto,
    @Req() request: RequestWithId,
  ) {
    return this.rulesService.supersede(tenant, ruleId, dto, request.requestId);
  }

  @Post(':ruleId/deactivate')
  async deactivate(
    @CurrentTenant() tenant: TenantContext,
    @Param('ruleId') ruleId: string,
    @Body() dto: DeactivateCommissionRuleDto,
    @Req() request: RequestWithId,
  ) {
    return this.rulesService.deactivate(tenant, ruleId, dto, request.requestId);
  }
}
