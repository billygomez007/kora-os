import { MembershipStatus, SubscriptionStatus } from '../../generated/prisma/client.js';
import { SubscriptionAccessService } from '../../modules/subscriptions/subscription-access.service.js';
import { TenantContextService } from './tenant-context.service.js';

function createServiceWithStub(options: {
  membership?: unknown;
  subscription?: { status: SubscriptionStatus } | null;
}) {
  const prismaStub = {
    organizationMembership: {
      findFirst: vi.fn().mockResolvedValue(options.membership ?? null),
    },
    organizationSubscription: {
      findUnique: vi.fn().mockResolvedValue(options.subscription ?? null),
    },
  };
  const service = new TenantContextService(
    prismaStub as never,
    new SubscriptionAccessService(),
  );
  return { service, prismaStub };
}

function membershipFixture(roles: Array<{ code: string; permissionCodes: string[] }>) {
  return {
    id: 'membership-1',
    membershipRoles: roles.map((role, index) => ({
      role: {
        code: role.code,
        rolePermissions: role.permissionCodes.map((code, permissionIndex) => ({
          permission: { code },
          id: `rp-${index}-${permissionIndex}`,
        })),
      },
    })),
    branchAssignments: [{ branchId: 'branch-1' }, { branchId: 'branch-2' }],
  };
}

describe('TenantContextService', () => {
  it('returns null when there is no active membership', async () => {
    const { service } = createServiceWithStub({ membership: null });
    await expect(service.resolve('user-1', 'org-1')).resolves.toBeNull();
  });

  it('unions permissions across every role the membership holds', async () => {
    const { service } = createServiceWithStub({
      membership: membershipFixture([
        { code: 'cashier', permissionCodes: ['transactions.read', 'payments.record'] },
        { code: 'receptionist', permissionCodes: ['appointments.manage'] },
      ]),
      subscription: { status: SubscriptionStatus.ACTIVE },
    });

    const context = await service.resolve('user-1', 'org-1');
    expect(context?.permissionCodes.has('transactions.read')).toBe(true);
    expect(context?.permissionCodes.has('payments.record')).toBe(true);
    expect(context?.permissionCodes.has('appointments.manage')).toBe(true);
    expect(context?.isOwner).toBe(false);
    expect(context?.branchIds).toEqual(['branch-1', 'branch-2']);
  });

  it('marks the membership as owner when it holds the owner role', async () => {
    const { service } = createServiceWithStub({
      membership: membershipFixture([{ code: 'owner', permissionCodes: ['organization.read'] }]),
      subscription: { status: SubscriptionStatus.TRIALING },
    });

    const context = await service.resolve('user-1', 'org-1');
    expect(context?.isOwner).toBe(true);
  });

  it('resolves the access mode from the organization subscription status', async () => {
    const { service } = createServiceWithStub({
      membership: membershipFixture([{ code: 'owner', permissionCodes: [] }]),
      subscription: { status: SubscriptionStatus.SUSPENDED },
    });

    const context = await service.resolve('user-1', 'org-1');
    expect(context?.accessMode).toBe('READ_ONLY');
  });

  it('treats a missing subscription as BLOCKED', async () => {
    const { service } = createServiceWithStub({
      membership: membershipFixture([{ code: 'owner', permissionCodes: [] }]),
      subscription: null,
    });

    const context = await service.resolve('user-1', 'org-1');
    expect(context?.accessMode).toBe('BLOCKED');
  });

  it('scopes the membership lookup to the given user, organization, and ACTIVE status', async () => {
    const { service, prismaStub } = createServiceWithStub({
      membership: membershipFixture([]),
      subscription: { status: SubscriptionStatus.ACTIVE },
    });

    await service.resolve('user-1', 'org-1');
    expect(prismaStub.organizationMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', organizationId: 'org-1', status: MembershipStatus.ACTIVE },
      }),
    );
  });
});
