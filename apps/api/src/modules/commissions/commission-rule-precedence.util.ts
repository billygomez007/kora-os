import { CommissionRuleType } from '../../generated/prisma/client.js';
import type { CommissionCalculationBasis } from '../../generated/prisma/client.js';

export interface CandidateCommissionRule {
  id: string;
  branchId: string | null;
  staffProfileId: string | null;
  serviceId: string | null;
  type: CommissionRuleType;
  rateBasisPoints: number | null;
  fixedAmountMinor: number | null;
  fixedCurrency: string | null;
  basis: CommissionCalculationBasis;
}

export interface CommissionScope {
  branchId: string;
  staffProfileId: string;
  serviceId: string;
}

/**
 * The eight-level deterministic precedence (docs task Phase 1, verbatim):
 *
 * 1. staff + branch + service
 * 2. staff + service
 * 3. staff + branch
 * 4. staff
 * 5. branch + service
 * 6. service
 * 7. branch
 * 8. organization default (every scope column null)
 *
 * A rule matches a dimension when its own value there is either `null`
 * (wildcard) or exactly equal to the transaction's value for that
 * dimension; among every matching rule, the most specific one wins,
 * scored as `(staffProfileId set ? 4 : 0) + (serviceId set ? 2 : 0) +
 * (branchId set ? 1 : 0)` — a weighting that produces eight strictly
 * distinct scores (7,6,5,4,3,2,1,0), one per precedence level above, so
 * there is never a genuine tie between two different *shapes* of rule
 * (verified in this function's own unit tests). Two rules of the exact
 * same shape/scope should never both be candidates in practice — the
 * database's `commission_rules_current_scope_key` partial unique index
 * (NULLS NOT DISTINCT) prevents two simultaneously-current rules from
 * sharing a scope, and the caller only ever passes rules whose temporal
 * window actually contains the Transaction's `postedAt`.
 *
 * A FIXED-type rule whose `fixedCurrency` does not match the
 * transaction's currency is filtered out before scoring — it cannot
 * actually be applied to this transaction, so resolution falls through
 * to the next most-specific match, or NO_POLICY if none remains, rather
 * than ever failing (docs task Phase 1: "Missing policy must not
 * prevent legitimate transaction posting").
 *
 * Pure and side-effect-free — the caller resolves every candidate rule
 * from the database first (already filtered to this organization and to
 * rules effective at the Transaction's `postedAt`).
 */
export function selectMostSpecificRule(
  rules: readonly CandidateCommissionRule[],
  scope: CommissionScope,
  transactionCurrency: string,
): CandidateCommissionRule | null {
  let best: CandidateCommissionRule | null = null;
  let bestScore = -1;

  for (const rule of rules) {
    const branchMatches = rule.branchId === null || rule.branchId === scope.branchId;
    const staffMatches = rule.staffProfileId === null || rule.staffProfileId === scope.staffProfileId;
    const serviceMatches = rule.serviceId === null || rule.serviceId === scope.serviceId;
    if (!branchMatches || !staffMatches || !serviceMatches) {
      continue;
    }
    if (rule.type === CommissionRuleType.FIXED && rule.fixedCurrency !== transactionCurrency) {
      continue;
    }

    const score =
      (rule.staffProfileId !== null ? 4 : 0) +
      (rule.serviceId !== null ? 2 : 0) +
      (rule.branchId !== null ? 1 : 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }

  return best;
}
