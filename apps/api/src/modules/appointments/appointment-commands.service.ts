import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isExclusionConstraintViolation,
} from '../../common/database/postgres-constraint-error.util.js';
import { DomainEventEmitter } from '../../common/events/domain-event-emitter.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AppointmentStatus } from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { AvailabilityEngineService } from '../availability/availability-engine.service.js';
import { BranchScheduleService } from '../scheduling/branch-schedule.service.js';
import { APPOINTMENT_VIEW_INCLUDE, toAppointmentView, type AppointmentView } from './appointment-view.js';

const EXCLUSION_CONSTRAINT_NAME = 'appointments_no_staff_double_booking';

export interface AppointmentActor {
  /** Customer cancelling/rescheduling their own appointment. */
  customerUserId?: string;
  customerProfileId?: string;
  /** Staff member acting within their organization — `branchId` is the
   * route's own branch scope (already proven by TenantAccessGuard); it
   * is re-checked against the appointment's actual branch so a staff
   * member scoped to one branch cannot reach an appointment that
   * actually belongs to a different one just by knowing its id. */
  organizationId?: string;
  branchId?: string;
  actorUserId?: string;
  actorMembershipId?: string;
  requestId: string;
}

@Injectable()
export class AppointmentCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityEngine: AvailabilityEngineService,
    private readonly branchSchedule: BranchScheduleService,
    private readonly auditService: AuditService,
    private readonly domainEvents: DomainEventEmitter,
  ) {}

  async cancel(
    appointmentId: string,
    actor: AppointmentActor,
    reason: string | undefined,
  ): Promise<AppointmentView> {
    const appointment = await this.loadOwnedAppointment(appointmentId, actor);
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ConflictException('Only a confirmed appointment can be cancelled');
    }
    if (actor.customerProfileId) {
      await this.assertWithinCustomerCutoff(appointment);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.appointment.updateMany({
        where: { id: appointmentId, status: AppointmentStatus.CONFIRMED },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledReason: reason,
          cancelledByMembershipId: actor.actorMembershipId,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('This appointment was already updated by someone else');
      }
      await tx.appointmentStatusHistory.create({
        data: {
          organizationId: appointment.organizationId,
          appointmentId,
          previousStatus: AppointmentStatus.CONFIRMED,
          newStatus: AppointmentStatus.CANCELLED,
          actorUserId: actor.actorUserId ?? actor.customerUserId,
          actorMembershipId: actor.actorMembershipId,
          reason,
        },
      });
      return tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: APPOINTMENT_VIEW_INCLUDE });
    });

    await this.auditService.record({
      organizationId: appointment.organizationId,
      branchId: appointment.branchId,
      actorUserId: actor.actorUserId ?? actor.customerUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'appointment.cancelled',
      entityType: 'appointment',
      entityId: appointmentId,
      requestId: actor.requestId,
      source: 'appointments',
      previousState: { status: AppointmentStatus.CONFIRMED },
      newState: { status: AppointmentStatus.CANCELLED, reason: reason ?? null },
    });
    this.domainEvents.emit('AppointmentCancelled', {
      organizationId: appointment.organizationId,
      entityType: 'appointment',
      entityId: appointmentId,
      occurredAt: new Date(),
    });

    return toAppointmentView(updated);
  }

  /** Organization-only: staff cannot be double-booked into no-shows —
   * this is deliberately not reachable from the customer-facing
   * controller. */
  async markNoShow(appointmentId: string, actor: AppointmentActor): Promise<AppointmentView> {
    const appointment = await this.loadOwnedAppointment(appointmentId, actor);
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ConflictException('Only a confirmed appointment can be marked no-show');
    }
    if (appointment.startAt.getTime() > Date.now()) {
      throw new BadRequestException('Cannot mark a future appointment as no-show');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.appointment.updateMany({
        where: { id: appointmentId, status: AppointmentStatus.CONFIRMED },
        data: {
          status: AppointmentStatus.NO_SHOW,
          noShowMarkedAt: new Date(),
          noShowMarkedByMembershipId: actor.actorMembershipId,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('This appointment was already updated by someone else');
      }
      await tx.appointmentStatusHistory.create({
        data: {
          organizationId: appointment.organizationId,
          appointmentId,
          previousStatus: AppointmentStatus.CONFIRMED,
          newStatus: AppointmentStatus.NO_SHOW,
          actorUserId: actor.actorUserId,
          actorMembershipId: actor.actorMembershipId,
        },
      });
      return tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: APPOINTMENT_VIEW_INCLUDE });
    });

    await this.auditService.record({
      organizationId: appointment.organizationId,
      branchId: appointment.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'appointment.no_show_marked',
      entityType: 'appointment',
      entityId: appointmentId,
      requestId: actor.requestId,
      source: 'appointments',
      previousState: { status: AppointmentStatus.CONFIRMED },
      newState: { status: AppointmentStatus.NO_SHOW },
    });
    this.domainEvents.emit('AppointmentNoShowMarked', {
      organizationId: appointment.organizationId,
      entityType: 'appointment',
      entityId: appointmentId,
      occurredAt: new Date(),
    });

    return toAppointmentView(updated);
  }

  /**
   * Atomic (docs task Phase 18: "Rescheduling must be atomic. If a
   * requested new time fails, the original appointment must remain
   * unchanged"): the UPDATE that moves the appointment's occupied window
   * runs inside the same transaction as the exclusion-constraint check
   * it might violate, so a conflict rolls the whole attempt back and
   * leaves the original row exactly as it was — there is no separate
   * "revalidate, then write" step that a stale read could invalidate
   * between.
   */
  async reschedule(
    appointmentId: string,
    actor: AppointmentActor,
    newStartAtIso: string,
    newStaffProfileId: string | undefined,
  ): Promise<AppointmentView> {
    const appointment = await this.loadOwnedAppointment(appointmentId, actor);
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ConflictException('Only a confirmed appointment can be rescheduled');
    }
    if (actor.customerProfileId) {
      await this.assertWithinCustomerCutoff(appointment);
    }

    const newStartAt = new Date(newStartAtIso);
    const policy = await this.branchSchedule.getBookingPolicy(appointment.organizationId, appointment.branchId);
    const now = new Date();
    if (newStartAt.getTime() < now.getTime() + policy.minBookingLeadTimeMinutes * 60_000) {
      throw new BadRequestException('The requested time is before the minimum booking lead time');
    }
    const maxHorizon = new Date(now.getTime() + policy.maxBookingHorizonDays * 24 * 60 * 60 * 1000);
    if (newStartAt.getTime() > maxHorizon.getTime()) {
      throw new BadRequestException('The requested time is beyond the maximum booking horizon');
    }

    const assignedStaffProfileId = newStaffProfileId ?? appointment.assignedStaffProfileId;
    if (newStaffProfileId && newStaffProfileId !== appointment.assignedStaffProfileId) {
      const serviceIds = appointment.items.map((item) => item.serviceId);
      const eligible = await this.availabilityEngine.resolveEligibleProviders(
        appointment.organizationId,
        appointment.branchId,
        serviceIds,
        newStaffProfileId,
      );
      if (eligible.length === 0) {
        throw new BadRequestException('The selected staff member cannot perform this appointment');
      }
    }

    // Duration is preserved from the original booking's snapshots — a
    // reschedule moves the same booked services to a new time/provider,
    // it does not re-price or re-duration them against the current
    // catalogue (docs task: "Appointment history uses snapshots").
    const totalDurationMinutes = appointment.items.reduce(
      (sum, item) => sum + item.durationMinutesSnapshot,
      0,
    );
    const newEndAt = new Date(newStartAt.getTime() + totalDurationMinutes * 60_000);
    const newOccupiedStartAt = new Date(newStartAt.getTime() - policy.bufferBeforeMinutes * 60_000);
    const newOccupiedEndAt = new Date(newEndAt.getTime() + policy.bufferAfterMinutes * 60_000);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.appointment.updateMany({
          where: { id: appointmentId, status: AppointmentStatus.CONFIRMED, version: appointment.version },
          data: {
            startAt: newStartAt,
            endAt: newEndAt,
            occupiedStartAt: newOccupiedStartAt,
            occupiedEndAt: newOccupiedEndAt,
            assignedStaffProfileId,
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          throw new ConflictException('This appointment was already updated by someone else');
        }
        return tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: APPOINTMENT_VIEW_INCLUDE });
      });

      await this.auditService.record({
        organizationId: appointment.organizationId,
        branchId: appointment.branchId,
        actorUserId: actor.actorUserId ?? actor.customerUserId,
        actorMembershipId: actor.actorMembershipId,
        action: 'appointment.rescheduled',
        entityType: 'appointment',
        entityId: appointmentId,
        requestId: actor.requestId,
        source: 'appointments',
        previousState: { startAt: appointment.startAt.toISOString(), assignedStaffProfileId: appointment.assignedStaffProfileId },
        newState: { startAt: newStartAt.toISOString(), assignedStaffProfileId },
      });
      this.domainEvents.emit('AppointmentRescheduled', {
        organizationId: appointment.organizationId,
        entityType: 'appointment',
        entityId: appointmentId,
        occurredAt: new Date(),
      });

      return toAppointmentView(updated);
    } catch (error) {
      if (isExclusionConstraintViolation(error, EXCLUSION_CONSTRAINT_NAME)) {
        await this.auditService.record({
          organizationId: appointment.organizationId,
          branchId: appointment.branchId,
          actorUserId: actor.actorUserId ?? actor.customerUserId,
          actorMembershipId: actor.actorMembershipId,
          action: 'appointment.reschedule_conflict',
          entityType: 'appointment',
          entityId: appointmentId,
          requestId: actor.requestId,
          source: 'appointments',
        });
        throw new ConflictException({
          code: 'SLOT_UNAVAILABLE',
          message: 'This time is no longer available. Please choose another slot.',
        });
      }
      throw error;
    }
  }

  private async loadOwnedAppointment(
    appointmentId: string,
    actor: AppointmentActor,
  ): Promise<Prisma.AppointmentGetPayload<{ include: { items: true } }>> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { items: true },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    if (actor.organizationId && appointment.organizationId !== actor.organizationId) {
      throw new NotFoundException('Appointment not found');
    }
    if (actor.branchId && appointment.branchId !== actor.branchId) {
      throw new NotFoundException('Appointment not found');
    }
    if (actor.customerProfileId && appointment.customerProfileId !== actor.customerProfileId) {
      // A different customer's appointment: 404, not 403, so its
      // existence is never confirmed to a caller who does not own it.
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  private async assertWithinCustomerCutoff(
    appointment: { organizationId: string; branchId: string; startAt: Date },
  ): Promise<void> {
    const policy = await this.branchSchedule.getBookingPolicy(appointment.organizationId, appointment.branchId);
    const cutoffMs = policy.cancellationCutoffMinutes * 60_000;
    if (appointment.startAt.getTime() - Date.now() < cutoffMs) {
      throw new ForbiddenException('This appointment is past its cancellation/reschedule cutoff');
    }
  }
}
