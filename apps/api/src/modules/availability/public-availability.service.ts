import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { BranchStatus, StaffEmploymentStatus, MembershipStatus } from '../../generated/prisma/client.js';
import { DiscoveryService } from '../discovery/discovery.service.js';
import {
  AvailabilityEngineService,
  type AvailabilityResult,
} from './availability-engine.service.js';
import type { QueryAvailabilityDto } from './dto/query-availability.dto.js';
import { normalizeAvailabilityDateRange } from './normalize-availability-date-range.util.js';

export interface PublicServiceSummary {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  pricingType: string;
  serviceCategoryId: string | null;
}

export interface PublicProviderSummary {
  staffProfileId: string;
  displayName: string;
}

/**
 * The public-facing half of Phase 15: resolves and enforces discovery
 * visibility (steps 1-4) before ever touching AvailabilityEngineService,
 * so nothing about a PRIVATE business's catalogue or schedule is
 * reachable through these methods regardless of what a caller already
 * knows (a branch or service id). LINK_ONLY businesses reach here the
 * same way DiscoveryService.getBySlug already allows: only through exact
 * slug access.
 */
@Injectable()
export class PublicAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discoveryService: DiscoveryService,
    private readonly availabilityEngine: AvailabilityEngineService,
  ) {}

  async listBranchServices(slug: string, branchId: string): Promise<PublicServiceSummary[]> {
    const { organizationId } = await this.discoveryService.resolveAccessibleOrganizationBySlug(slug);
    await this.assertBranchDiscoverable(organizationId, branchId);

    const branchServices = await this.prisma.branchService.findMany({
      where: { organizationId, branchId, isEnabled: true },
      include: { service: true },
      orderBy: { service: { sortOrder: 'asc' } },
    });

    return branchServices
      .filter((bs) => bs.service.archivedAt === null)
      .filter((bs) => bs.isBookableByCustomerOverride ?? bs.service.isBookableByCustomer)
      .map((bs) => ({
        id: bs.service.id,
        name: bs.service.name,
        description: bs.service.description,
        durationMinutes: bs.durationOverrideMinutes ?? bs.service.durationMinutes,
        priceMinor: bs.priceOverrideMinor ?? bs.service.priceMinor,
        currency: bs.service.currency,
        pricingType: bs.service.pricingType,
        serviceCategoryId: bs.service.serviceCategoryId,
      }));
  }

  async listServiceProviders(
    slug: string,
    branchId: string,
    serviceId: string,
  ): Promise<PublicProviderSummary[]> {
    const { organizationId } = await this.discoveryService.resolveAccessibleOrganizationBySlug(slug);
    await this.assertBranchDiscoverable(organizationId, branchId);
    await this.assertServiceCustomerBookable(organizationId, branchId, serviceId);

    const assignments = await this.prisma.staffServiceAssignment.findMany({
      where: {
        organizationId,
        branchId,
        serviceId,
        isBookable: true,
        staffProfile: {
          employmentStatus: StaffEmploymentStatus.ACTIVE,
          membership: { status: MembershipStatus.ACTIVE },
        },
      },
      include: { staffProfile: { include: { membership: { include: { user: true } } } } },
    });

    return assignments.map((assignment) => ({
      staffProfileId: assignment.staffProfileId,
      displayName: assignment.staffProfile.membership.user.displayName,
    }));
  }

  async queryAvailability(
    slug: string,
    branchId: string,
    query: QueryAvailabilityDto,
  ): Promise<AvailabilityResult> {
    const { organizationId } = await this.discoveryService.resolveAccessibleOrganizationBySlug(slug);
    await this.assertBranchDiscoverable(organizationId, branchId);

    const serviceIds = query.serviceIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (serviceIds.length === 0) {
      throw new BadRequestException('serviceIds is required');
    }
    for (const serviceId of serviceIds) {
      await this.assertServiceCustomerBookable(organizationId, branchId, serviceId);
    }

    const { fromLocalDate, toLocalDate } = normalizeAvailabilityDateRange(query);

    return this.availabilityEngine.computeAvailability({
      organizationId,
      branchId,
      serviceIds,
      staffProfileId: query.staffProfileId,
      fromLocalDate,
      toLocalDate,
    });
  }

  /** Step 3: the branch itself must be active and customer-visible. */
  private async assertBranchDiscoverable(organizationId: string, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId, status: BranchStatus.ACTIVE, isDiscoverable: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
  }

  /** Step 4: the service must be active, enabled at this branch, and
   * customer-bookable (accounting for the branch-level override). */
  private async assertServiceCustomerBookable(
    organizationId: string,
    branchId: string,
    serviceId: string,
  ): Promise<void> {
    const branchService = await this.prisma.branchService.findFirst({
      where: {
        organizationId,
        branchId,
        serviceId,
        isEnabled: true,
        service: { archivedAt: null },
      },
      include: { service: true },
    });
    const isBookable = branchService
      ? (branchService.isBookableByCustomerOverride ?? branchService.service.isBookableByCustomer)
      : false;
    if (!branchService || !isBookable) {
      throw new NotFoundException('Service not found');
    }
  }
}

