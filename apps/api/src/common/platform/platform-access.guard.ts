import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service.js';
import { PLATFORM_PERMISSIONS_KEY } from './decorators/require-platform-permissions.decorator.js';
import type { PlatformScopedRequest } from './platform-context.interface.js';

@Injectable()
export class PlatformAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformScopedRequest>();
    const user = (request as PlatformScopedRequest & { authUser?: { id: string } }).authUser;
    if (!user?.id) {
      throw new ForbiddenException('Platform access is required');
    }

    const assignments = await this.prisma.platformRoleAssignment.findMany({
      where: { userId: user.id, revokedAt: null },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    const permissionCodes = new Set<string>();
    const roleCodes: string[] = [];
    for (const assignment of assignments) {
      roleCodes.push(assignment.role.code);
      for (const grant of assignment.role.rolePermissions) {
        permissionCodes.add(grant.permission.code);
      }
    }

    const required = this.reflector.getAllAndOverride<string[]>(
      PLATFORM_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? [];
    const missing = required.find((permission) => !permissionCodes.has(permission));
    if (assignments.length === 0 || missing) {
      throw new ForbiddenException('Platform access is not permitted');
    }

    request.platformContext = {
      userId: user.id,
      roleCodes,
      permissionCodes,
    };
    return true;
  }
}
