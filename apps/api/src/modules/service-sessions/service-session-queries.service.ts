import { Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ServiceSessionStatus } from '../../generated/prisma/client.js';
import { toServiceSessionView, type ServiceSessionView } from './service-session-view.js';

const DEFAULT_PAGE_SIZE = 20;
const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';

@Injectable()
export class ServiceSessionQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** No `:branchId` route param exists for this collection (docs task
   * suggested surface: `GET /v1/organizations/:organizationId/service-
   * sessions`) — visibility is restricted here instead of by
   * TenantAccessGuard: an explicit `branchId` filter must be one of the
   * caller's own assigned branches, and omitting it implicitly scopes
   * the listing to those same branches unless the caller holds the
   * broad `branches.manage` permission. */
  async list(
    tenant: TenantContext,
    options: {
      branchId?: string;
      status?: ServiceSessionStatus;
      assignedStaffProfileId?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<PaginatedPayload<ServiceSessionView>> {
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

    const rows = await this.prisma.serviceSession.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...branchFilter,
        ...(options.status ? { status: options.status } : {}),
        ...(options.assignedStaffProfileId ? { assignedStaffProfileId: options.assignedStaffProfileId } : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      include: { items: true },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toServiceSessionView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  async get(tenant: TenantContext, serviceSessionId: string): Promise<ServiceSessionView> {
    const session = await this.prisma.serviceSession.findFirst({
      where: { id: serviceSessionId, organizationId: tenant.organizationId },
      include: { items: true },
    });
    if (!session) {
      throw new NotFoundException('Service session not found');
    }
    assertMembershipHasBranchAccess(tenant, session.branchId);
    return toServiceSessionView(session);
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
