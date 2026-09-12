import { Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { PrismaService } from '../../database/prisma.service.js';
import { EntitlementsService } from '../subscriptions/entitlements.service.js';
import {
  CashLedgerEntryType,
  PaymentRecordStatus,
} from '../../generated/prisma/client.js';
import {
  aggregateCommissionsBySource,
  aggregatePaymentMethods,
  aggregateServicePerformance,
  aggregateStaffPerformance,
  paginateInMemory,
  redactCommissionRefundAnalytics,
  redactPaymentMethodRefundAnalytics,
  redactServiceRefundAnalytics,
  redactStaffRefundAnalytics,
  summarizeByCurrency,
  summarizeTransactionKinds,
  sumByCurrency,
  type CommissionReportEntry,
  type PaymentMethodEntry,
  type ServicePerformanceEntry,
  type StaffPerformanceEntry,
} from './report-aggregation.util.js';
import {
  parseReportDateRange,
  resolveReportTimeZone,
} from './report-date-range.util.js';
import {
  bucketRevenueByLocalDate,
  type DailyRevenueBucket,
} from './report-grouping.util.js';

const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';
const REFUND_REPORTING_ENTITLEMENT = 'reporting.refunds';
const MULTI_BRANCH_REPORTING_ENTITLEMENT = 'reporting.multi_branch';
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
 * CommissionAccrual/ReceiptPaymentSummary snapshots (docs task Phase 4,
 * extended for gross/net correction reporting in Phase 6). A RECORDED/
 * DISPUTED PaymentRecord never contributes to any revenue figure here;
 * the two places a payment *claim* appears at all
 * (`pendingPaymentClaimCount`/`disputedPaymentClaimCount` on the
 * overview) are explicitly separate operational counters, never labeled
 * revenue and never summed into a money total. Likewise, a
 * CashLedgerEntry (Phase 1) and a CashSession's variance (a physical-
 * custody fact) never change any revenue figure — they surface only on
 * the dedicated `cashReconciliation` report.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async overview(tenant: TenantContext, query: ReportQuery) {
    const refundReportingAvailable = await this.hasRefundReporting(
      tenant.organizationId,
    );
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(
      tenant,
      query.branchId,
      query.timezone,
    );

    const transactions = await this.prisma.transaction.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...scope.branchFilter,
        postedAt: { gte: range.from, lte: range.to },
      },
      select: { kind: true, totalMinor: true, currency: true },
    });
    const kindTotals = summarizeTransactionKinds(transactions);
    // postedRevenue/transactionCount/averageTransactionValue preserved
    // exactly as before Phase 6 — always SALE-only, backward compatible.
    const saleTransactions = transactions.filter((t) => t.kind === 'SALE');
    const revenueSummary = summarizeByCurrency(
      saleTransactions.map((t) => ({
        currency: t.currency,
        amountMinor: t.totalMinor,
      })),
    );

    const completedServiceCount = await this.prisma.transactionLineItem.count({
      where: {
        organizationId: tenant.organizationId,
        transaction: {
          postedAt: { gte: range.from, lte: range.to },
          kind: 'SALE',
          ...scope.branchFilter,
        },
      },
    });

    const accruals = await this.prisma.commissionAccrual.findMany({
      where: {
        organizationId: tenant.organizationId,
        kind: 'EARNED',
        transaction: {
          postedAt: { gte: range.from, lte: range.to },
          ...scope.branchFilter,
        },
      },
      select: { calculatedAmountMinor: true, currency: true },
    });
    const commissionAccrued = sumByCurrency(
      accruals.map((a) => ({
        currency: a.currency,
        amountMinor: a.calculatedAmountMinor,
      })),
    );

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
      transactionCount: saleTransactions.length,
      averageTransactionValue: revenueSummary.averages,
      completedServiceCount,
      commissionAccrued,
      pendingPaymentClaimCount,
      disputedPaymentClaimCount,
      grossPostedSales: kindTotals.grossPostedSales,
      refundReportingAvailable,
      refundAmount: refundReportingAvailable ? kindTotals.refundAmount : [],
      reversalAmount: refundReportingAvailable ? kindTotals.reversalAmount : [],
      netPostedRevenue: refundReportingAvailable
        ? kindTotals.netPostedRevenue
        : [],
      refundTransactionCount: refundReportingAvailable
        ? kindTotals.refundTransactionCount
        : 0,
      reversalTransactionCount: refundReportingAvailable
        ? kindTotals.reversalTransactionCount
        : 0,
    };
  }

  async revenue(
    tenant: TenantContext,
    query: ReportQuery,
  ): Promise<{
    from: string;
    to: string;
    branchId: string | null;
    timeZone: string;
    buckets: DailyRevenueBucket[];
  }> {
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(
      tenant,
      query.branchId,
      query.timezone,
      true,
    );

    const transactions = await this.prisma.transaction.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...scope.branchFilter,
        kind: 'SALE',
        postedAt: { gte: range.from, lte: range.to },
      },
      select: { postedAt: true, totalMinor: true, currency: true },
    });
    const buckets = bucketRevenueByLocalDate(
      transactions.map((t) => ({
        occurredAt: t.postedAt,
        amountMinor: t.totalMinor,
        currency: t.currency,
      })),
      scope.timeZone,
    );

    return {
      from: query.from,
      to: query.to,
      branchId: query.branchId ?? null,
      timeZone: scope.timeZone,
      buckets,
    };
  }

  /**
   * Advanced reporting is a deliberate, higher-tier composite view over
   * already-posted records. It does not change the meaning of any existing
   * report field or read live payment claims. A branch-scoped request stays
   * branch-scoped; an organization-wide request also requires the
   * multi-branch entitlement when the caller can actually see more than one
   * branch.
   */
  async advanced(tenant: TenantContext, query: ReportQuery) {
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(
      tenant,
      query.branchId,
      query.timezone,
    );
    if (!query.branchId) {
      await this.requireMultiBranchEntitlementWhenNeeded(tenant);
    }

    const [transactions, lineItems, accruals, paymentSummaries] =
      await Promise.all([
        this.prisma.transaction.findMany({
          where: {
            organizationId: tenant.organizationId,
            ...scope.branchFilter,
            postedAt: { gte: range.from, lte: range.to },
          },
          select: { kind: true, totalMinor: true, currency: true },
        }),
        this.prisma.transactionLineItem.findMany({
          where: {
            organizationId: tenant.organizationId,
            kind: 'SERVICE',
            serviceId: { not: null },
            serviceNameSnapshot: { not: null },
            transaction: {
              postedAt: { gte: range.from, lte: range.to },
              ...scope.branchFilter,
            },
          },
          select: {
            staffProfileId: true,
            serviceId: true,
            serviceNameSnapshot: true,
            priceMinorSnapshot: true,
            currencySnapshot: true,
            transaction: { select: { kind: true } },
          },
        }),
        this.prisma.commissionAccrual.findMany({
          where: {
            organizationId: tenant.organizationId,
            transaction: {
              postedAt: { gte: range.from, lte: range.to },
              ...scope.branchFilter,
            },
          },
          select: {
            staffProfileId: true,
            calculatedAmountMinor: true,
            currency: true,
            kind: true,
          },
        }),
        this.prisma.receiptPaymentSummary.findMany({
          where: {
            organizationId: tenant.organizationId,
            receipt: {
              issuedAt: { gte: range.from, lte: range.to },
              ...scope.branchFilter,
            },
          },
          select: {
            method: true,
            amountMinorSnapshot: true,
            currencySnapshot: true,
            receipt: { select: { kind: true } },
          },
        }),
      ]);

    const kindTotals = summarizeTransactionKinds(transactions);
    const saleTransactions = transactions.filter((transaction) => transaction.kind === 'SALE');
    const summary = summarizeByCurrency(
      saleTransactions.map((transaction) => ({
        currency: transaction.currency,
        amountMinor: transaction.totalMinor,
      })),
    );
    const serviceEntries = aggregateServicePerformance(
      lineItems.map((item) => ({
        serviceId: item.serviceId!,
        serviceNameSnapshot: item.serviceNameSnapshot!,
        priceMinorSnapshot: item.priceMinorSnapshot,
        currencySnapshot: item.currencySnapshot,
        transactionKind: item.transaction.kind,
      })),
    );
    const staffEntries = aggregateStaffPerformance(
      lineItems
        .filter((item) => item.staffProfileId !== null)
        .map((item) => ({
          staffProfileId: item.staffProfileId!,
          priceMinorSnapshot: item.priceMinorSnapshot,
          currencySnapshot: item.currencySnapshot,
          transactionKind: item.transaction.kind,
        })),
      accruals,
    );
    const paymentEntries = aggregatePaymentMethods(
      paymentSummaries.map((summaryEntry) => ({
        method: summaryEntry.method,
        amountMinorSnapshot: summaryEntry.amountMinorSnapshot,
        currencySnapshot: summaryEntry.currencySnapshot,
        receiptKind: summaryEntry.receipt.kind,
      })),
    );

    return {
      from: query.from,
      to: query.to,
      branchId: query.branchId ?? null,
      grossPostedSales: kindTotals.grossPostedSales,
      refundAmount: kindTotals.refundAmount,
      reversalAmount: kindTotals.reversalAmount,
      netPostedRevenue: kindTotals.netPostedRevenue,
      transactionCount: saleTransactions.length,
      averageTransactionValue: summary.averages,
      serviceMix: serviceEntries,
      staffMix: staffEntries,
      paymentMix: paymentEntries,
    };
  }

  /**
   * Cross-branch comparison is intentionally a separate route. The branch
   * list is derived from the caller's current membership scope (or the
   * broad branches.manage permission), never from client-supplied IDs.
   */
  async multiBranch(tenant: TenantContext, query: ReportQuery) {
    const range = parseReportDateRange(query.from, query.to);
    const branchIds = await this.resolveAuthorizedBranchIds(tenant);
    if (branchIds.length === 0) {
      return {
        from: query.from,
        to: query.to,
        data: [],
      };
    }

    const [branches, transactions] = await Promise.all([
      this.prisma.branch.findMany({
        where: {
          organizationId: tenant.organizationId,
          id: { in: branchIds },
        },
        select: { id: true, name: true, code: true, currency: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.transaction.findMany({
        where: {
          organizationId: tenant.organizationId,
          branchId: { in: branchIds },
          postedAt: { gte: range.from, lte: range.to },
        },
        select: {
          branchId: true,
          kind: true,
          totalMinor: true,
          currency: true,
        },
      }),
    ]);

    const transactionsByBranch = new Map<string, typeof transactions>();
    for (const transaction of transactions) {
      const branchTransactions = transactionsByBranch.get(transaction.branchId) ?? [];
      branchTransactions.push(transaction);
      transactionsByBranch.set(transaction.branchId, branchTransactions);
    }

    return {
      from: query.from,
      to: query.to,
      data: branches.map((branch) => {
        const totals = summarizeTransactionKinds(
          transactionsByBranch.get(branch.id) ?? [],
        );
        return {
          branchId: branch.id,
          branchName: branch.name,
          branchCode: branch.code,
          currency: branch.currency,
          transactionCount: totals.saleCount,
          grossPostedSales: totals.grossPostedSales,
          refundAmount: totals.refundAmount,
          reversalAmount: totals.reversalAmount,
          netPostedRevenue: totals.netPostedRevenue,
        };
      }),
    };
  }

  async staffPerformance(
    tenant: TenantContext,
    query: ReportQuery & { cursor?: string; limit?: number },
  ) {
    const refundReportingAvailable = await this.hasRefundReporting(
      tenant.organizationId,
    );
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(
      tenant,
      query.branchId,
      query.timezone,
    );

    const [lineItems, accruals] = await Promise.all([
      this.prisma.transactionLineItem.findMany({
        where: {
          organizationId: tenant.organizationId,
          kind: 'SERVICE',
          staffProfileId: { not: null },
          transaction: {
            postedAt: { gte: range.from, lte: range.to },
            ...scope.branchFilter,
          },
        },
        select: {
          staffProfileId: true,
          priceMinorSnapshot: true,
          currencySnapshot: true,
          transaction: { select: { kind: true } },
        },
      }),
      this.prisma.commissionAccrual.findMany({
        where: {
          organizationId: tenant.organizationId,
          transaction: {
            postedAt: { gte: range.from, lte: range.to },
            ...scope.branchFilter,
          },
        },
        select: {
          staffProfileId: true,
          calculatedAmountMinor: true,
          currency: true,
          kind: true,
        },
      }),
    ]);

    const entries = aggregateStaffPerformance(
      lineItems.map((item) => ({
        ...item,
        staffProfileId: item.staffProfileId!,
        transactionKind: item.transaction.kind,
      })),
      accruals,
    );
    const visibleEntries = refundReportingAvailable
      ? entries
      : redactStaffRefundAnalytics(entries);
    const page = paginateInMemory<StaffPerformanceEntry>(
      visibleEntries,
      query.cursor,
      query.limit ?? DEFAULT_PAGE_SIZE,
      (e) => e.staffProfileId,
    );

    return {
      from: query.from,
      to: query.to,
      branchId: query.branchId ?? null,
      data: page.data,
      page: { hasMore: page.hasMore, nextCursor: page.nextCursor },
    };
  }

  async services(
    tenant: TenantContext,
    query: ReportQuery & { cursor?: string; limit?: number },
  ) {
    const refundReportingAvailable = await this.hasRefundReporting(
      tenant.organizationId,
    );
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(
      tenant,
      query.branchId,
      query.timezone,
    );

    const lineItems = await this.prisma.transactionLineItem.findMany({
      where: {
        organizationId: tenant.organizationId,
        kind: 'SERVICE',
        serviceId: { not: null },
        serviceNameSnapshot: { not: null },
        transaction: {
          postedAt: { gte: range.from, lte: range.to },
          ...scope.branchFilter,
        },
      },
      select: {
        serviceId: true,
        serviceNameSnapshot: true,
        priceMinorSnapshot: true,
        currencySnapshot: true,
        transaction: { select: { kind: true } },
      },
    });

    const entries = aggregateServicePerformance(
      lineItems.map((item) => ({
        ...item,
        serviceId: item.serviceId!,
        serviceNameSnapshot: item.serviceNameSnapshot!,
        transactionKind: item.transaction.kind,
      })),
    );
    const visibleEntries = refundReportingAvailable
      ? entries
      : redactServiceRefundAnalytics(entries);
    const page = paginateInMemory<ServicePerformanceEntry>(
      visibleEntries,
      query.cursor,
      query.limit ?? DEFAULT_PAGE_SIZE,
      (e) => e.serviceId,
    );

    return {
      from: query.from,
      to: query.to,
      branchId: query.branchId ?? null,
      data: page.data,
      page: { hasMore: page.hasMore, nextCursor: page.nextCursor },
    };
  }

  async paymentMethods(
    tenant: TenantContext,
    query: ReportQuery & { cursor?: string; limit?: number },
  ) {
    const refundReportingAvailable = await this.hasRefundReporting(
      tenant.organizationId,
    );
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(
      tenant,
      query.branchId,
      query.timezone,
    );

    const summaries = await this.prisma.receiptPaymentSummary.findMany({
      where: {
        organizationId: tenant.organizationId,
        receipt: {
          issuedAt: { gte: range.from, lte: range.to },
          ...scope.branchFilter,
        },
      },
      select: {
        method: true,
        amountMinorSnapshot: true,
        currencySnapshot: true,
        receipt: { select: { kind: true } },
      },
    });

    const entries = aggregatePaymentMethods(
      summaries.map((s) => ({ ...s, receiptKind: s.receipt.kind })),
    );
    const visibleEntries = refundReportingAvailable
      ? entries
      : redactPaymentMethodRefundAnalytics(entries);
    const page = paginateInMemory<PaymentMethodEntry>(
      visibleEntries,
      query.cursor,
      query.limit ?? DEFAULT_PAGE_SIZE,
      (e) => e.method,
    );

    return {
      from: query.from,
      to: query.to,
      branchId: query.branchId ?? null,
      data: page.data,
      page: { hasMore: page.hasMore, nextCursor: page.nextCursor },
    };
  }

  async commissions(
    tenant: TenantContext,
    query: ReportQuery & { cursor?: string; limit?: number },
  ) {
    const refundReportingAvailable = await this.hasRefundReporting(
      tenant.organizationId,
    );
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(
      tenant,
      query.branchId,
      query.timezone,
    );

    const accruals = await this.prisma.commissionAccrual.findMany({
      where: {
        organizationId: tenant.organizationId,
        transaction: {
          postedAt: { gte: range.from, lte: range.to },
          ...scope.branchFilter,
        },
      },
      select: {
        staffProfileId: true,
        source: true,
        kind: true,
        calculatedAmountMinor: true,
        currency: true,
      },
    });

    const entries = aggregateCommissionsBySource(accruals);
    const visibleEntries = refundReportingAvailable
      ? entries
      : redactCommissionRefundAnalytics(entries);
    const page = paginateInMemory<CommissionReportEntry>(
      visibleEntries,
      query.cursor,
      query.limit ?? DEFAULT_PAGE_SIZE,
      (e) => e.staffProfileId,
    );

    return {
      from: query.from,
      to: query.to,
      branchId: query.branchId ?? null,
      data: page.data,
      page: { hasMore: page.hasMore, nextCursor: page.nextCursor },
    };
  }

  /**
   * Per-session physical cash custody, never revenue or bank settlement
   * (docs task Phase 6). Every figure is derived from a session's own
   * immutable CashLedgerEntry rows and its own frozen close snapshot —
   * never recomputed from a live PaymentRecord.
   */
  async cashReconciliation(
    tenant: TenantContext,
    query: ReportQuery & { cursor?: string; limit?: number },
  ) {
    // RBAC (`reports.read`) is enforced by ReportsController. Plan access is
    // deliberately separate: cash reconciliation is a Pro/Enterprise
    // entitlement and must not be unlocked by a permission alone.
    await this.entitlementsService.requireForOrganization(
      tenant.organizationId,
      'cash.reconciliation',
    );
    const range = parseReportDateRange(query.from, query.to);
    const scope = await this.resolveScope(
      tenant,
      query.branchId,
      query.timezone,
    );

    const sessions = await this.prisma.cashSession.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...scope.branchFilter,
        openedAt: { gte: range.from, lte: range.to },
      },
      include: {
        ledgerEntries: { select: { type: true, amountMinor: true } },
        review: { select: { outcome: true } },
        register: { select: { code: true, name: true } },
      },
      orderBy: { openedAt: 'asc' },
    });

    const sumByType = (
      entries: readonly { type: string; amountMinor: number }[],
      type: CashLedgerEntryType,
    ) =>
      entries
        .filter((entry) => entry.type === type)
        .reduce((sum, entry) => sum + entry.amountMinor, 0);

    const entries = sessions.map((session) => ({
      cashSessionId: session.id,
      registerId: session.registerId,
      registerCode: session.register.code,
      registerName: session.register.name,
      currency: session.currency,
      status: session.status,
      openingFloatMinor: sumByType(
        session.ledgerEntries,
        CashLedgerEntryType.OPENING_FLOAT,
      ),
      paymentReceivedMinor: sumByType(
        session.ledgerEntries,
        CashLedgerEntryType.PAYMENT_RECEIVED,
      ),
      cashInMinor: sumByType(
        session.ledgerEntries,
        CashLedgerEntryType.CASH_IN,
      ),
      cashOutMinor: sumByType(
        session.ledgerEntries,
        CashLedgerEntryType.CASH_OUT,
      ),
      safeDropMinor: sumByType(
        session.ledgerEntries,
        CashLedgerEntryType.SAFE_DROP,
      ),
      cashRefundMinor: sumByType(
        session.ledgerEntries,
        CashLedgerEntryType.REFUND_PAID,
      ),
      expectedClosingCashMinor: session.expectedClosingCashMinor,
      countedCashMinor: session.countedCashMinor,
      varianceMinor: session.varianceMinor,
      reviewOutcome: session.review?.outcome ?? null,
    }));

    const page = paginateInMemory(
      entries,
      query.cursor,
      query.limit ?? DEFAULT_PAGE_SIZE,
      (e) => e.cashSessionId,
    );
    return {
      from: query.from,
      to: query.to,
      branchId: query.branchId ?? null,
      data: page.data,
      page: { hasMore: page.hasMore, nextCursor: page.nextCursor },
    };
  }

  /**
   * `requireTimeZone` defaults to `false`: only `revenue` performs any
   * timezone-sensitive local-date grouping, so only it needs to pass
   * `true` and enforce the "explicit timezone required for an
   * organization-wide report" rule. The other endpoints aggregate over
   * the whole requested range and never bucket by local day, so
   * requiring a timezone from their callers would be an unused,
   * incorrect restriction.
   */
  private async resolveScope(
    tenant: TenantContext,
    branchId: string | undefined,
    explicitTimeZone: string | undefined,
    requireTimeZone = false,
  ): Promise<ReportScope> {
    if (branchId) {
      assertMembershipHasBranchAccess(tenant, branchId);
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId: tenant.organizationId },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
      return { branchFilter: { branchId }, timeZone: branch.timeZone };
    }
    const hasBroadBranchAccess = tenant.permissionCodes.has(
      BROAD_BRANCH_ACCESS_PERMISSION,
    );
    const branchFilter = hasBroadBranchAccess
      ? {}
      : { branchId: { in: tenant.branchIds } };
    if (!requireTimeZone) {
      return { branchFilter, timeZone: explicitTimeZone ?? '' };
    }
    return {
      branchFilter,
      timeZone: resolveReportTimeZone(undefined, explicitTimeZone),
    };
  }

  /**
   * Refund reporting is a mixed-response capability. A plan without it must
   * still receive basic reports, so this check deliberately returns false
   * instead of throwing the plan-denial response used by dedicated routes.
   */
  private async hasRefundReporting(organizationId: string): Promise<boolean> {
    try {
      return await this.entitlementsService.hasForOrganization(
        organizationId,
        REFUND_REPORTING_ENTITLEMENT,
      );
    } catch {
      return false;
    }
  }

  private async requireMultiBranchEntitlementWhenNeeded(
    tenant: TenantContext,
  ): Promise<void> {
    const branchIds = await this.resolveAuthorizedBranchIds(tenant);
    if (branchIds.length <= 1) return;

    await this.entitlementsService.requireForOrganization(
      tenant.organizationId,
      MULTI_BRANCH_REPORTING_ENTITLEMENT,
    );
  }

  private async resolveAuthorizedBranchIds(tenant: TenantContext): Promise<string[]> {
    if (tenant.permissionCodes.has(BROAD_BRANCH_ACCESS_PERMISSION)) {
      const branches = await this.prisma.branch.findMany({
        where: { organizationId: tenant.organizationId },
        select: { id: true },
      });
      return branches.map((branch) => branch.id);
    }

    if (tenant.branchIds.length === 0) return [];
    const branches = await this.prisma.branch.findMany({
      where: {
        organizationId: tenant.organizationId,
        id: { in: tenant.branchIds },
      },
      select: { id: true },
    });
    return branches.map((branch) => branch.id);
  }
}
