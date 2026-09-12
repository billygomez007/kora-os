import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  MembershipStatus,
  SubscriptionAccessMode,
} from '../../generated/prisma/client.js';
import { isOrganizationAllowedAccess } from './status-policy.js';
import { SubscriptionAccessService } from '../../modules/subscriptions/subscription-access.service.js';
import type { TenantContext } from './interfaces/tenant-context.interface.js';

const OWNER_ROLE_CODE = 'owner';

/**
 * Resolves everything TenantAccessGuard needs to authorize one request,
 * fresh from the database every time: active membership, the union of
 * permissions across every role the membership holds, explicit branch
 * assignments, and the organization's current subscription access mode.
 * Nothing here is cached in, or trusted from, a token or request body.
 */
@Injectable()
export class TenantContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
  ) {}

  async resolve(userId: string, organizationId: string): Promise<TenantContext | null> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, organizationId, status: MembershipStatus.ACTIVE },
      include: {
        organization: { select: { status: true } },
        membershipRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
        branchAssignments: true,
      },
    });
    if (!membership) {
      return null;
    }
    if (!isOrganizationAllowedAccess(membership.organization.status)) {
      return null;
    }

    const roleCodes = membership.membershipRoles.map((mr) => mr.role.code);
    const permissionCodes = new Set<string>();
    for (const membershipRole of membership.membershipRoles) {
      for (const rolePermission of membershipRole.role.rolePermissions) {
        permissionCodes.add(rolePermission.permission.code);
      }
    }

    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    const accessMode = subscription
      ? this.subscriptionAccessService.resolveAccessMode(subscription.status)
      : SubscriptionAccessMode.BLOCKED;

    return {
      membershipId: membership.id,
      organizationId,
      userId,
      roleCodes,
      permissionCodes,
      isOwner: roleCodes.includes(OWNER_ROLE_CODE),
      branchIds: membership.branchAssignments.map((assignment) => assignment.branchId),
      accessMode,
    };
  }
}
