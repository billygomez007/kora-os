import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformAccessGuard } from './platform-access.guard.js';
import { PLATFORM_PERMISSIONS_KEY } from './decorators/require-platform-permissions.decorator.js';

function context(userId = 'user-1', organizationId = 'org-spoofed'): ExecutionContext {
  const request = {
    params: { organizationId },
    headers: {},
    authUser: { id: userId, sessionId: 'session-1' },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
  } as unknown as ExecutionContext;
}

function createGuard(assignments: unknown[], required: string[] = ['platform.overview.read']) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
    key === PLATFORM_PERMISSIONS_KEY ? required : undefined,
  );
  const prisma = {
    platformRoleAssignment: {
      findMany: vi.fn().mockResolvedValue(assignments),
    },
  };
  return {
    guard: new PlatformAccessGuard(reflector, prisma as never),
    prisma,
  };
}

describe('PlatformAccessGuard', () => {
  it('denies ordinary users, owners, cashiers, and providers without a platform assignment', async () => {
    for (const userId of ['ordinary', 'owner', 'cashier', 'provider']) {
      const { guard } = createGuard([]);
      await expect(guard.canActivate(context(userId))).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('allows a persisted SUPER_ADMIN assignment with the required platform permission', async () => {
    const { guard } = createGuard([
      {
        role: {
          code: 'SUPER_ADMIN',
          rolePermissions: [
            { permission: { code: 'platform.overview.read' } },
          ],
        },
      },
    ]);

    await expect(guard.canActivate(context('platform-admin'))).resolves.toBe(true);
  });

  it('does not authorize from an email or organization selector', async () => {
    const { guard, prisma } = createGuard([]);
    await expect(guard.canActivate(context('info@koraafric.com', 'another-org')))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.platformRoleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'info@koraafric.com', revokedAt: null } }),
    );
  });

  it('denies an assignment that lacks the endpoint capability', async () => {
    const { guard } = createGuard(
      [{ role: { code: 'SUPER_ADMIN', rolePermissions: [] } }],
      ['platform.users.read'],
    );
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
