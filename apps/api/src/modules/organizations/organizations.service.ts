import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  MembershipStatus,
  OrganizationStatus,
} from '../../generated/prisma/client.js';

/** Read-only organization queries — atomic writes live in OnboardingService. */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every organization the user holds an active membership in. */
  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        organization: { status: OrganizationStatus.ACTIVE },
      },
      include: {
        organization: true,
        membershipRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => {
      const roleCodes = membership.membershipRoles.map(
        (membershipRole) => membershipRole.role.code,
      );

      const roleNames = membership.membershipRoles.map(
        (membershipRole) => membershipRole.role.name,
      );

      const permissionCodes = [
        ...new Set(
          membership.membershipRoles.flatMap((membershipRole) =>
            membershipRole.role.rolePermissions.map(
              (rolePermission) => rolePermission.permission.code,
            ),
          ),
        ),
      ].sort();

      return {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        status: membership.organization.status,
        membershipId: membership.id,
        roleCodes,
        roleNames,
        permissionCodes,
      };
    });
  }

  /**
   * Callers must already have proven membership via TenantAccessGuard —
   * this method itself performs no authorization check.
   */
  async getDetail(organizationId: string) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
  }

  /**
   * Read-only branch listing — mobile needs this to resolve the primary
   * branch id after resuming onboarding (no full branch CRUD exists yet
   * this stage, see docs task scope notes), and it is otherwise a safe,
   * non-sensitive projection of branch identity fields.
   */
  async listBranches(organizationId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    return branches.map((branch) => ({
      id: branch.id,
      organizationId: branch.organizationId,
      name: branch.name,
      code: branch.code,
      countryCode: branch.countryCode,
      timeZone: branch.timeZone,
      currency: branch.currency,
      status: branch.status,
    }));
  }
}
