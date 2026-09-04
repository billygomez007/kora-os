import type { CommissionRule } from '../../generated/prisma/client.js';

export interface CommissionRuleView {
  id: string;
  organizationId: string;
  branchId: string | null;
  staffProfileId: string | null;
  serviceId: string | null;
  type: string;
  rateBasisPoints: number | null;
  fixedAmountMinor: number | null;
  fixedCurrency: string | null;
  basis: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdByMembershipId: string;
  supersedesRuleId: string | null;
  deactivatedAt: string | null;
  deactivatedByMembershipId: string | null;
  /** True when this rule is neither superseded nor deactivated —
   * derived, never itself stored (docs task Phase 1: "current" is a
   * function of `effectiveUntil`/`deactivatedAt`, not its own column). */
  isCurrent: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function toCommissionRuleView(rule: CommissionRule): CommissionRuleView {
  return {
    id: rule.id,
    organizationId: rule.organizationId,
    branchId: rule.branchId,
    staffProfileId: rule.staffProfileId,
    serviceId: rule.serviceId,
    type: rule.type,
    rateBasisPoints: rule.rateBasisPoints,
    fixedAmountMinor: rule.fixedAmountMinor,
    fixedCurrency: rule.fixedCurrency,
    basis: rule.basis,
    effectiveFrom: rule.effectiveFrom.toISOString(),
    effectiveUntil: rule.effectiveUntil?.toISOString() ?? null,
    createdByMembershipId: rule.createdByMembershipId,
    supersedesRuleId: rule.supersedesRuleId,
    deactivatedAt: rule.deactivatedAt?.toISOString() ?? null,
    deactivatedByMembershipId: rule.deactivatedByMembershipId,
    isCurrent: rule.effectiveUntil === null && rule.deactivatedAt === null,
    version: rule.version,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}
