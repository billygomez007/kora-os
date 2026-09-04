import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { assertBranchOwnedByOrganization } from '../../common/authorization/assert-branch-owned.util.js';
import {
  assertNoOverlappingIntervals,
} from '../../common/scheduling/interval-validation.util.js';
import { isValidLocalDate } from '../../common/scheduling/local-time.util.js';
import { DomainEventEmitter } from '../../common/events/domain-event-emitter.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  BranchScheduleExceptionType,
  type BranchBookingPolicy,
  type BranchBusinessHours,
  type BranchScheduleException,
} from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { DEFAULT_BOOKING_POLICY } from './booking-policy.defaults.js';
import type { CreateBranchScheduleExceptionDto } from './dto/create-branch-schedule-exception.dto.js';
import type { ReplaceBusinessHoursDto } from './dto/replace-business-hours.dto.js';
import type { UpsertBookingPolicyDto } from './dto/upsert-booking-policy.dto.js';

export interface BranchScheduleActor {
  organizationId: string;
  branchId: string;
  actorUserId: string;
  actorMembershipId: string;
  requestId: string;
}

export interface ResolvedBookingPolicy {
  slotIntervalMinutes: number;
  minBookingLeadTimeMinutes: number;
  maxBookingHorizonDays: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  cancellationCutoffMinutes: number;
  allowCustomerProviderSelection: boolean;
  allowAnyProvider: boolean;
}

@Injectable()
export class BranchScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly domainEvents: DomainEventEmitter,
  ) {}

  // ---------------------------------------------------------------------
  // Business hours
  // ---------------------------------------------------------------------

  async listBusinessHours(organizationId: string, branchId: string): Promise<BranchBusinessHours[]> {
    return this.prisma.branchBusinessHours.findMany({
      where: { organizationId, branchId },
      orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }],
    });
  }

  /** Replace-all: the client submits the complete weekly set and the
   * whole table for this branch is replaced atomically (docs task Phase
   * 13). Validated per day-of-week before anything is written. */
  async replaceBusinessHours(
    actor: BranchScheduleActor,
    dto: ReplaceBusinessHoursDto,
  ): Promise<BranchBusinessHours[]> {
    await assertBranchOwnedByOrganization(this.prisma, actor.organizationId, actor.branchId);

    const byDay = new Map<number, ReplaceBusinessHoursDto['intervals']>();
    for (const interval of dto.intervals) {
      const existingForDay = byDay.get(interval.dayOfWeek) ?? [];
      existingForDay.push(interval);
      byDay.set(interval.dayOfWeek, existingForDay);
    }
    for (const intervals of byDay.values()) {
      assertNoOverlappingIntervals(intervals);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.branchBusinessHours.deleteMany({
        where: { organizationId: actor.organizationId, branchId: actor.branchId },
      });
      if (dto.intervals.length === 0) {
        return [];
      }
      await tx.branchBusinessHours.createMany({
        data: dto.intervals.map((interval) => ({
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          dayOfWeek: interval.dayOfWeek,
          startLocalTime: interval.startLocalTime,
          endLocalTime: interval.endLocalTime,
        })),
      });
      return tx.branchBusinessHours.findMany({
        where: { organizationId: actor.organizationId, branchId: actor.branchId },
        orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }],
      });
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'branch_business_hours.replaced',
      entityType: 'branch',
      entityId: actor.branchId,
      requestId: actor.requestId,
      source: 'scheduling',
      newState: { intervalCount: result.length },
    });
    this.domainEvents.emit('AvailabilityChanged', {
      organizationId: actor.organizationId,
      entityType: 'branch_business_hours',
      entityId: actor.branchId,
      occurredAt: new Date(),
    });

    return result;
  }

  // ---------------------------------------------------------------------
  // Schedule exceptions
  // ---------------------------------------------------------------------

  async listScheduleExceptions(
    organizationId: string,
    branchId: string,
    range: { from: string; to: string },
  ): Promise<BranchScheduleException[]> {
    assertValidDateRange(range);
    return this.prisma.branchScheduleException.findMany({
      where: {
        organizationId,
        branchId,
        date: { gte: new Date(range.from), lte: new Date(range.to) },
      },
      orderBy: { date: 'asc' },
    });
  }

  /** Create-or-replace, keyed on (branch, date) — only one exception can
   * apply to a given local date (docs task Phase 13: "Specific-date
   * exceptions override recurring business hours"). */
  async upsertScheduleException(
    actor: BranchScheduleActor,
    dto: CreateBranchScheduleExceptionDto,
  ): Promise<BranchScheduleException> {
    await assertBranchOwnedByOrganization(this.prisma, actor.organizationId, actor.branchId);

    const isSpecialHours = dto.type === BranchScheduleExceptionType.SPECIAL_HOURS;
    if (isSpecialHours) {
      if (!dto.intervals || dto.intervals.length === 0) {
        throw new BadRequestException('intervals is required when type is SPECIAL_HOURS');
      }
      assertNoOverlappingIntervals(dto.intervals);
    } else if (dto.intervals && dto.intervals.length > 0) {
      throw new BadRequestException('intervals is only accepted when type is SPECIAL_HOURS');
    }

    const date = new Date(dto.date);
    const existing = await this.prisma.branchScheduleException.findUnique({
      where: { branchId_date: { branchId: actor.branchId, date } },
    });

    const data = {
      type: dto.type,
      intervals: isSpecialHours
        ? dto.intervals!.map((interval) => ({
            startLocalTime: interval.startLocalTime,
            endLocalTime: interval.endLocalTime,
          }))
        : undefined,
      reason: dto.reason,
    };

    const exception = existing
      ? await this.prisma.branchScheduleException.update({ where: { id: existing.id }, data })
      : await this.prisma.branchScheduleException.create({
          data: {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            date,
            ...data,
          },
        });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: existing ? 'branch_schedule_exception.updated' : 'branch_schedule_exception.created',
      entityType: 'branch_schedule_exception',
      entityId: exception.id,
      requestId: actor.requestId,
      source: 'scheduling',
      newState: { date: dto.date, type: dto.type },
    });
    this.domainEvents.emit('AvailabilityChanged', {
      organizationId: actor.organizationId,
      entityType: 'branch_schedule_exception',
      entityId: exception.id,
      occurredAt: new Date(),
    });

    return exception;
  }

  async deleteScheduleException(actor: BranchScheduleActor, exceptionId: string): Promise<void> {
    const exception = await this.prisma.branchScheduleException.findFirst({
      where: { id: exceptionId, organizationId: actor.organizationId, branchId: actor.branchId },
    });
    if (!exception) {
      throw new NotFoundException('Branch schedule exception not found');
    }

    await this.prisma.branchScheduleException.delete({ where: { id: exceptionId } });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'branch_schedule_exception.deleted',
      entityType: 'branch_schedule_exception',
      entityId: exceptionId,
      requestId: actor.requestId,
      source: 'scheduling',
    });
    this.domainEvents.emit('AvailabilityChanged', {
      organizationId: actor.organizationId,
      entityType: 'branch_schedule_exception',
      entityId: exceptionId,
      occurredAt: new Date(),
    });
  }

  // ---------------------------------------------------------------------
  // Booking policy
  // ---------------------------------------------------------------------

  /** Always fully resolved — falls back to DEFAULT_BOOKING_POLICY
   * wholesale when no row exists yet, never a partial merge. */
  async getBookingPolicy(organizationId: string, branchId: string): Promise<ResolvedBookingPolicy> {
    const stored = await this.prisma.branchBookingPolicy.findFirst({
      where: { organizationId, branchId },
    });
    return stored ? toResolvedPolicy(stored) : DEFAULT_BOOKING_POLICY;
  }

  async upsertBookingPolicy(
    actor: BranchScheduleActor,
    dto: UpsertBookingPolicyDto,
  ): Promise<ResolvedBookingPolicy> {
    await assertBranchOwnedByOrganization(this.prisma, actor.organizationId, actor.branchId);

    const existing = await this.prisma.branchBookingPolicy.findFirst({
      where: { organizationId: actor.organizationId, branchId: actor.branchId },
    });
    const base = existing ? toResolvedPolicy(existing) : DEFAULT_BOOKING_POLICY;
    const merged: ResolvedBookingPolicy = {
      slotIntervalMinutes: dto.slotIntervalMinutes ?? base.slotIntervalMinutes,
      minBookingLeadTimeMinutes: dto.minBookingLeadTimeMinutes ?? base.minBookingLeadTimeMinutes,
      maxBookingHorizonDays: dto.maxBookingHorizonDays ?? base.maxBookingHorizonDays,
      bufferBeforeMinutes: dto.bufferBeforeMinutes ?? base.bufferBeforeMinutes,
      bufferAfterMinutes: dto.bufferAfterMinutes ?? base.bufferAfterMinutes,
      cancellationCutoffMinutes: dto.cancellationCutoffMinutes ?? base.cancellationCutoffMinutes,
      allowCustomerProviderSelection:
        dto.allowCustomerProviderSelection ?? base.allowCustomerProviderSelection,
      allowAnyProvider: dto.allowAnyProvider ?? base.allowAnyProvider,
    };

    const saved = existing
      ? await this.prisma.branchBookingPolicy.update({ where: { id: existing.id }, data: merged })
      : await this.prisma.branchBookingPolicy.create({
          data: {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            ...merged,
          },
        });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: existing ? 'branch_booking_policy.updated' : 'branch_booking_policy.created',
      entityType: 'branch_booking_policy',
      entityId: saved.id,
      requestId: actor.requestId,
      source: 'scheduling',
      newState: { ...merged },
    });
    this.domainEvents.emit('AvailabilityChanged', {
      organizationId: actor.organizationId,
      entityType: 'branch_booking_policy',
      entityId: saved.id,
      occurredAt: new Date(),
    });

    return merged;
  }
}

function toResolvedPolicy(policy: BranchBookingPolicy): ResolvedBookingPolicy {
  return {
    slotIntervalMinutes: policy.slotIntervalMinutes,
    minBookingLeadTimeMinutes: policy.minBookingLeadTimeMinutes,
    maxBookingHorizonDays: policy.maxBookingHorizonDays,
    bufferBeforeMinutes: policy.bufferBeforeMinutes,
    bufferAfterMinutes: policy.bufferAfterMinutes,
    cancellationCutoffMinutes: policy.cancellationCutoffMinutes,
    allowCustomerProviderSelection: policy.allowCustomerProviderSelection,
    allowAnyProvider: policy.allowAnyProvider,
  };
}

function assertValidDateRange(range: { from: string; to: string }): void {
  if (!isValidLocalDate(range.from) || !isValidLocalDate(range.to)) {
    throw new BadRequestException('from and to must be valid YYYY-MM-DD dates');
  }
  if (range.from > range.to) {
    throw new BadRequestException('from must not be after to');
  }
}
