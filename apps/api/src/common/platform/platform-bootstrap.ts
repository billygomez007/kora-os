import type { PrismaClient } from '../../generated/prisma/client.js';

export const INITIAL_PLATFORM_ADMIN_EMAIL = 'info@koraafric.com';

export const PLATFORM_PERMISSIONS = [
  { code: 'platform.overview.read', description: 'View platform operational overview aggregates.' },
  { code: 'platform.businesses.read', description: 'View platform business directory and business details.' },
  { code: 'platform.users.read', description: 'View non-secret user account and membership metadata.' },
  { code: 'platform.subscriptions.read', description: 'View organization subscription metadata.' },
  { code: 'platform.activity.read', description: 'View platform audit activity.' },
] as const;

export const PLATFORM_ROLES = [
  {
    code: 'SUPER_ADMIN',
    name: 'Platform Super Admin',
    description: 'Full read-only platform operations access; tenant permissions remain separate.',
    permissionCodes: PLATFORM_PERMISSIONS.map((permission) => permission.code),
  },
] as const;

/**
 * Explicit, repeatable bootstrap for platform reference data and the approved
 * initial assignment. It never creates the User; the normal OTP flow must do
 * that first.
 */
export async function seedPlatformAuthorization(prisma: PrismaClient): Promise<void> {
  for (const permission of PLATFORM_PERMISSIONS) {
    await prisma.platformPermission.upsert({
      where: { code: permission.code },
      update: { description: permission.description },
      create: permission,
    });
  }

  const approvedUser = await prisma.user.findUnique({
    where: { emailNormalized: INITIAL_PLATFORM_ADMIN_EMAIL },
    select: { id: true },
  });

  for (const role of PLATFORM_ROLES) {
    const record = await prisma.platformRole.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: { code: role.code, name: role.name, description: role.description },
    });

    const permissions = await prisma.platformPermission.findMany({
      where: { code: { in: [...role.permissionCodes] } },
      select: { id: true },
    });

    for (const permission of permissions) {
      await prisma.platformRolePermission.upsert({
        where: { roleId_permissionId: { roleId: record.id, permissionId: permission.id } },
        update: {},
        create: { roleId: record.id, permissionId: permission.id },
      });
    }

    if (approvedUser) {
      await prisma.platformRoleAssignment.upsert({
        where: { userId_roleId: { userId: approvedUser.id, roleId: record.id } },
        update: { revokedAt: null },
        create: { userId: approvedUser.id, roleId: record.id },
      });
    }
  }
}
