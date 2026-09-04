import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';

/**
 * TenantAccessGuard's @RequireBranchParam only checks *access* (an
 * explicit BranchAssignment, or the broad `branches.manage` permission
 * every owner/manager role already has) — it does not itself verify the
 * branch id in the route actually belongs to the organization id in the
 * route (a caller with broad branch access could otherwise pass another
 * organization's branch id and hit a raw foreign-key-constraint 500
 * instead of a clean rejection). Every branch-scoped service that writes
 * using both ids calls this first, matching the same explicit check
 * BusinessProfileService.updateBranchDiscovery already established.
 */
export async function assertBranchOwnedByOrganization(
  prisma: PrismaService,
  organizationId: string,
  branchId: string,
): Promise<void> {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId } });
  if (!branch) {
    throw new NotFoundException('Branch not found');
  }
}
