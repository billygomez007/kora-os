import {
  CORE_STARTER_ENTITLEMENTS,
  ENTITLEMENT_DEFINITIONS,
  PLAN_DEFINITIONS,
  PLAN_ENTITLEMENTS,
} from './plan-entitlements.js';

describe('canonical plan entitlements', () => {
  it('locks the approved public limits', () => {
    expect(PLAN_ENTITLEMENTS.starter['branches.max']).toBe(1);
    expect(PLAN_ENTITLEMENTS.starter['staff.max']).toBe(5);
    expect(PLAN_ENTITLEMENTS.business['branches.max']).toBe(3);
    expect(PLAN_ENTITLEMENTS.business['staff.max']).toBe(20);
    expect(PLAN_ENTITLEMENTS.pro['branches.max']).toBe(10);
    expect(PLAN_ENTITLEMENTS.pro['staff.max']).toBe(75);
    expect(PLAN_ENTITLEMENTS.enterprise['branches.max']).toBeNull();
    expect(PLAN_ENTITLEMENTS.enterprise['staff.max']).toBeNull();
  });

  it('keeps higher public plans cumulative', () => {
    for (const code of CORE_STARTER_ENTITLEMENTS) {
      if (PLAN_ENTITLEMENTS.starter[code] === true) {
        expect(PLAN_ENTITLEMENTS.business[code]).toBe(true);
        expect(PLAN_ENTITLEMENTS.pro[code]).toBe(true);
        expect(PLAN_ENTITLEMENTS.enterprise[code]).toBe(true);
      }
    }
    expect(PLAN_ENTITLEMENTS.business['reporting.performance']).toBe(true);
    expect(PLAN_ENTITLEMENTS.pro['reporting.advanced']).toBe(true);
    expect(PLAN_ENTITLEMENTS.pro['cash.reconciliation']).toBe(true);
    expect(PLAN_ENTITLEMENTS.pro['commissions.advanced']).toBe(true);
  });

  it('retains Growth internally without publishing it', () => {
    expect(PLAN_DEFINITIONS.find((plan) => plan.code === 'growth')?.legacy).toBe(true);
    expect(PLAN_ENTITLEMENTS.growth).toBeDefined();
  });

  it('defines every seeded entitlement exactly once', () => {
    const codes = ENTITLEMENT_DEFINITIONS.map((definition) => definition.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const plan of PLAN_DEFINITIONS) {
      expect(Object.keys(plan.entitlements).sort()).toEqual([...codes].sort());
    }
  });
});
