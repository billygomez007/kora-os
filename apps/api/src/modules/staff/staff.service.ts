import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { MembershipStatus } from '../../generated/prisma/client.js';

/**
 * Owner/manager-facing team directory (docs task "Team Directory and
 * Staff Profile"). Built from `OrganizationMembership` rather than
 * `StaffProfile`, since a `StaffProfile` only exists for a membership
 * that joined through a staff invitation -- the owner, created directly
 * by onboarding, has no `StaffProfile` row but still has real branch
 * assignments and should still appear here. Never exposes OTP data,
 * session tokens, audit metadata, or another staff member's earnings.
 */
@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] },
      },
      include: {
        user: true,
        membershipRoles: { include: { role: true } },
        branchAssignments: { include: { branch: true } },
        staffProfile: {
          include: {
            staffServiceAssignments: { include: { service: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.userId,
      displayName: membership.user.displayName,
      email: membership.user.emailNormalized,
      status: membership.status,
      roleNames: membership.membershipRoles.map((membershipRole) => membershipRole.role.name),
      roleCodes: membership.membershipRoles.map((membershipRole) => membershipRole.role.code),
      branches: membership.branchAssignments.map((assignment) => ({
        branchId: assignment.branchId,
        name: assignment.branch.name,
      })),
      services: (membership.staffProfile?.staffServiceAssignments ?? []).map((assignment) => ({
        serviceId: assignment.serviceId,
        name: assignment.service.name,
      })),
    }));
  }
}
