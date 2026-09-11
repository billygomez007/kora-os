import { EntitlementValueType } from '../../generated/prisma/client.js';
import { EntitlementsService } from './entitlements.service.js';

function createServiceWithStub(
  planEntitlements: Array<{
    value: unknown;
    entitlement: { code: string; valueType: EntitlementValueType };
  }>,
  subscription: { planId: string } | null = null,
) {
  const prismaStub = {
    planEntitlement: {
      findMany: vi.fn().mockResolvedValue(planEntitlements),
    },
    organizationSubscription: {
      findUnique: vi.fn().mockResolvedValue(subscription),
    },
  };
  const service = new EntitlementsService(prismaStub as never);
  return { service, prismaStub };
}

describe('EntitlementsService', () => {
  it('resolves plan entitlements purely from database records', async () => {
    const { service } = createServiceWithStub([
      {
        value: 3,
        entitlement: {
          code: 'branches.max',
          valueType: EntitlementValueType.INTEGER,
        },
      },
      {
        value: true,
        entitlement: {
          code: 'reports.advanced',
          valueType: EntitlementValueType.BOOLEAN,
        },
      },
    ]);

    await expect(service.resolveForPlan('plan-1')).resolves.toEqual({
      'branches.max': 3,
      'reports.advanced': true,
    });
  });

  it('resolves organization entitlements through its active subscription plan', async () => {
    const { service, prismaStub } = createServiceWithStub(
      [
        {
          value: 20,
          entitlement: {
            code: 'staff.max',
            valueType: EntitlementValueType.INTEGER,
          },
        },
      ],
      { planId: 'plan-growth' },
    );

    await expect(service.resolveForOrganization('org-1')).resolves.toEqual({
      'staff.max': 20,
    });
    expect(prismaStub.planEntitlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { planId: 'plan-growth' } }),
    );
  });

  it('throws when the organization has no subscription', async () => {
    const { service } = createServiceWithStub([], null);

    await expect(
      service.resolveForOrganization('org-without-subscription'),
    ).rejects.toThrow(/no subscription/i);
  });

  it('rejects a stored value that does not match its declared type', async () => {
    const { service } = createServiceWithStub([
      {
        value: 'not-a-boolean',
        entitlement: {
          code: 'reports.advanced',
          valueType: EntitlementValueType.BOOLEAN,
        },
      },
    ]);

    await expect(service.resolveForPlan('plan-1')).rejects.toThrow(
      /does not match/i,
    );
  });

  it('accepts null for a custom integer limit', async () => {
    const { service } = createServiceWithStub([
      {
        value: null,
        entitlement: {
          code: 'branches.max',
          valueType: EntitlementValueType.INTEGER,
        },
      },
    ]);

    await expect(service.resolveForPlan('enterprise')).resolves.toEqual({
      'branches.max': null,
    });
  });

  it('returns a clear upgrade-required error for a missing feature', async () => {
    const { service } = createServiceWithStub([
      {
        value: false,
        entitlement: {
          code: 'cash.reconciliation',
          valueType: EntitlementValueType.BOOLEAN,
        },
      },
    ], { planId: 'starter' });

    await expect(
      service.requireForOrganization('org-1', 'cash.reconciliation'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PLAN_ENTITLEMENT_REQUIRED' }),
    });
  });

  it('rejects a write that would exceed a numeric plan limit', async () => {
    const { service } = createServiceWithStub([
      {
        value: 1,
        entitlement: {
          code: 'branches.max',
          valueType: EntitlementValueType.INTEGER,
        },
      },
    ]);

    await expect(service.assertWithinLimit('starter', 'branches.max', 1)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PLAN_LIMIT_REACHED', limit: 1 }),
    });
  });
});
