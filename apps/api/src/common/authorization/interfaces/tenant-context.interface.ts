import type { SubscriptionAccessMode } from '../../../generated/prisma/client.js';
import type { AuthenticatedRequest } from '../../../modules/auth/interfaces/authenticated-request.interface.js';

/**
 * Resolved fresh from the database on every request by
 * TenantContextService — never trusted from a token or request body.
 * `isOwner` and `branchIds` are convenience projections of the same
 * underlying membership/role/branch-assignment rows; nothing here is a
 * standalone authorization decision.
 */
export interface TenantContext {
  membershipId: string;
  organizationId: string;
  userId: string;
  roleCodes: string[];
  permissionCodes: Set<string>;
  isOwner: boolean;
  /** Explicit branch assignments for this membership; empty does not by
   * itself mean "no restriction" — see TenantAccessGuard's branch check,
   * which also honors a broad `branches.manage` permission. */
  branchIds: string[];
  accessMode: SubscriptionAccessMode;
}

export interface TenantScopedRequest extends AuthenticatedRequest {
  tenantContext: TenantContext;
}
