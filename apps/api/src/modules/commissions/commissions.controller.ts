import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { CommissionAccrualsQueryService } from './commission-accruals-query.service.js';
import { ListCommissionAccrualsQueryDto } from './dto/list-commission-accruals-query.dto.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/commissions')
export class CommissionsController {
  constructor(private readonly accrualsQueryService: CommissionAccrualsQueryService) {}

  @RequirePermissions('commissions.read_all')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: ListCommissionAccrualsQueryDto) {
    return this.accrualsQueryService.listForOrganization(tenant, {
      branchId: query.branchId,
      staffProfileId: query.staffProfileId,
      source: query.source,
      from: query.from,
      to: query.to,
      cursor: query.cursor,
      limit: query.limit,
    });
  }
}
