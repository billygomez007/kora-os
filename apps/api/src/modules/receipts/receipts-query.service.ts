import { Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import { PrismaService } from '../../database/prisma.service.js';
import { receiptViewInclude, toReceiptView, type ReceiptView } from './receipt-view.js';

const DEFAULT_PAGE_SIZE = 20;
const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';

/**
 * Two entirely separate access paths into the same Receipt rows, never
 * mixed: the business side (`listForOrganization`/`get`, gated by
 * `receipts.read`) and the customer side (`listForCustomer`/`getForCustomer`,
 * gated only by the customer owning the underlying CustomerRecord). A
 * walk-in's receipt — no linked CustomerProfile at all — is reachable
 * only through the business side (docs task Phase 3: "Walk-in receipts
 * with no Kora customer account remain accessible only to authorized
 * business users").
 */
@Injectable()
export class ReceiptsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listForOrganization(
    tenant: TenantContext,
    options: { branchId?: string; customerRecordId?: string; transactionId?: string; cursor?: string; limit?: number },
  ): Promise<PaginatedPayload<ReceiptView>> {
    if (options.branchId) {
      assertMembershipHasBranchAccess(tenant, options.branchId);
    }
    const hasBroadBranchAccess = tenant.permissionCodes.has(BROAD_BRANCH_ACCESS_PERMISSION);
    const branchFilter = options.branchId
      ? { branchId: options.branchId }
      : hasBroadBranchAccess
        ? {}
        : { branchId: { in: tenant.branchIds } };

    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.receipt.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...branchFilter,
        ...(options.customerRecordId ? { customerRecordId: options.customerRecordId } : {}),
        ...(options.transactionId ? { transactionId: options.transactionId } : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      include: receiptViewInclude,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toReceiptView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  async get(tenant: TenantContext, receiptId: string): Promise<ReceiptView> {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id: receiptId, organizationId: tenant.organizationId },
      include: receiptViewInclude,
    });
    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }
    assertMembershipHasBranchAccess(tenant, receipt.branchId);
    return toReceiptView(receipt);
  }

  /** Never trusts a client-supplied customer identifier — `userId` comes
   * only from the authenticated session (JwtAuthGuard/CurrentUser), and
   * a user with no CustomerProfile at all (never used the customer
   * workspace) simply has no receipts. */
  async listForCustomer(
    userId: string,
    options: { cursor?: string; limit?: number },
  ): Promise<PaginatedPayload<ReceiptView>> {
    const profile = await this.prisma.customerProfile.findUnique({ where: { userId } });
    if (!profile) {
      return { data: [], page: { hasMore: false, nextCursor: null } };
    }

    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.receipt.findMany({
      where: {
        customerRecord: { customerProfileId: profile.id },
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      include: receiptViewInclude,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toReceiptView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  async getForCustomer(userId: string, receiptId: string): Promise<ReceiptView> {
    const profile = await this.prisma.customerProfile.findUnique({ where: { userId } });
    const receipt = profile
      ? await this.prisma.receipt.findFirst({
          where: { id: receiptId, customerRecord: { customerProfileId: profile.id } },
          include: receiptViewInclude,
        })
      : null;
    // A receipt that exists but belongs to someone else (or to a
    // walk-in with no linked CustomerProfile) returns the same 404 as
    // one that does not exist at all — never confirming its existence
    // to a caller who cannot see it.
    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }
    return toReceiptView(receipt);
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
