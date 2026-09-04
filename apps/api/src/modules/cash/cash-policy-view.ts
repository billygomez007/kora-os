import type { BranchCashPolicy } from '../../generated/prisma/client.js';

export interface CashPolicyView {
  id: string;
  organizationId: string;
  branchId: string;
  mode: string;
  updatedByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

export function toCashPolicyView(policy: BranchCashPolicy): CashPolicyView {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    branchId: policy.branchId,
    mode: policy.mode,
    updatedByMembershipId: policy.updatedByMembershipId,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}
