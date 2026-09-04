import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertBranchOwnedByOrganization } from '../../common/authorization/assert-branch-owned.util.js';
import { DomainEventEmitter } from '../../common/events/domain-event-emitter.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MembershipStatus, StaffEmploymentStatus } from '../../generated/prisma/client.js';
import type { BranchService, Prisma, StaffServiceAssignment } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { ServicesService } from './services.service.js';
import type { AssignStaffServiceDto } from './dto/assign-staff-service.dto.js';
import type { UpsertBranchServiceDto } from './dto/upsert-branch-service.dto.js';

export interface BranchServiceActor {
  organizationId: string;
  branchId: string;
  actorUserId: string;
  actorMembershipId: string;
  requestId: string;
}

@Injectable()
export class BranchServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servicesService: ServicesService,
    private readonly auditService: AuditService,
    private readonly domainEvents: DomainEventEmitter,
  ) {}

  async list(organizationId: string, branchId: string): Promise<BranchService[]> {
    return this.prisma.branchService.findMany({
      where: { organizationId, branchId },
      include: { service: true },
      orderBy: { service: { sortOrder: 'asc' } },
    });
  }

  /** Create-or-update — a branch either offers a service (a row exists)
   * or does not (docs task Phase 11: "Support ... Service enabled/
   * disabled at branch, Optional branch price override, Optional branch
   * duration override"). */
  async upsert(
    actor: BranchServiceActor,
    serviceId: string,
    dto: UpsertBranchServiceDto,
  ): Promise<BranchService> {
    await assertBranchOwnedByOrganization(this.prisma, actor.organizationId, actor.branchId);
    await this.servicesService.findOwned(actor.organizationId, serviceId);

    const existing = await this.prisma.branchService.findUnique({
      where: { branchId_serviceId: { branchId: actor.branchId, serviceId } },
    });

    const data = {
      isEnabled: dto.isEnabled ?? existing?.isEnabled ?? true,
      priceOverrideMinor:
        dto.priceOverrideMinor !== undefined ? dto.priceOverrideMinor : existing?.priceOverrideMinor,
      durationOverrideMinutes:
        dto.durationOverrideMinutes !== undefined
          ? dto.durationOverrideMinutes
          : existing?.durationOverrideMinutes,
      isBookableByCustomerOverride:
        dto.isBookableByCustomerOverride !== undefined
          ? dto.isBookableByCustomerOverride
          : existing?.isBookableByCustomerOverride,
    };

    const branchService = existing
      ? await this.prisma.branchService.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.branchService.create({
          data: {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            serviceId,
            ...data,
          },
        });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: existing ? 'branch_service.updated' : 'branch_service.created',
      entityType: 'branch_service',
      entityId: branchService.id,
      requestId: actor.requestId,
      source: 'services',
      previousState: existing ? toAuditState(existing) : undefined,
      newState: toAuditState(branchService),
    });
    this.domainEvents.emit('AvailabilityChanged', {
      organizationId: actor.organizationId,
      entityType: 'branch_service',
      entityId: branchService.id,
      occurredAt: branchService.updatedAt,
    });

    return branchService;
  }

  async listStaff(
    organizationId: string,
    branchId: string,
    serviceId: string,
  ): Promise<StaffServiceAssignment[]> {
    return this.prisma.staffServiceAssignment.findMany({
      where: { organizationId, branchId, serviceId },
      include: { staffProfile: { include: { membership: { include: { user: true } } } } },
    });
  }

  /**
   * Refuses to assign a staff member who is not currently an active,
   * branch-assigned worker of this organization (docs task Phase 11:
   * "Validation that the staff member is actively assigned to the
   * organization and branch; Prevention of cross-tenant or cross-branch
   * assignments"). Tenant safety here comes structurally from the
   * composite (organizationId, ...) foreign keys on
   * StaffServiceAssignment itself — this check is about *eligibility*,
   * not tenant isolation, which the database already guarantees.
   */
  async assignStaff(
    actor: BranchServiceActor,
    serviceId: string,
    dto: AssignStaffServiceDto,
  ): Promise<StaffServiceAssignment> {
    await assertBranchOwnedByOrganization(this.prisma, actor.organizationId, actor.branchId);
    await this.servicesService.findOwned(actor.organizationId, serviceId);
    await this.assertStaffEligible(actor.organizationId, actor.branchId, dto.staffProfileId);

    const assignment = await this.prisma.staffServiceAssignment.upsert({
      where: {
        staffProfileId_branchId_serviceId: {
          staffProfileId: dto.staffProfileId,
          branchId: actor.branchId,
          serviceId,
        },
      },
      update: {
        isBookable: true,
        durationOverrideMinutes: dto.durationOverrideMinutes,
      },
      create: {
        organizationId: actor.organizationId,
        staffProfileId: dto.staffProfileId,
        branchId: actor.branchId,
        serviceId,
        durationOverrideMinutes: dto.durationOverrideMinutes,
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'staff_service_assignment.created',
      entityType: 'staff_service_assignment',
      entityId: assignment.id,
      requestId: actor.requestId,
      source: 'services',
      newState: { staffProfileId: dto.staffProfileId, serviceId, branchId: actor.branchId },
    });
    this.domainEvents.emit('AvailabilityChanged', {
      organizationId: actor.organizationId,
      entityType: 'staff_service_assignment',
      entityId: assignment.id,
      occurredAt: assignment.updatedAt,
    });

    return assignment;
  }

  async unassignStaff(
    actor: BranchServiceActor,
    serviceId: string,
    staffProfileId: string,
  ): Promise<void> {
    const assignment = await this.prisma.staffServiceAssignment.findUnique({
      where: {
        staffProfileId_branchId_serviceId: {
          staffProfileId,
          branchId: actor.branchId,
          serviceId,
        },
      },
    });
    if (!assignment || assignment.organizationId !== actor.organizationId) {
      throw new NotFoundException('Staff-service assignment not found');
    }

    await this.prisma.staffServiceAssignment.delete({ where: { id: assignment.id } });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'staff_service_assignment.removed',
      entityType: 'staff_service_assignment',
      entityId: assignment.id,
      requestId: actor.requestId,
      source: 'services',
      previousState: { staffProfileId, serviceId, branchId: actor.branchId },
    });
    this.domainEvents.emit('AvailabilityChanged', {
      organizationId: actor.organizationId,
      entityType: 'staff_service_assignment',
      entityId: assignment.id,
      occurredAt: new Date(),
    });
  }

  private async assertStaffEligible(
    organizationId: string,
    branchId: string,
    staffProfileId: string,
  ): Promise<void> {
    const staffProfile = await this.prisma.staffProfile.findFirst({
      where: { id: staffProfileId, organizationId },
      include: { membership: { include: { branchAssignments: true } } },
    });
    if (!staffProfile) {
      throw new BadRequestException('Staff profile not found in this organization');
    }
    if (staffProfile.employmentStatus !== StaffEmploymentStatus.ACTIVE) {
      throw new BadRequestException('Staff member is not active');
    }
    if (staffProfile.membership.status !== MembershipStatus.ACTIVE) {
      throw new BadRequestException('Staff member does not hold an active membership');
    }
    const hasBranchAssignment = staffProfile.membership.branchAssignments.some(
      (assignment) => assignment.branchId === branchId,
    );
    if (!hasBranchAssignment) {
      throw new BadRequestException('Staff member is not assigned to this branch');
    }
  }
}

function toAuditState(branchService: BranchService): Prisma.InputJsonObject {
  return {
    isEnabled: branchService.isEnabled,
    priceOverrideMinor: branchService.priceOverrideMinor,
    durationOverrideMinutes: branchService.durationOverrideMinutes,
    isBookableByCustomerOverride: branchService.isBookableByCustomerOverride,
  };
}
