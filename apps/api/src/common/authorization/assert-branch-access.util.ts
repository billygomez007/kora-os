import { ForbiddenException } from '@nestjs/common';
import type { TenantContext } from './interfaces/tenant-context.interface.js';

const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';

/**
 * The same branch-scope rule TenantAccessGuard's @RequireBranchParam
 * enforces (an explicit BranchAssignment, or the broad `branches.manage`
 * permission), but usable *after* loading an entity whose branch is not
 * itself a route parameter — every id-scoped queue-entry and
 * service-session route (`/queue-entries/:id/*`,
 * `/service-sessions/:id/*`, `/appointments/:id/check-in`) only learns
 * which branch it touches once the referenced row is loaded, so the
 * guard alone cannot check this and the service layer must.
 */
export function assertMembershipHasBranchAccess(
  tenant: Pick<TenantContext, 'permissionCodes' | 'branchIds'>,
  branchId: string,
): void {
  if (tenant.permissionCodes.has(BROAD_BRANCH_ACCESS_PERMISSION)) {
    return;
  }
  if (!tenant.branchIds.includes(branchId)) {
    throw new ForbiddenException('You do not have access to this branch');
  }
}
