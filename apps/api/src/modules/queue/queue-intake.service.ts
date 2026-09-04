import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import { utcToLocalDate } from '../../common/scheduling/local-time.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  AppointmentStatus,
  QueueEntryPriority,
  QueueEntrySource,
  QueueEntryStatus,
} from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { AvailabilityEngineService } from '../availability/availability-engine.service.js';
import type { CreateWalkInDto } from './dto/create-walk-in.dto.js';
import { queueEntryViewInclude, toQueueEntryView, type QueueEntryView } from './queue-entry-view.js';
import { allocateQueueTicket, resolveCurrentBusinessDate } from './queue-ticket.util.js';

const IDEMPOTENCY_UNIQUE_CONSTRAINT = 'queue_intake_idempotency_keys';
const APPOINTMENT_UNIQUE_CONSTRAINT = 'queue_entries_appointment_id_key';

export interface QueueIntakeActor {
  organizationId: string;
  actorUserId: string;
  actorMembershipId: string;
  requestId: string;
}

/**
 * The two customer-intake paths into the live branch queue (docs task
 * Phase 2). Both share the same idempotency shape as
 * AppointmentBookingService: a pre-check against the persisted key
 * (short-circuiting a genuine retry before any write is attempted) plus
 * a reactive unique-constraint catch as the safety net for a true
 * concurrent race — see that service's own header comment for why both
 * layers are needed.
 */
@Injectable()
export class QueueIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityEngine: AvailabilityEngineService,
    private readonly auditService: AuditService,
  ) {}

  async createWalkIn(
    actor: QueueIntakeActor,
    branchId: string,
    dto: CreateWalkInDto,
    idempotencyKey: string | undefined,
  ): Promise<QueueEntryView> {
    if (!dto.customerRecordId === !dto.newCustomer) {
      throw new BadRequestException('Provide exactly one of customerRecordId or newCustomer');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId: actor.organizationId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Validates every requested service belongs to the organization, is
    // active, and is enabled at this branch (docs task Phase 2) — the
    // returned price/duration data is intentionally unused here;
    // QueueEntryService is deliberately unpriced (see the schema header).
    await this.availabilityEngine.resolveEffectiveServiceItems(actor.organizationId, branchId, dto.serviceIds);

    const requestFingerprint = idempotencyKey
      ? computeWalkInFingerprint(actor.organizationId, branchId, dto)
      : undefined;

    if (idempotencyKey && requestFingerprint) {
      const replay = await this.checkIdempotentReplay(actor.actorMembershipId, idempotencyKey, requestFingerprint);
      if (replay) {
        return replay;
      }
    }

    const businessDate = resolveCurrentBusinessDate(branch.timeZone);

    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        const customerRecordId = dto.customerRecordId
          ? await assertCustomerRecordOwned(tx, actor.organizationId, dto.customerRecordId)
          : (
              await tx.customerRecord.create({
                data: {
                  organizationId: actor.organizationId,
                  name: dto.newCustomer!.name,
                  phoneE164: dto.newCustomer!.phoneE164,
                  emailNormalized: dto.newCustomer!.email?.toLowerCase(),
                },
              })
            ).id;

        const { branchQueueDayId, ticketNumber } = await allocateQueueTicket(
          tx,
          actor.organizationId,
          branchId,
          businessDate,
        );

        const created = await tx.queueEntry.create({
          data: {
            organizationId: actor.organizationId,
            branchId,
            branchQueueDayId,
            businessDate: new Date(businessDate),
            ticketNumber,
            source: QueueEntrySource.WALK_IN,
            customerRecordId,
            priority: dto.priority ?? QueueEntryPriority.NORMAL,
            notes: dto.notes,
            createdByMembershipId: actor.actorMembershipId,
            services: {
              create: dto.serviceIds.map((serviceId, index) => ({
                organizationId: actor.organizationId,
                serviceId,
                displayOrder: index,
              })),
            },
            statusHistory: {
              create: {
                organizationId: actor.organizationId,
                previousStatus: null,
                newStatus: QueueEntryStatus.WAITING,
                actorUserId: actor.actorUserId,
                actorMembershipId: actor.actorMembershipId,
              },
            },
          },
          include: queueEntryViewInclude,
        });

        if (idempotencyKey && requestFingerprint) {
          await tx.queueIntakeIdempotencyKey.create({
            data: {
              organizationId: actor.organizationId,
              membershipId: actor.actorMembershipId,
              idempotencyKey,
              requestFingerprint,
              queueEntryId: created.id,
            },
          });
        }

        return created;
      });

      await this.auditService.record({
        organizationId: actor.organizationId,
        branchId,
        actorUserId: actor.actorUserId,
        actorMembershipId: actor.actorMembershipId,
        action: 'queue.walk_in.created',
        entityType: 'queue_entry',
        entityId: entry.id,
        requestId: actor.requestId,
        source: 'queue',
        newState: { status: QueueEntryStatus.WAITING, ticketNumber: entry.ticketNumber },
      });

      return toQueueEntryView(entry);
    } catch (error) {
      if (idempotencyKey && requestFingerprint && isUniqueConstraintViolation(error, IDEMPOTENCY_UNIQUE_CONSTRAINT)) {
        const replay = await this.checkIdempotentReplay(actor.actorMembershipId, idempotencyKey, requestFingerprint);
        if (replay) {
          return replay;
        }
      }
      throw error;
    }
  }

  async checkInAppointment(
    tenant: TenantContext,
    actor: QueueIntakeActor,
    appointmentId: string,
    idempotencyKey: string | undefined,
  ): Promise<QueueEntryView> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId: actor.organizationId },
      include: { items: true },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    assertMembershipHasBranchAccess(tenant, appointment.branchId);
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ConflictException({
        code: 'APPOINTMENT_NOT_CHECKINABLE',
        message: 'Only a confirmed appointment can be checked in.',
      });
    }

    const branch = await this.prisma.branch.findFirstOrThrow({
      where: { id: appointment.branchId, organizationId: actor.organizationId },
    });
    const businessDate = resolveCurrentBusinessDate(branch.timeZone);
    const appointmentLocalDate = utcToLocalDate(appointment.startAt, branch.timeZone);
    if (appointmentLocalDate !== businessDate) {
      throw new BadRequestException(
        'This appointment can only be checked in on its own branch-local calendar date.',
      );
    }

    const requestFingerprint = idempotencyKey
      ? computeCheckInFingerprint(actor.organizationId, appointmentId)
      : undefined;

    if (idempotencyKey && requestFingerprint) {
      const replay = await this.checkIdempotentReplay(actor.actorMembershipId, idempotencyKey, requestFingerprint);
      if (replay) {
        return replay;
      }
    }

    const existingQueueEntry = await this.prisma.queueEntry.findUnique({ where: { appointmentId } });
    if (existingQueueEntry) {
      throw new ConflictException({
        code: 'ALREADY_CHECKED_IN',
        message: 'This appointment has already been checked in.',
      });
    }

    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        const { branchQueueDayId, ticketNumber } = await allocateQueueTicket(
          tx,
          actor.organizationId,
          appointment.branchId,
          businessDate,
        );

        const created = await tx.queueEntry.create({
          data: {
            organizationId: actor.organizationId,
            branchId: appointment.branchId,
            branchQueueDayId,
            businessDate: new Date(businessDate),
            ticketNumber,
            source: QueueEntrySource.APPOINTMENT,
            appointmentId: appointment.id,
            customerRecordId: appointment.customerRecordId,
            assignedStaffProfileId: appointment.assignedStaffProfileId,
            createdByMembershipId: actor.actorMembershipId,
            services: {
              create: appointment.items.map((item) => ({
                organizationId: actor.organizationId,
                serviceId: item.serviceId,
                displayOrder: item.displayOrder,
              })),
            },
            statusHistory: {
              create: {
                organizationId: actor.organizationId,
                previousStatus: null,
                newStatus: QueueEntryStatus.WAITING,
                actorUserId: actor.actorUserId,
                actorMembershipId: actor.actorMembershipId,
              },
            },
          },
          include: queueEntryViewInclude,
        });

        if (idempotencyKey && requestFingerprint) {
          await tx.queueIntakeIdempotencyKey.create({
            data: {
              organizationId: actor.organizationId,
              membershipId: actor.actorMembershipId,
              idempotencyKey,
              requestFingerprint,
              queueEntryId: created.id,
            },
          });
        }

        return created;
      });

      await this.auditService.record({
        organizationId: actor.organizationId,
        branchId: appointment.branchId,
        actorUserId: actor.actorUserId,
        actorMembershipId: actor.actorMembershipId,
        action: 'queue.appointment.checked_in',
        entityType: 'queue_entry',
        entityId: entry.id,
        requestId: actor.requestId,
        source: 'queue',
        newState: { status: QueueEntryStatus.WAITING, ticketNumber: entry.ticketNumber, appointmentId },
      });

      return toQueueEntryView(entry);
    } catch (error) {
      if (isUniqueConstraintViolation(error, APPOINTMENT_UNIQUE_CONSTRAINT)) {
        throw new ConflictException({
          code: 'ALREADY_CHECKED_IN',
          message: 'This appointment has already been checked in.',
        });
      }
      if (idempotencyKey && requestFingerprint && isUniqueConstraintViolation(error, IDEMPOTENCY_UNIQUE_CONSTRAINT)) {
        const replay = await this.checkIdempotentReplay(actor.actorMembershipId, idempotencyKey, requestFingerprint);
        if (replay) {
          return replay;
        }
      }
      throw error;
    }
  }

  private async checkIdempotentReplay(
    membershipId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<QueueEntryView | null> {
    const existingKey = await this.prisma.queueIntakeIdempotencyKey.findUnique({
      where: { membershipId_idempotencyKey: { membershipId, idempotencyKey } },
    });
    if (!existingKey) {
      return null;
    }
    if (existingKey.requestFingerprint !== requestFingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'This idempotency key was already used for a different request.',
      });
    }
    const existingEntry = await this.prisma.queueEntry.findUnique({
      where: { id: existingKey.queueEntryId },
      include: queueEntryViewInclude,
    });
    return existingEntry ? toQueueEntryView(existingEntry) : null;
  }
}

async function assertCustomerRecordOwned(
  client: Pick<PrismaService, 'customerRecord'>,
  organizationId: string,
  customerRecordId: string,
): Promise<string> {
  const record = await client.customerRecord.findFirst({
    where: { id: customerRecordId, organizationId },
  });
  if (!record) {
    throw new BadRequestException('Customer record not found in this organization');
  }
  return record.id;
}

function computeWalkInFingerprint(organizationId: string, branchId: string, dto: CreateWalkInDto): string {
  const canonical = JSON.stringify({
    organizationId,
    branchId,
    customerRecordId: dto.customerRecordId ?? null,
    newCustomer: dto.newCustomer ?? null,
    serviceIds: dto.serviceIds,
    priority: dto.priority ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function computeCheckInFingerprint(organizationId: string, appointmentId: string): string {
  const canonical = JSON.stringify({ organizationId, appointmentId });
  return createHash('sha256').update(canonical).digest('hex');
}
