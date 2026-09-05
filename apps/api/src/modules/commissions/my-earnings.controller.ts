import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { CommissionAccrualsQueryService } from './commission-accruals-query.service.js';
import { ListMyEarningsQueryDto } from './dto/list-my-earnings-query.dto.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/me')
export class MyEarningsController {
  constructor(private readonly accrualsQueryService: CommissionAccrualsQueryService) {}

  @RequirePermissions('commissions.read_own')
  @Get('earnings')
  async earnings(@CurrentTenant() tenant: TenantContext, @Query() query: ListMyEarningsQueryDto) {
    return this.accrualsQueryService.listOwnEarnings(tenant, {
      from: query.from,
      to: query.to,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @RequirePermissions('commissions.read_own')
  @Get('earnings/summary')
  async earningsSummary(@CurrentTenant() tenant: TenantContext, @Query() query: ListMyEarningsQueryDto) {
    return this.accrualsQueryService.summaryOwnEarnings(tenant, { from: query.from, to: query.to });
  }
}
