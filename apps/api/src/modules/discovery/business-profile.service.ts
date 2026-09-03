import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { BusinessProfileVisibility } from '../../generated/prisma/client.js';
import { UpdateBranchDiscoveryDto } from './dto/update-branch-discovery.dto.js';
import { UpsertBusinessProfileDto } from './dto/upsert-business-profile.dto.js';

/**
 * Owner/manager-facing management of the public discovery surface
 * (docs task Phase 9: "Add authorized business-profile management
 * endpoints for owners/managers"). Every method requires the caller to
 * already have passed TenantAccessGuard with the business_profile.manage
 * permission — see BusinessProfileController.
 */
@Injectable()
export class BusinessProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getForOrganization(organizationId: string) {
    return this.prisma.publicBusinessProfile.findUnique({
      where: { organizationId },
      include: { organization: { include: { categoryAssignments: { include: { category: true } } } } },
    });
  }

  async upsert(organizationId: string, input: UpsertBusinessProfileDto) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const existing = await this.prisma.publicBusinessProfile.findUnique({
      where: { organizationId },
    });
    const slug = input.slug ?? existing?.slug ?? organization.slug;

    const profile = await this.prisma.publicBusinessProfile.upsert({
      where: { organizationId },
      update: {
        slug,
        displayName: input.displayName,
        description: input.description,
        logoImageUrl: input.logoImageUrl,
        coverImageUrl: input.coverImageUrl,
        visibility: input.visibility,
        searchKeywords: input.searchKeywords,
      },
      create: {
        organizationId,
        slug,
        displayName: input.displayName,
        description: input.description,
        logoImageUrl: input.logoImageUrl,
        coverImageUrl: input.coverImageUrl,
        visibility: input.visibility ?? BusinessProfileVisibility.PRIVATE,
        searchKeywords: input.searchKeywords,
      },
    });

    if (input.categoryCodes) {
      const categories = await this.prisma.businessCategory.findMany({
        where: { code: { in: input.categoryCodes } },
      });
      await this.prisma.$transaction([
        this.prisma.organizationCategoryAssignment.deleteMany({ where: { organizationId } }),
        ...categories.map((category) =>
          this.prisma.organizationCategoryAssignment.create({
            data: { organizationId, categoryId: category.id },
          }),
        ),
      ]);
    }

    return profile;
  }

  /**
   * "Required public information" (docs task Phase 9) is enforced here,
   * not by a database constraint: a displayName always exists (NOT NULL),
   * and at least one branch must be marked discoverable — otherwise a
   * published profile would have nowhere for a customer to actually visit.
   */
  async publish(organizationId: string) {
    const profile = await this.prisma.publicBusinessProfile.findUnique({
      where: { organizationId },
    });
    if (!profile) {
      throw new NotFoundException('Create a business profile before publishing it');
    }

    const discoverableBranchCount = await this.prisma.branch.count({
      where: { organizationId, isDiscoverable: true },
    });
    if (discoverableBranchCount === 0) {
      throw new BadRequestException(
        'At least one branch must be marked discoverable before publishing',
      );
    }

    return this.prisma.publicBusinessProfile.update({
      where: { organizationId },
      data: { publishedAt: new Date() },
    });
  }

  async unpublish(organizationId: string) {
    return this.prisma.publicBusinessProfile.update({
      where: { organizationId },
      data: { publishedAt: null },
    });
  }

  async updateBranchDiscovery(
    organizationId: string,
    branchId: string,
    input: UpdateBranchDiscoveryDto,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        latitude: input.latitude,
        longitude: input.longitude,
        publicPhone: input.publicPhone,
        publicEmail: input.publicEmail,
        openingHoursNote: input.openingHoursNote,
        isDiscoverable: input.isDiscoverable,
      },
    });
  }
}
