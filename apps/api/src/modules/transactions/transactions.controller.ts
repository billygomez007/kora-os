import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';
import { TransactionsService } from './transactions.service.js';

/** Read-only surface — see TransactionsService's own header comment for
 * why no create/update/delete route exists here. */
@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @RequirePermissions('transactions.read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: ListTransactionsQueryDto) {
    return this.transactionsService.list(tenant, {
      branchId: query.branchId,
      assignedStaffProfileId: query.assignedStaffProfileId,
      customerRecordId: query.customerRecordId,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @RequirePermissions('transactions.read')
  @Get(':transactionId')
  async get(@CurrentTenant() tenant: TenantContext, @Param('transactionId') transactionId: string) {
    return this.transactionsService.get(tenant, transactionId);
  }
}
