import { Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PaymentRecordStatus } from '../../generated/prisma/client.js';
import {
  aggregateCommissionsBySource,
  aggregatePaymentMethods,
  aggregateServicePerformance,
  aggregateStaffPerformance,
  paginateInMemory,
  summarizeByCurrency,
  sumByCurrency,
  type CommissionReportEntry,
  type PaymentMethodEntry,
  type ServicePerformanceEntry,
  type StaffPerformanceEntry,
} from './report-aggregation.util.js';
import { parseReportDateRange, resolveReportTimeZone } from './report-date-range.util.js';
import { bucketRevenueByLocalDate, type DailyRevenueBucket } from './report-grouping.util.js';

const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';
const DEFAULT_PAGE_SIZE = 20;

interface ReportQuery {
  from: string;
  to: string;
  branchId?: string;
  timezone?: string;
}

interface ReportScope {
  branchFilter: { branchId?: string } | { branchId?: { in: string[] } };
  timeZone: string;
}

/**
 * Owner/manager reporting, derived exclusively from already-immutable
 * records — POSTED Transactions and their TransactionLineItem/
 * CommissionAccrual/ReceiptPaymentSummary snapshots (docs task Phase 4).
 * A RECORDED/DISPUTED PaymentRecord never contributes to any revenue
 * figure here; the two places a payment *claim* appears at all
 * (`pendingPaymentClaimCount`/`disputedPaymentClaimCount` on the
 * overview) are explicitly separate operational counters, never labeled
 * revenue and never summed into a money total.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenant: TenantContext, query: ReportQuery) {
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(tenant, query.branchId, query.timezone);

    const transactions = await this.prisma.transaction.findMany({
      where: { organizationId: tenant.organizationId, ...scope.branchFilter, postedAt: { gte: range.from, lte: range.to } },
      select: { totalMinor: true, currency: true },
    });
    const revenueSummary = summarizeByCurrency(transactions.map((t) => ({ currency: t.currency, amountMinor: t.totalMinor })));

    const completedServiceCount = await this.prisma.transactionLineItem.count({
      where: {
        organizationId: tenant.organizationId,
        transaction: { postedAt: { gte: range.from, lte: range.to }, ...scope.branchFilter },
      },
    });

    const accruals = await this.prisma.commissionAccrual.findMany({
      where: {
        organizationId: tenant.organizationId,
        transaction: { postedAt: { gte: range.from, lte: range.to }, ...scope.branchFilter },
      },
      select: { calculatedAmountMinor: true, currency: true },
    });
    const commissionAccrued = sumByCurrency(accruals.map((a) => ({ currency: a.currency, amountMinor: a.calculatedAmountMinor })));

    const pendingPaymentClaimCount = await this.prisma.paymentRecord.count({
      where: {
        organizationId: tenant.organizationId,
        ...scope.branchFilter,
        status: PaymentRecordStatus.RECORDED,
        recordedAt: { gte: range.from, lte: range.to },
      },
    });
    const disputedPaymentClaimCount = await this.prisma.paymentRecord.count({
      where: {
        organizationId: tenant.organizationId,
        ...scope.branchFilter,
        status: PaymentRecordStatus.DISPUTED,
        disputedAt: { gte: range.from, lte: range.to },
      },
    });

    return {
      from: query.from,
      to: query.to,
      branchId: query.branchId ?? null,
      postedRevenue: revenueSummary.totals,
      transactionCount: transactions.length,
      averageTransactionValue: revenueSummary.averages,
      completedServiceCount,
      commissionAccrued,
      pendingPaymentClaimCount,
      disputedPaymentClaimCount,
    };
  }

  async revenue(tenant: TenantContext, query: ReportQuery): Promise<{ from: string; to: string; branchId: string | null; timeZone: string; buckets: DailyRevenueBucket[] }> {
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(tenant, query.branchId, query.timezone, true);

    const transactions = await this.prisma.transaction.findMany({
      where: { organizationId: tenant.organizationId, ...scope.branchFilter, postedAt: { gte: range.from, lte: range.to } },
      select: { postedAt: true, totalMinor: true, currency: true },
    });
    const buckets = bucketRevenueByLocalDate(
      transactions.map((t) => ({ occurredAt: t.postedAt, amountMinor: t.totalMinor, currency: t.currency })),
      scope.timeZone,
    );

    return { from: query.from, to: query.to, branchId: query.branchId ?? null, timeZone: scope.timeZone, buckets };
  }

  async staffPerformance(tenant: TenantContext, query: ReportQuery & { cursor?: string; limit?: number }) {
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(tenant, query.branchId, query.timezone);

    const [lineItems, accruals] = await Promise.all([
      this.prisma.transactionLineItem.findMany({
        where: { organizationId: tenant.organizationId, transaction: { postedAt: { gte: range.from, lte: range.to }, ...scope.branchFilter } },
        select: { staffProfileId: true, priceMinorSnapshot: true, currencySnapshot: true },
      }),
      this.prisma.commissionAccrual.findMany({
        where: { organizationId: tenant.organizationId, transaction: { postedAt: { gte: range.from, lte: range.to }, ...scope.branchFilter } },
        select: { staffProfileId: true, calculatedAmountMinor: true, currency: true },
      }),
    ]);

    const entries = aggregateStaffPerformance(lineItems, accruals);
    const page = paginateInMemory<StaffPerformanceEntry>(entries, query.cursor, query.limit ?? DEFAULT_PAGE_SIZE, (e) => e.staffProfileId);

    return { from: query.from, to: query.to, branchId: query.branchId ?? null, data: page.data, page: { hasMore: page.hasMore, nextCursor: page.nextCursor } };
  }

  async services(tenant: TenantContext, query: ReportQuery & { cursor?: string; limit?: number }) {
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(tenant, query.branchId, query.timezone);

    const lineItems = await this.prisma.transactionLineItem.findMany({
      where: { organizationId: tenant.organizationId, transaction: { postedAt: { gte: range.from, lte: range.to }, ...scope.branchFilter } },
      select: { serviceId: true, serviceNameSnapshot: true, priceMinorSnapshot: true, currencySnapshot: true },
    });

    const entries = aggregateServicePerformance(lineItems);
    const page = paginateInMemory<ServicePerformanceEntry>(entries, query.cursor, query.limit ?? DEFAULT_PAGE_SIZE, (e) => e.serviceId);

    return { from: query.from, to: query.to, branchId: query.branchId ?? null, data: page.data, page: { hasMore: page.hasMore, nextCursor: page.nextCursor } };
  }

  async paymentMethods(tenant: TenantContext, query: ReportQuery & { cursor?: string; limit?: number }) {
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(tenant, query.branchId, query.timezone);

    const summaries = await this.prisma.receiptPaymentSummary.findMany({
      where: { organizationId: tenant.organizationId, receipt: { issuedAt: { gte: range.from, lte: range.to }, ...scope.branchFilter } },
      select: { method: true, amountMinorSnapshot: true, currencySnapshot: true },
    });

    const entries = aggregatePaymentMethods(summaries);
    const page = paginateInMemory<PaymentMethodEntry>(entries, query.cursor, query.limit ?? DEFAULT_PAGE_SIZE, (e) => e.method);

    return { from: query.from, to: query.to, branchId: query.branchId ?? null, data: page.data, page: { hasMore: page.hasMore, nextCursor: page.nextCursor } };
  }

  async commissions(tenant: TenantContext, query: ReportQuery & { cursor?: string; limit?: number }) {
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(tenant, query.branchId, query.timezone);

    const accruals = await this.prisma.commissionAccrual.findMany({
      where: { organizationId: tenant.organizationId, transaction: { postedAt: { gte: range.from, lte: range.to }, ...scope.branchFilter } },
      select: { staffProfileId: true, source: true, calculatedAmountMinor: true, currency: true },
    });

    const entries = aggregateCommissionsBySource(accruals);
    const page = paginateInMemory<CommissionReportEntry>(entries, query.cursor, query.limit ?? DEFAULT_PAGE_SIZE, (e) => e.staffProfileId);

    return { from: query.from, to: query.to, branchId: query.branchId ?? null, data: page.data, page: { hasMore: page.hasMore, nextCursor: page.nextCursor } };
  }

  /**
   * `requireTimeZone` defaults to `false`: only `revenue` performs any
   * timezone-sensitive local-date grouping, so only it needs to pass
   * `true` and enforce the "explicit timezone required for an
   * organization-wide report" rule. The other five report endpoints
   * (overview, staff-performance, services, payment-methods,
   * commissions) aggregate over the whole requested range and never
   * bucket by local day, so requiring a timezone from their callers
   * would be an unused, incorrect restriction.
   */
  private async resolveScope(
    tenant: TenantContext,
    branchId: string | undefined,
    explicitTimeZone: string | undefined,
    requireTimeZone = false,
  ): Promise<ReportScope> {
    if (branchId) {
      assertMembershipHasBranchAccess(tenant, branchId);
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, organizationId: tenant.organizationId } });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
      return { branchFilter: { branchId }, timeZone: branch.timeZone };
    }
    const hasBroadBranchAccess = tenant.permissionCodes.has(BROAD_BRANCH_ACCESS_PERMISSION);
    const branchFilter = hasBroadBranchAccess ? {} : { branchId: { in: tenant.branchIds } };
    if (!requireTimeZone) {
      return { branchFilter, timeZone: explicitTimeZone ?? '' };
    }
    return { branchFilter, timeZone: resolveReportTimeZone(undefined, explicitTimeZone) };
  }
}
