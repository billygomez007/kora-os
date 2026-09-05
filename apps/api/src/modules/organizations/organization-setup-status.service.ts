import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

export interface OrganizationSetupStatus {
  organizationCreated: boolean;
  firstBranchCreated: boolean;
  businessProfileConfigured: boolean;
  serviceCreated: boolean;
  branchHoursConfigured: boolean;
  staffInvitationSent: boolean;
  profilePublicationEligible: boolean;
}

/**
 * A resumable onboarding wizard cannot let the client declare its own
 * checklist step complete (docs task "Business Onboarding Contract") —
 * every boolean here is computed fresh from authoritative database
 * state on every call, never from a client-supplied flag or a cached
 * value. `profilePublicationEligible` deliberately mirrors
 * `BusinessProfileService`'s own publish prerequisite exactly (a
 * profile row must exist, and at least one branch must be marked
 * discoverable) rather than re-deriving a different rule that could
 * drift from what publishing actually requires.
 */
@Injectable()
export class OrganizationSetupStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(organizationId: string): Promise<OrganizationSetupStatus> {
    const [
      branchCount,
      discoverableBranchCount,
      businessProfile,
      serviceCount,
      businessHoursCount,
      invitationCount,
    ] = await Promise.all([
      this.prisma.branch.count({ where: { organizationId } }),
      this.prisma.branch.count({ where: { organizationId, isDiscoverable: true } }),
      this.prisma.publicBusinessProfile.findUnique({ where: { organizationId } }),
      this.prisma.service.count({ where: { organizationId, archivedAt: null } }),
      this.prisma.branchBusinessHours.count({ where: { organizationId } }),
      this.prisma.staffInvitation.count({ where: { organizationId } }),
    ]);

    return {
      organizationCreated: true,
      firstBranchCreated: branchCount > 0,
      businessProfileConfigured: businessProfile !== null,
      serviceCreated: serviceCount > 0,
      branchHoursConfigured: businessHoursCount > 0,
      staffInvitationSent: invitationCount > 0,
      profilePublicationEligible: businessProfile !== null && discoverableBranchCount > 0,
    };
  }
}
