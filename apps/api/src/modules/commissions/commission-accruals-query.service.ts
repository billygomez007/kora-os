import { Injectable } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CommissionAccrualSource } from '../../generated/prisma/client.js';
import { aggregateCommissionsBySource, type CommissionReportEntry } from '../reports/report-aggregation.util.js';
import { toCommissionAccrualView, type CommissionAccrualView } from './commission-accrual-view.js';
import { myEarningsInclude, toMyEarningsLineView, type MyEarningsLineView } from './my-earnings-view.js';

const DEFAULT_PAGE_SIZE = 20;
const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';

@Injectable()
export class CommissionAccrualsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** `commissions.read_all` only — never exposes another staff member's
   * earnings implicitly; a caller wanting only their own uses
   * `listOwnEarnings` instead. */
  async listForOrganization(
    tenant: TenantContext,
    options: {
      branchId?: string;
      staffProfileId?: string;
      source?: CommissionAccrualSource;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<PaginatedPayload<CommissionAccrualView>> {
    if (options.branchId) {
      assertMembershipHasBranchAccess(tenant, options.branchId);
    }
    const hasBroadBranchAccess = tenant.permissionCodes.has(BROAD_BRANCH_ACCESS_PERMISSION);
    const branchFilter = options.branchId
      ? { transaction: { branchId: options.branchId } }
      : hasBroadBranchAccess
        ? {}
        : { transaction: { branchId: { in: tenant.branchIds } } };

    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.commissionAccrual.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...branchFilter,
        ...(options.staffProfileId ? { staffProfileId: options.staffProfileId } : {}),
        ...(options.source ? { source: options.source } : {}),
        ...(options.from || options.to
          ? {
              calculatedAt: {
                ...(options.from ? { gte: new Date(options.from) } : {}),
                ...(options.to ? { lte: new Date(options.to) } : {}),
              },
            }
          : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toCommissionAccrualView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  /** `commissions.read_own` — the caller's own StaffProfile is resolved
   * fresh from the database on every call; a client-supplied staff-
   * profile id is never accepted for this endpoint (docs task Phase 2:
   * "Never trust a client-supplied staff-profile ID"). A membership with
   * no StaffProfile at all simply has no earnings. */
  async listOwnEarnings(
    tenant: TenantContext,
    options: { from?: string; to?: string; cursor?: string; limit?: number },
  ): Promise<PaginatedPayload<MyEarningsLineView>> {
    const ownStaffProfile = await this.prisma.staffProfile.findUnique({
      where: { organizationId_membershipId: { organizationId: tenant.organizationId, membershipId: tenant.membershipId } },
    });
    if (!ownStaffProfile) {
      return { data: [], page: { hasMore: false, nextCursor: null } };
    }

    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.commissionAccrual.findMany({
      where: {
        organizationId: tenant.organizationId,
        staffProfileId: ownStaffProfile.id,
        ...(options.from || options.to
          ? {
              calculatedAt: {
                ...(options.from ? { gte: new Date(options.from) } : {}),
                ...(options.to ? { lte: new Date(options.to) } : {}),
              },
            }
          : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      include: myEarningsInclude,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toMyEarningsLineView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  /** Currency-separated earned/refunded/reversed/net totals for the
   * caller's own accruals over a date range — reuses the same
   * aggregation as the owner/manager commissions report so the two
   * never drift, but scoped to one staff profile only. Never derived
   * from a mutable Service price or a cached commission rate (docs task
   * Phase 12: "derive only from server CommissionAccrual data"). */
  async summaryOwnEarnings(tenant: TenantContext, options: { from?: string; to?: string }): Promise<CommissionReportEntry> {
    const ownStaffProfile = await this.prisma.staffProfile.findUnique({
      where: { organizationId_membershipId: { organizationId: tenant.organizationId, membershipId: tenant.membershipId } },
    });
    const empty: CommissionReportEntry = {
      staffProfileId: ownStaffProfile?.id ?? '',
      policyAccrued: [],
      noPolicyAccrued: [],
      refunded: [],
      reversed: [],
      net: [],
    };
    if (!ownStaffProfile) {
      return empty;
    }

    const accruals = await this.prisma.commissionAccrual.findMany({
      where: {
        organizationId: tenant.organizationId,
        staffProfileId: ownStaffProfile.id,
        ...(options.from || options.to
          ? {
              calculatedAt: {
                ...(options.from ? { gte: new Date(options.from) } : {}),
                ...(options.to ? { lte: new Date(options.to) } : {}),
              },
            }
          : {}),
      },
      select: { staffProfileId: true, source: true, kind: true, calculatedAmountMinor: true, currency: true },
    });

    const [entry] = aggregateCommissionsBySource(accruals);
    return entry ?? empty;
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
}
