import { SetMetadata } from '@nestjs/common';

export const BRANCH_PARAM_KEY = 'requireBranchParam';

/**
 * Names the route param (default "branchId") holding the target branch.
 * TenantAccessGuard then requires either an explicit BranchAssignment for
 * that branch, or the broad `branches.manage` permission (which every
 * seeded owner role — and any other role granted it — already has).
 */
export const RequireBranchParam = (paramName = 'branchId') =>
  SetMetadata(BRANCH_PARAM_KEY, paramName);
