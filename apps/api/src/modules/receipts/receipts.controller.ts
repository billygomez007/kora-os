import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { ListReceiptsQueryDto } from './dto/list-receipts-query.dto.js';
import { ReceiptsQueryService } from './receipts-query.service.js';

@UseGuards(TenantAccessGuard)
@RequirePermissions('receipts.read')
@Controller('organizations/:organizationId/receipts')
export class ReceiptsController {
  constructor(private readonly receiptsQueryService: ReceiptsQueryService) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: ListReceiptsQueryDto) {
    return this.receiptsQueryService.listForOrganization(tenant, {
      branchId: query.branchId,
      customerRecordId: query.customerRecordId,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Get(':receiptId')
  async get(@CurrentTenant() tenant: TenantContext, @Param('receiptId') receiptId: string) {
    return this.receiptsQueryService.get(tenant, receiptId);
  }
}
