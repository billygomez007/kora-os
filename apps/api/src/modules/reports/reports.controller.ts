import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { ReportsService } from './reports.service.js';

@UseGuards(TenantAccessGuard)
@RequirePermissions('reports.read')
@Controller('organizations/:organizationId/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  async overview(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reportsService.overview(tenant, query);
  }

  @Get('revenue')
  async revenue(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reportsService.revenue(tenant, query);
  }

  @Get('staff-performance')
  async staffPerformance(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reportsService.staffPerformance(tenant, query);
  }

  @Get('services')
  async services(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reportsService.services(tenant, query);
  }

  @Get('payment-methods')
  async paymentMethods(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reportsService.paymentMethods(tenant, query);
  }

  @Get('commissions')
  async commissions(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reportsService.commissions(tenant, query);
  }

  @Get('cash-reconciliation')
  async cashReconciliation(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reportsService.cashReconciliation(tenant, query);
  }
}
