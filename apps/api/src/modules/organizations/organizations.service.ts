import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { MembershipStatus } from '../../generated/prisma/client.js';

/** Read-only organization queries — atomic writes live in OnboardingService. */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every organization the user holds an active membership in. */
  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      status: membership.organization.status,
      membershipId: membership.id,
    }));
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
}
