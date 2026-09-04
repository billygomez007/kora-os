import { Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import { PrismaService } from '../../database/prisma.service.js';
import { transactionViewInclude, toTransactionView, type TransactionView } from './transaction-view.js';

const DEFAULT_PAGE_SIZE = 20;
const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';

/**
 * Read-only (docs task Phase 4: "Do not add a public endpoint that
 * directly creates a Transaction") — every Transaction row is written
 * exclusively by TransactionPostingService, invoked internally from
 * CheckoutSettlementService.
 */
@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenant: TenantContext,
    options: {
      branchId?: string;
      assignedStaffProfileId?: string;
      customerRecordId?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<PaginatedPayload<TransactionView>> {
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

    const rows = await this.prisma.transaction.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...branchFilter,
        ...(options.assignedStaffProfileId ? { assignedStaffProfileId: options.assignedStaffProfileId } : {}),
        ...(options.customerRecordId ? { customerRecordId: options.customerRecordId } : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      include: transactionViewInclude,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toTransactionView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  async get(tenant: TenantContext, transactionId: string): Promise<TransactionView> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, organizationId: tenant.organizationId },
      include: transactionViewInclude,
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    assertMembershipHasBranchAccess(tenant, transaction.branchId);
    return toTransactionView(transaction);
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
