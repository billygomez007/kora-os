import { describe, expect, it, vi } from 'vitest';
import {
  INITIAL_PLATFORM_ADMIN_EMAIL,
  PLATFORM_PERMISSIONS,
  seedPlatformAuthorization,
} from './platform-bootstrap.js';

function fakePrisma(user: { id: string } | null) {
  return {
    platformPermission: {
      upsert: vi.fn(async ({ create }: { create: { code: string } }) => ({ id: `permission-${create.code}` })),
      findMany: vi.fn(async () => PLATFORM_PERMISSIONS.map((permission) => ({ id: `permission-${permission.code}` }))),
    },
    platformRole: {
      upsert: vi.fn(async () => ({ id: 'role-super-admin' })),
    },
    platformRolePermission: {
      upsert: vi.fn(async () => ({ id: 'role-permission' })),
    },
    platformRoleAssignment: {
      upsert: vi.fn(async () => ({ id: 'assignment' })),
    },
    user: {
      findUnique: vi.fn(async () => user),
    },
  };
}

describe('platform authorization bootstrap', () => {
  it('is safe to rerun without creating duplicate role, permission, or assignment rows', async () => {
    const prisma = fakePrisma({ id: 'approved-user' });

    await seedPlatformAuthorization(prisma as never);
    await seedPlatformAuthorization(prisma as never);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { emailNormalized: INITIAL_PLATFORM_ADMIN_EMAIL },
      select: { id: true },
    });
    expect(prisma.platformRole.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.platformPermission.upsert).toHaveBeenCalledTimes(PLATFORM_PERMISSIONS.length * 2);
    expect(prisma.platformRolePermission.upsert).toHaveBeenCalledTimes(PLATFORM_PERMISSIONS.length * 2);
    expect(prisma.platformRoleAssignment.upsert).toHaveBeenCalledTimes(2);
  });

  it('does not create or assign a user before normal OTP account creation', async () => {
    const prisma = fakePrisma(null);

    await seedPlatformAuthorization(prisma as never);

    expect(prisma.platformRoleAssignment.upsert).not.toHaveBeenCalled();
    expect(prisma.user).not.toHaveProperty('create');
  });
});
