import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionAccessMode } from '../../generated/prisma/client.js';
import type { TenantContext } from './interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from './tenant-access.guard.js';

function createContext(options: {
  method?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}): ExecutionContext {
  const request = {
    method: options.method ?? 'GET',
    params: options.params ?? {},
    headers: options.headers ?? {},
    authUser: { id: 'user-1', sessionId: 'session-1' },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
  } as unknown as ExecutionContext;
}

function baseTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    membershipId: 'membership-1',
    organizationId: 'org-1',
    userId: 'user-1',
    roleCodes: ['manager'],
    permissionCodes: new Set(['staff.read']),
    isOwner: false,
    branchIds: [],
    accessMode: SubscriptionAccessMode.FULL,
    ...overrides,
  };
}

function createGuard(tenantContext: TenantContext | null, metadata: Record<string, unknown> = {}) {
  const tenantContextService = { resolve: vi.fn().mockResolvedValue(tenantContext) };
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(
    (key: unknown) => metadata[key as string],
  );
  return new TenantAccessGuard(reflector, tenantContextService as never);
}

describe('TenantAccessGuard', () => {
  it('denies when no organization context is supplied', async () => {
    const guard = createGuard(baseTenantContext());
    await expect(
      guard.canActivate(createContext({ params: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies when the user has no active membership in the organization', async () => {
    const guard = createGuard(null);
    await expect(
      guard.canActivate(createContext({ params: { organizationId: 'org-1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies every request when the subscription access mode is BLOCKED', async () => {
    const guard = createGuard(
      baseTenantContext({ accessMode: SubscriptionAccessMode.BLOCKED }),
    );
    await expect(
      guard.canActivate(
        createContext({ method: 'GET', params: { organizationId: 'org-1' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a mutating request when the subscription access mode is READ_ONLY', async () => {
    const guard = createGuard(
      baseTenantContext({ accessMode: SubscriptionAccessMode.READ_ONLY }),
    );
    await expect(
      guard.canActivate(
        createContext({ method: 'POST', params: { organizationId: 'org-1' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a read under READ_ONLY access mode', async () => {
    const guard = createGuard(
      baseTenantContext({ accessMode: SubscriptionAccessMode.READ_ONLY }),
    );
    await expect(
      guard.canActivate(
        createContext({ method: 'GET', params: { organizationId: 'org-1' } }),
      ),
    ).resolves.toBe(true);
  });

  it('allows a mutation under READ_ONLY when explicitly marked safe', async () => {
    const guard = createGuard(
      baseTenantContext({ accessMode: SubscriptionAccessMode.READ_ONLY }),
      { allowReadOnlyAccess: true },
    );
    await expect(
      guard.canActivate(
        createContext({ method: 'POST', params: { organizationId: 'org-1' } }),
      ),
    ).resolves.toBe(true);
  });

  it('denies when a required permission is missing', async () => {
    const guard = createGuard(baseTenantContext({ permissionCodes: new Set(['staff.read']) }), {
      requiredPermissions: ['staff.manage'],
    });
    await expect(
      guard.canActivate(createContext({ params: { organizationId: 'org-1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows when every required permission is present', async () => {
    const guard = createGuard(
      baseTenantContext({ permissionCodes: new Set(['staff.read', 'staff.manage']) }),
      { requiredPermissions: ['staff.manage'] },
    );
    await expect(
      guard.canActivate(createContext({ params: { organizationId: 'org-1' } })),
    ).resolves.toBe(true);
  });

  it('denies branch-scoped access when the branch is not assigned', async () => {
    const guard = createGuard(baseTenantContext({ branchIds: ['branch-a'] }), {
      requireBranchParam: 'branchId',
    });
    await expect(
      guard.canActivate(
        createContext({ params: { organizationId: 'org-1', branchId: 'branch-b' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows branch-scoped access when the branch is explicitly assigned', async () => {
    const guard = createGuard(baseTenantContext({ branchIds: ['branch-a'] }), {
      requireBranchParam: 'branchId',
    });
    await expect(
      guard.canActivate(
        createContext({ params: { organizationId: 'org-1', branchId: 'branch-a' } }),
      ),
    ).resolves.toBe(true);
  });

  it('allows branch-scoped access without an explicit assignment when the membership holds branches.manage', async () => {
    const guard = createGuard(
      baseTenantContext({ branchIds: [], permissionCodes: new Set(['branches.manage']) }),
      { requireBranchParam: 'branchId' },
    );
    await expect(
      guard.canActivate(
        createContext({ params: { organizationId: 'org-1', branchId: 'any-branch' } }),
      ),
    ).resolves.toBe(true);
  });
});
