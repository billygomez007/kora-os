import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DomainEventEmitter } from '../../common/events/domain-event-emitter.service.js';
import { assertNoOverlappingIntervals } from '../../common/scheduling/interval-validation.util.js';
import { isValidLocalDate } from '../../common/scheduling/local-time.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  MembershipStatus,
  StaffEmploymentStatus,
} from '../../generated/prisma/client.js';
import type {
  StaffAvailabilityException,
  StaffAvailabilityRule,
} from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateStaffAvailabilityExceptionDto } from './dto/create-staff-availability-exception.dto.js';
import type { ReplaceStaffAvailabilityRulesDto } from './dto/replace-staff-availability-rules.dto.js';

export interface StaffAvailabilityActor {
  organizationId: string;
  branchId: string;
  staffProfileId: string;
  actorUserId: string;
  actorMembershipId: string;
  requestId: string;
}

@Injectable()
export class StaffAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly domainEvents: DomainEventEmitter,
  ) {}

  // ---------------------------------------------------------------------
  // Recurring rules
  // ---------------------------------------------------------------------

  async listRules(
    organizationId: string,
    branchId: string,
    staffProfileId: string,
  ): Promise<StaffAvailabilityRule[]> {
    return this.prisma.staffAvailabilityRule.findMany({
      where: { organizationId, branchId, staffProfileId },
      orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }],
    });
  }

  /** Replace-all, same semantics as BranchScheduleService.replaceBusinessHours. */
  async replaceRules(
    actor: StaffAvailabilityActor,
    dto: ReplaceStaffAvailabilityRulesDto,
  ): Promise<StaffAvailabilityRule[]> {
    await this.assertStaffAssignedToBranch(actor.organizationId, actor.branchId, actor.staffProfileId);

    const byDay = new Map<number, ReplaceStaffAvailabilityRulesDto['intervals']>();
    for (const interval of dto.intervals) {
      if (
        interval.effectiveFrom &&
        interval.effectiveUntil &&
        interval.effectiveFrom > interval.effectiveUntil
      ) {
        throw new BadRequestException('effectiveFrom must not be after effectiveUntil');
      }
      const existingForDay = byDay.get(interval.dayOfWeek) ?? [];
      existingForDay.push(interval);
      byDay.set(interval.dayOfWeek, existingForDay);
    }
    for (const intervals of byDay.values()) {
      assertNoOverlappingIntervals(intervals);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.staffAvailabilityRule.deleteMany({
        where: {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          staffProfileId: actor.staffProfileId,
        },
      });
      if (dto.intervals.length === 0) {
        return [];
      }
      await tx.staffAvailabilityRule.createMany({
        data: dto.intervals.map((interval) => ({
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          staffProfileId: actor.staffProfileId,
          dayOfWeek: interval.dayOfWeek,
          startLocalTime: interval.startLocalTime,
          endLocalTime: interval.endLocalTime,
          effectiveFrom: interval.effectiveFrom ? new Date(interval.effectiveFrom) : null,
          effectiveUntil: interval.effectiveUntil ? new Date(interval.effectiveUntil) : null,
        })),
      });
      return tx.staffAvailabilityRule.findMany({
        where: {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          staffProfileId: actor.staffProfileId,
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }],
      });
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'staff_availability_rules.replaced',
      entityType: 'staff_profile',
      entityId: actor.staffProfileId,
      requestId: actor.requestId,
      source: 'scheduling',
      newState: { intervalCount: result.length },
    });
    this.domainEvents.emit('AvailabilityChanged', {
      organizationId: actor.organizationId,
      entityType: 'staff_availability_rule',
      entityId: actor.staffProfileId,
      occurredAt: new Date(),
    });

    return result;
  }

  // ---------------------------------------------------------------------
  // Exceptions
  // ---------------------------------------------------------------------

  async listExceptions(
    organizationId: string,
    branchId: string,
    staffProfileId: string,
    range: { from: string; to: string },
  ): Promise<StaffAvailabilityException[]> {
    assertValidDateRange(range);
    return this.prisma.staffAvailabilityException.findMany({
      where: {
        organizationId,
        branchId,
        staffProfileId,
        date: { gte: new Date(range.from), lte: new Date(range.to) },
      },
      orderBy: { date: 'asc' },
    });
  }

  async createException(
    actor: StaffAvailabilityActor,
    dto: CreateStaffAvailabilityExceptionDto,
  ): Promise<StaffAvailabilityException> {
    await this.assertStaffAssignedToBranch(actor.organizationId, actor.branchId, actor.staffProfileId);

    const isFullDay = dto.isFullDay ?? true;
    if (isFullDay) {
      if (dto.startLocalTime || dto.endLocalTime) {
        throw new BadRequestException('startLocalTime/endLocalTime are not accepted for a full-day exception');
      }
    } else {
      if (!dto.startLocalTime || !dto.endLocalTime) {
        throw new BadRequestException('startLocalTime and endLocalTime are required for a partial-day exception');
      }
      assertNoOverlappingIntervals([{ startLocalTime: dto.startLocalTime, endLocalTime: dto.endLocalTime }]);
    }

    const exception = await this.prisma.staffAvailabilityException.create({
      data: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        staffProfileId: actor.staffProfileId,
        date: new Date(dto.date),
        type: dto.type,
        isFullDay,
        startLocalTime: isFullDay ? null : dto.startLocalTime,
        endLocalTime: isFullDay ? null : dto.endLocalTime,
        reason: dto.reason,
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'staff_availability_exception.created',
      entityType: 'staff_availability_exception',
      entityId: exception.id,
      requestId: actor.requestId,
      source: 'scheduling',
      newState: { date: dto.date, type: dto.type, isFullDay },
    });
    this.domainEvents.emit('AvailabilityChanged', {
      organizationId: actor.organizationId,
      entityType: 'staff_availability_exception',
      entityId: exception.id,
      occurredAt: new Date(),
    });

    return exception;
  }

  async deleteException(actor: StaffAvailabilityActor, exceptionId: string): Promise<void> {
    const exception = await this.prisma.staffAvailabilityException.findFirst({
      where: {
        id: exceptionId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        staffProfileId: actor.staffProfileId,
      },
    });
    if (!exception) {
      throw new NotFoundException('Staff availability exception not found');
    }

    await this.prisma.staffAvailabilityException.delete({ where: { id: exceptionId } });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'staff_availability_exception.deleted',
      entityType: 'staff_availability_exception',
      entityId: exceptionId,
      requestId: actor.requestId,
      source: 'scheduling',
    });
    this.domainEvents.emit('AvailabilityChanged', {
      organizationId: actor.organizationId,
      entityType: 'staff_availability_exception',
      entityId: exceptionId,
      occurredAt: new Date(),
    });
  }

  private async assertStaffAssignedToBranch(
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

function assertValidDateRange(range: { from: string; to: string }): void {
  if (!isValidLocalDate(range.from) || !isValidLocalDate(range.to)) {
    throw new BadRequestException('from and to must be valid YYYY-MM-DD dates');
  }
  if (range.from > range.to) {
    throw new BadRequestException('from must not be after to');
  }
}
