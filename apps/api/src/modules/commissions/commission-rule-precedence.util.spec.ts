import { describe, expect, it } from 'vitest';
import { CommissionCalculationBasis, CommissionRuleType } from '../../generated/prisma/client.js';
import { selectMostSpecificRule, type CandidateCommissionRule } from './commission-rule-precedence.util.js';

const SCOPE = { branchId: 'branch-1', staffProfileId: 'staff-1', serviceId: 'service-1' };
const CURRENCY = 'GHS';

function rule(overrides: Partial<CandidateCommissionRule> & { id: string }): CandidateCommissionRule {
  return {
    branchId: null,
    staffProfileId: null,
    serviceId: null,
    type: CommissionRuleType.PERCENTAGE,
    rateBasisPoints: 1000,
    fixedAmountMinor: null,
    fixedCurrency: null,
    basis: CommissionCalculationBasis.GROSS_LINE,
    ...overrides,
  };
}

describe('selectMostSpecificRule', () => {
  it('returns null when no rules are given', () => {
    expect(selectMostSpecificRule([], SCOPE, CURRENCY)).toBeNull();
  });

  it('returns null when no rule matches the scope at all', () => {
    const rules = [rule({ id: 'r1', staffProfileId: 'someone-else' })];
    expect(selectMostSpecificRule(rules, SCOPE, CURRENCY)).toBeNull();
  });

  it.each([
    ['staff + branch + service (level 1)', { staffProfileId: SCOPE.staffProfileId, branchId: SCOPE.branchId, serviceId: SCOPE.serviceId }],
    ['staff + service (level 2)', { staffProfileId: SCOPE.staffProfileId, serviceId: SCOPE.serviceId }],
    ['staff + branch (level 3)', { staffProfileId: SCOPE.staffProfileId, branchId: SCOPE.branchId }],
    ['staff only (level 4)', { staffProfileId: SCOPE.staffProfileId }],
    ['branch + service (level 5)', { branchId: SCOPE.branchId, serviceId: SCOPE.serviceId }],
    ['service only (level 6)', { serviceId: SCOPE.serviceId }],
    ['branch only (level 7)', { branchId: SCOPE.branchId }],
    ['organization default (level 8)', {}],
  ])('matches a single candidate at precedence level: %s', (_label, scopeFields) => {
    const candidate = rule({ id: 'only', ...scopeFields });
    expect(selectMostSpecificRule([candidate], SCOPE, CURRENCY)?.id).toBe('only');
  });

  it('picks the most specific of all eight levels when every level has a candidate', () => {
    const rules: CandidateCommissionRule[] = [
      rule({ id: 'l8-default' }),
      rule({ id: 'l7-branch', branchId: SCOPE.branchId }),
      rule({ id: 'l6-service', serviceId: SCOPE.serviceId }),
      rule({ id: 'l5-branch-service', branchId: SCOPE.branchId, serviceId: SCOPE.serviceId }),
      rule({ id: 'l4-staff', staffProfileId: SCOPE.staffProfileId }),
      rule({ id: 'l3-staff-branch', staffProfileId: SCOPE.staffProfileId, branchId: SCOPE.branchId }),
      rule({ id: 'l2-staff-service', staffProfileId: SCOPE.staffProfileId, serviceId: SCOPE.serviceId }),
      rule({ id: 'l1-staff-branch-service', staffProfileId: SCOPE.staffProfileId, branchId: SCOPE.branchId, serviceId: SCOPE.serviceId }),
    ];
    expect(selectMostSpecificRule(rules, SCOPE, CURRENCY)?.id).toBe('l1-staff-branch-service');
  });

  it('ranks staff+service (level 2) above staff+branch (level 3)', () => {
    const rules: CandidateCommissionRule[] = [
      rule({ id: 'staff-branch', staffProfileId: SCOPE.staffProfileId, branchId: SCOPE.branchId }),
      rule({ id: 'staff-service', staffProfileId: SCOPE.staffProfileId, serviceId: SCOPE.serviceId }),
    ];
    expect(selectMostSpecificRule(rules, SCOPE, CURRENCY)?.id).toBe('staff-service');
  });

  it('ranks any staff-scoped rule above any non-staff-scoped rule', () => {
    const rules: CandidateCommissionRule[] = [
      rule({ id: 'branch-service', branchId: SCOPE.branchId, serviceId: SCOPE.serviceId }),
      rule({ id: 'staff-only', staffProfileId: SCOPE.staffProfileId }),
    ];
    expect(selectMostSpecificRule(rules, SCOPE, CURRENCY)?.id).toBe('staff-only');
  });

  it('does not match a rule scoped to a different branch/staff/service', () => {
    const rules: CandidateCommissionRule[] = [
      rule({ id: 'other-branch', branchId: 'some-other-branch' }),
      rule({ id: 'other-staff', staffProfileId: 'some-other-staff' }),
      rule({ id: 'other-service', serviceId: 'some-other-service' }),
      rule({ id: 'org-default' }),
    ];
    expect(selectMostSpecificRule(rules, SCOPE, CURRENCY)?.id).toBe('org-default');
  });

  it('filters out a FIXED rule whose currency does not match the transaction, falling through to the next candidate', () => {
    const rules: CandidateCommissionRule[] = [
      rule({ id: 'fixed-wrong-currency', staffProfileId: SCOPE.staffProfileId, type: CommissionRuleType.FIXED, fixedAmountMinor: 500, fixedCurrency: 'USD', rateBasisPoints: null }),
      rule({ id: 'org-default', type: CommissionRuleType.PERCENTAGE }),
    ];
    expect(selectMostSpecificRule(rules, SCOPE, CURRENCY)?.id).toBe('org-default');
  });

  it('matches a FIXED rule whose currency does match', () => {
    const rules: CandidateCommissionRule[] = [
      rule({ id: 'fixed-right-currency', staffProfileId: SCOPE.staffProfileId, type: CommissionRuleType.FIXED, fixedAmountMinor: 500, fixedCurrency: CURRENCY, rateBasisPoints: null }),
    ];
    expect(selectMostSpecificRule(rules, SCOPE, CURRENCY)?.id).toBe('fixed-right-currency');
  });

  it('returns null when the only matching rule is a currency-mismatched FIXED rule and nothing else matches', () => {
    const rules: CandidateCommissionRule[] = [
      rule({ id: 'fixed-wrong-currency', type: CommissionRuleType.FIXED, fixedAmountMinor: 500, fixedCurrency: 'USD', rateBasisPoints: null }),
    ];
    expect(selectMostSpecificRule(rules, SCOPE, CURRENCY)).toBeNull();
  });

  it('is not affected by candidate array order', () => {
    const rules: CandidateCommissionRule[] = [
      rule({ id: 'org-default' }),
      rule({ id: 'staff-only', staffProfileId: SCOPE.staffProfileId }),
    ];
    const forward = selectMostSpecificRule(rules, SCOPE, CURRENCY)?.id;
    const reversed = selectMostSpecificRule([...rules].reverse(), SCOPE, CURRENCY)?.id;
    expect(forward).toBe('staff-only');
    expect(reversed).toBe('staff-only');
  });
});
