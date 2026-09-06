import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  isExclusionConstraintViolation,
  isUniqueConstraintViolation,
} from '../../common/database/postgres-constraint-error.util.js';
import { DomainEventEmitter } from '../../common/events/domain-event-emitter.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  AppointmentSource,
  AppointmentStatus,
  SubscriptionAccessMode,
} from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { AvailabilityEngineService } from '../availability/availability-engine.service.js';
import { BranchScheduleService } from '../scheduling/branch-schedule.service.js';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service.js';
import { DiscoveryService } from '../discovery/discovery.service.js';
import { generateAppointmentReference } from './appointment-reference.util.js';
import type { AppointmentView } from './appointment-view.js';
import { APPOINTMENT_VIEW_INCLUDE, toAppointmentView } from './appointment-view.js';

const EXCLUSION_CONSTRAINT_NAME = 'appointments_no_staff_double_booking';
const REFERENCE_UNIQUE_CONSTRAINT = 'appointments_reference_key';
const IDEMPOTENCY_UNIQUE_CONSTRAINT = 'appointment_idempotency_keys';
const MAX_REFERENCE_ATTEMPTS = 3;

export interface CreateCustomerAppointmentInput {
  userId: string;
  businessSlug: string;
  branchId: string;
  serviceIds: string[];
  requestedStaffProfileId?: string;
  startAtIso: string;
  idempotencyKey: string;
  requestId: string;
}

export interface CreateStaffAppointmentInput {
  organizationId: string;
  branchId: string;
  serviceIds: string[];
  staffProfileId: string;
  startAtIso: string;
  customerProfileId?: string;
  newCustomer?: { name: string; phoneE164?: string; email?: string };
  idempotencyKey?: string;
  actorUserId: string;
  actorMembershipId: string;
  requestId: string;
}

type TransactionClient = Prisma.TransactionClient;

/**
 * Atomic appointment creation (docs task Phases 17-19). Two independent
 * safety mechanisms compose here, deliberately kept separate:
 *
 * - Idempotency (customer-scoped key + request fingerprint,
 *   `AppointmentIdempotencyKey`): protects against network retries and
 *   duplicate submissions of the *same* request.
 * - The database exclusion constraint
 *   (`appointments_no_staff_double_booking`): protects against two
 *   genuinely *different* requests reserving the same staff member's
 *   time. Every "any provider" candidate, and every plain retry, is its
 *   own complete database transaction — Postgres aborts a transaction
 *   entirely on the first constraint violation inside it, so trying a
 *   second candidate after a failure requires a fresh transaction, not a
 *   caught error inside the same one.
 */
@Injectable()
export class AppointmentBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityEngine: AvailabilityEngineService,
    private readonly branchSchedule: BranchScheduleService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
    private readonly discoveryService: DiscoveryService,
    private readonly auditService: AuditService,
    private readonly domainEvents: DomainEventEmitter,
  ) {}

  async createCustomerAppointment(input: CreateCustomerAppointmentInput): Promise<AppointmentView> {
    const { organizationId } = await this.discoveryService.resolveAccessibleOrganizationBySlug(
      input.businessSlug,
    );

    await this.assertSubscriptionAcceptsBookings(organizationId);

    const customerProfile = await this.prisma.customerProfile.upsert({
      where: { userId: input.userId },
      update: {},
      create: { userId: input.userId },
      include: { user: true },
    });

    const items = await this.availabilityEngine.resolveEffectiveServiceItems(
      organizationId,
      input.branchId,
      input.serviceIds,
    );
    if (items.some((item) => !item.isBookableByCustomer)) {
      throw new BadRequestException('One or more selected services are not available for customer booking');
    }

    const candidateProviderIds = await this.resolveCandidateProviders(
      organizationId,
      input.branchId,
      input.serviceIds,
      input.requestedStaffProfileId,
    );

    const customerRecord = await this.findOrCreateCustomerRecordForProfile(
      organizationId,
      customerProfile.id,
      customerProfile.user.displayName,
      customerProfile.user.emailNormalized,
      customerProfile.phoneE164,
    );

    return this.attemptCreation({
      organizationId,
      branchId: input.branchId,
      items,
      candidateProviderIds,
      startAt: new Date(input.startAtIso),
      source: AppointmentSource.CUSTOMER_APP,
      customerProfileId: customerProfile.id,
      customerRecordId: customerRecord.id,
      idempotencyOwnerCustomerProfileId: customerProfile.id,
      idempotencyKey: input.idempotencyKey,
      createdByUserId: input.userId,
      createdByMembershipId: undefined,
      requestId: input.requestId,
      auditActorUserId: input.userId,
      auditActorMembershipId: undefined,
    });
  }

  async createStaffAppointment(input: CreateStaffAppointmentInput): Promise<AppointmentView> {
    if (!input.customerProfileId === !input.newCustomer) {
      throw new BadRequestException(
        'Provide exactly one of customerProfileId or newCustomer',
      );
    }

    const items = await this.availabilityEngine.resolveEffectiveServiceItems(
      input.organizationId,
      input.branchId,
      input.serviceIds,
    );

    const candidateProviderIds = await this.resolveCandidateProviders(
      input.organizationId,
      input.branchId,
      input.serviceIds,
      input.staffProfileId,
    );
    if (candidateProviderIds.length === 0) {
      throw new BadRequestException('The selected staff member cannot perform this service at this branch');
    }

    let customerProfileId: string | null = null;
    let customerRecordId: string;
    if (input.customerProfileId) {
      const profile = await this.prisma.customerProfile.findUnique({
        where: { id: input.customerProfileId },
        include: { user: true },
      });
      if (!profile) {
        throw new BadRequestException('Customer profile not found');
      }
      customerProfileId = profile.id;
      const record = await this.findOrCreateCustomerRecordForProfile(
        input.organizationId,
        profile.id,
        profile.user.displayName,
        profile.user.emailNormalized,
        profile.phoneE164,
      );
      customerRecordId = record.id;
    } else {
      const record = await this.prisma.customerRecord.create({
        data: {
          organizationId: input.organizationId,
          name: input.newCustomer!.name,
          phoneE164: input.newCustomer!.phoneE164,
          emailNormalized: input.newCustomer!.email?.toLowerCase(),
        },
      });
      customerRecordId = record.id;
    }

    // Idempotency-key persistence requires a real customerProfileId (the
    // key table's dedup column is UUID-typed and scoped to a genuine
    // Kora customer) — a walk-in with no Kora account simply does not
    // get a persisted idempotency guarantee, only the reference-
    // uniqueness and exclusion-constraint safety nets every booking gets
    // regardless.
    const idempotencyKey = customerProfileId ? input.idempotencyKey : undefined;

    return this.attemptCreation({
      organizationId: input.organizationId,
      branchId: input.branchId,
      items,
      candidateProviderIds,
      startAt: new Date(input.startAtIso),
      source: AppointmentSource.BUSINESS_STAFF,
      customerProfileId,
      customerRecordId,
      idempotencyOwnerCustomerProfileId: customerProfileId ?? undefined,
      idempotencyKey,
      createdByUserId: input.actorUserId,
      createdByMembershipId: input.actorMembershipId,
      requestId: input.requestId,
      auditActorUserId: input.actorUserId,
      auditActorMembershipId: input.actorMembershipId,
    });
  }

  // -------------------------------------------------------------------
  // Shared creation core
  // -------------------------------------------------------------------

  private async attemptCreation(params: {
    organizationId: string;
    branchId: string;
    items: Array<{ serviceId: string; name: string; durationMinutes: number; priceMinor: number; currency: string }>;
    candidateProviderIds: string[];
    startAt: Date;
    source: AppointmentSource;
    customerProfileId: string | null;
    customerRecordId: string;
    idempotencyOwnerCustomerProfileId: string | undefined;
    idempotencyKey?: string;
    createdByUserId: string | undefined;
    createdByMembershipId: string | undefined;
    requestId: string;
    auditActorUserId: string | undefined;
    auditActorMembershipId: string | undefined;
  }): Promise<AppointmentView> {
    if (params.candidateProviderIds.length === 0) {
      throw new BadRequestException('No eligible provider is available for this service');
    }

    const branch = await this.prisma.branch.findFirstOrThrow({
      where: { id: params.branchId, organizationId: params.organizationId },
    });
    const policy = await this.branchSchedule.getBookingPolicy(params.organizationId, params.branchId);

    const now = new Date();
    if (params.startAt.getTime() < now.getTime() + policy.minBookingLeadTimeMinutes * 60_000) {
      throw new BadRequestException('The requested time is before the minimum booking lead time');
    }
    const maxHorizon = new Date(now.getTime() + policy.maxBookingHorizonDays * 24 * 60 * 60 * 1000);
    if (params.startAt.getTime() > maxHorizon.getTime()) {
      throw new BadRequestException('The requested time is beyond the maximum booking horizon');
    }

    const durationOverrides = await this.loadDurationOverrides(
      params.organizationId,
      params.branchId,
      params.items.map((item) => item.serviceId),
      params.candidateProviderIds,
    );

    const idempotencyKey =
      params.idempotencyKey && params.idempotencyOwnerCustomerProfileId
        ? params.idempotencyKey
        : undefined;
    const requestFingerprint = idempotencyKey
      ? computeRequestFingerprint({
          organizationId: params.organizationId,
          branchId: params.branchId,
          serviceIds: params.items.map((item) => item.serviceId),
          startAtIso: params.startAt.toISOString(),
        })
      : undefined;

    // Checked up front, not only reactively inside the per-provider
    // transaction below: a genuine retry of an already-completed booking
    // requests the *same* staff member's *same* now-occupied time slot,
    // which the exclusion constraint would otherwise reject as
    // SLOT_UNAVAILABLE before the idempotency-key insert is ever
    // reached, masking the replay. The reactive P2002 catch inside
    // attemptSingleProviderTransaction remains as the safety net for a
    // true concurrent race — two requests bearing the same key arriving
    // close enough together that neither sees the other's row yet here.
    if (idempotencyKey && requestFingerprint && params.idempotencyOwnerCustomerProfileId) {
      const existingKey = await this.prisma.appointmentIdempotencyKey.findUnique({
        where: {
          customerProfileId_idempotencyKey: {
            customerProfileId: params.idempotencyOwnerCustomerProfileId,
            idempotencyKey,
          },
        },
      });
      if (existingKey) {
        if (existingKey.requestFingerprint !== requestFingerprint) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This idempotency key was already used for a different request.',
          });
        }
        const existingAppointment = await this.prisma.appointment.findUnique({
          where: { id: existingKey.appointmentId },
          include: APPOINTMENT_VIEW_INCLUDE,
        });
        if (existingAppointment) {
          return toAppointmentView(existingAppointment);
        }
      }
    }

    for (const staffProfileId of params.candidateProviderIds) {
      const overridesForStaff = durationOverrides.get(staffProfileId);
      const resolvedItems = params.items.map((item) => ({
        ...item,
        durationMinutes: overridesForStaff?.get(item.serviceId) ?? item.durationMinutes,
      }));
      const totalDurationMinutes = resolvedItems.reduce((sum, item) => sum + item.durationMinutes, 0);
      const endAt = new Date(params.startAt.getTime() + totalDurationMinutes * 60_000);
      const occupiedStartAt = new Date(params.startAt.getTime() - policy.bufferBeforeMinutes * 60_000);
      const occupiedEndAt = new Date(endAt.getTime() + policy.bufferAfterMinutes * 60_000);
      const currency = resolvedItems[0].currency;
      const totalPriceMinor = resolvedItems.reduce((sum, item) => sum + item.priceMinor, 0);

      const attempt = await this.attemptSingleProviderTransaction({
        organizationId: params.organizationId,
        branchId: params.branchId,
        branchTimeZone: branch.timeZone,
        staffProfileId,
        startAt: params.startAt,
        endAt,
        occupiedStartAt,
        occupiedEndAt,
        source: params.source,
        currency,
        totalPriceMinor,
        resolvedItems,
        customerProfileId: params.customerProfileId,
        customerRecordId: params.customerRecordId,
        idempotencyOwnerCustomerProfileId: params.idempotencyOwnerCustomerProfileId,
        idempotencyKey,
        requestFingerprint,
        createdByUserId: params.createdByUserId,
        createdByMembershipId: params.createdByMembershipId,
      });

      if (attempt.outcome === 'created') {
        await this.auditService.record({
          organizationId: params.organizationId,
          branchId: params.branchId,
          actorUserId: params.auditActorUserId,
          actorMembershipId: params.auditActorMembershipId,
          action: 'appointment.created',
          entityType: 'appointment',
          entityId: attempt.appointment.id,
          requestId: params.requestId,
          source: 'appointments',
          newState: { status: AppointmentStatus.CONFIRMED, startAt: params.startAt.toISOString() },
        });
        this.domainEvents.emit('AppointmentCreated', {
          organizationId: params.organizationId,
          entityType: 'appointment',
          entityId: attempt.appointment.id,
          occurredAt: attempt.appointment.createdAt,
        });
        return toAppointmentView(attempt.appointment);
      }

      if (attempt.outcome === 'idempotent_replay') {
        if (attempt.existingFingerprint !== requestFingerprint) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This idempotency key was already used for a different request.',
          });
        }
        const existing = await this.prisma.appointment.findUnique({
          where: { id: attempt.appointmentId },
          include: APPOINTMENT_VIEW_INCLUDE,
        });
        if (!existing) {
          throw new ServiceUnavailableException({
            code: 'BOOKING_UNAVAILABLE',
            message: 'Unable to complete this booking right now.',
          });
        }
        return toAppointmentView(existing);
      }
      // 'slot_unavailable' — try the next candidate provider.
    }

    throw new ConflictException({
      code: 'SLOT_UNAVAILABLE',
      message: 'This time is no longer available. Please choose another slot.',
    });
  }

  private async attemptSingleProviderTransaction(params: {
    organizationId: string;
    branchId: string;
    branchTimeZone: string;
    staffProfileId: string;
    startAt: Date;
    endAt: Date;
    occupiedStartAt: Date;
    occupiedEndAt: Date;
    source: AppointmentSource;
    currency: string;
    totalPriceMinor: number;
    resolvedItems: Array<{ serviceId: string; name: string; durationMinutes: number; priceMinor: number; currency: string }>;
    customerProfileId: string | null;
    customerRecordId: string;
    idempotencyOwnerCustomerProfileId: string | undefined;
    idempotencyKey: string | undefined;
    requestFingerprint: string | undefined;
    createdByUserId: string | undefined;
    createdByMembershipId: string | undefined;
  }): Promise<
    | { outcome: 'created'; appointment: Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_VIEW_INCLUDE }> }
    | { outcome: 'slot_unavailable' }
    | { outcome: 'idempotent_replay'; appointmentId: string; existingFingerprint: string }
  > {
    for (let referenceAttempt = 0; referenceAttempt < MAX_REFERENCE_ATTEMPTS; referenceAttempt += 1) {
      const reference = generateAppointmentReference();
      try {
        const appointment = await this.prisma.$transaction(async (tx: TransactionClient) => {
          const created = await tx.appointment.create({
            data: {
              organizationId: params.organizationId,
              branchId: params.branchId,
              reference,
              customerProfileId: params.customerProfileId,
              customerRecordId: params.customerRecordId,
              assignedStaffProfileId: params.staffProfileId,
              startAt: params.startAt,
              endAt: params.endAt,
              occupiedStartAt: params.occupiedStartAt,
              occupiedEndAt: params.occupiedEndAt,
              branchTimeZone: params.branchTimeZone,
              status: AppointmentStatus.CONFIRMED,
              source: params.source,
              currency: params.currency,
              totalPriceMinor: params.totalPriceMinor,
              idempotencyKey: params.idempotencyKey,
              createdByUserId: params.createdByUserId,
              createdByMembershipId: params.createdByMembershipId,
              items: {
                create: params.resolvedItems.map((item, index) => ({
                  organizationId: params.organizationId,
                  serviceId: item.serviceId,
                  serviceNameSnapshot: item.name,
                  durationMinutesSnapshot: item.durationMinutes,
                  priceMinorSnapshot: item.priceMinor,
                  currencySnapshot: item.currency,
                  displayOrder: index,
                })),
              },
              statusHistory: {
                create: {
                  organizationId: params.organizationId,
                  previousStatus: null,
                  newStatus: AppointmentStatus.CONFIRMED,
                  actorUserId: params.createdByUserId,
                  actorMembershipId: params.createdByMembershipId,
                },
              },
            },
            include: APPOINTMENT_VIEW_INCLUDE,
          });

          if (params.idempotencyKey && params.requestFingerprint && params.idempotencyOwnerCustomerProfileId) {
            await tx.appointmentIdempotencyKey.create({
              data: {
                organizationId: params.organizationId,
                customerProfileId: params.idempotencyOwnerCustomerProfileId,
                idempotencyKey: params.idempotencyKey,
                requestFingerprint: params.requestFingerprint,
                appointmentId: created.id,
              },
            });
          }

          return created;
        });

        return { outcome: 'created', appointment };
      } catch (error) {
        if (isUniqueConstraintViolation(error, REFERENCE_UNIQUE_CONSTRAINT)) {
          continue;
        }
        if (isExclusionConstraintViolation(error, EXCLUSION_CONSTRAINT_NAME)) {
          return { outcome: 'slot_unavailable' };
        }
        if (
          isUniqueConstraintViolation(error, IDEMPOTENCY_UNIQUE_CONSTRAINT) &&
          params.idempotencyKey &&
          params.idempotencyOwnerCustomerProfileId
        ) {
          const existing = await this.prisma.appointmentIdempotencyKey.findUnique({
            where: {
              customerProfileId_idempotencyKey: {
                customerProfileId: params.idempotencyOwnerCustomerProfileId,
                idempotencyKey: params.idempotencyKey,
              },
            },
          });
          if (!existing) {
            throw error;
          }
          return {
            outcome: 'idempotent_replay',
            appointmentId: existing.appointmentId,
            existingFingerprint: existing.requestFingerprint,
          };
        }
        throw error;
      }
    }
    throw new ServiceUnavailableException({
      code: 'BOOKING_UNAVAILABLE',
      message: 'Unable to complete this booking right now.',
    });
  }

  private async resolveCandidateProviders(
    organizationId: string,
    branchId: string,
    serviceIds: string[],
    requestedStaffProfileId: string | undefined,
  ): Promise<string[]> {
    const eligible = await this.availabilityEngine.resolveEligibleProviders(
      organizationId,
      branchId,
      serviceIds,
      requestedStaffProfileId,
    );
    // Deterministic order (docs task Phase 19: "select one eligible
    // available provider deterministically") — each is then attempted in
    // its own transaction, relying on the exclusion constraint as the
    // actual atomic reservation.
    return [...eligible].sort();
  }

  private async loadDurationOverrides(
    organizationId: string,
    branchId: string,
    serviceIds: string[],
    staffProfileIds: string[],
  ): Promise<Map<string, Map<string, number>>> {
    const assignments = await this.prisma.staffServiceAssignment.findMany({
      where: {
        organizationId,
        branchId,
        serviceId: { in: serviceIds },
        staffProfileId: { in: staffProfileIds },
        durationOverrideMinutes: { not: null },
      },
    });
    const byStaff = new Map<string, Map<string, number>>();
    for (const assignment of assignments) {
      const forStaff = byStaff.get(assignment.staffProfileId) ?? new Map<string, number>();
      forStaff.set(assignment.serviceId, assignment.durationOverrideMinutes!);
      byStaff.set(assignment.staffProfileId, forStaff);
    }
    return byStaff;
  }

  private async findOrCreateCustomerRecordForProfile(
    organizationId: string,
    customerProfileId: string,
    name: string,
    email: string | null,
    phone: string | null,
  ) {
    const existing = await this.prisma.customerRecord.findFirst({
      where: { organizationId, customerProfileId },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.customerRecord.create({
      data: {
        organizationId,
        customerProfileId,
        name,
        emailNormalized: email,
        phoneE164: phone,
      },
    });
  }

  private async assertSubscriptionAcceptsBookings(organizationId: string): Promise<void> {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    const accessMode = subscription
      ? this.subscriptionAccessService.resolveAccessMode(subscription.status)
      : SubscriptionAccessMode.BLOCKED;
    if (
      accessMode === SubscriptionAccessMode.BLOCKED ||
      accessMode === SubscriptionAccessMode.READ_ONLY
    ) {
      throw new ConflictException({
        code: 'SUBSCRIPTION_UNAVAILABLE',
        message: 'This business is not currently accepting new bookings.',
      });
    }
  }
}

function computeRequestFingerprint(payload: {
  organizationId: string;
  branchId: string;
  serviceIds: string[];
  startAtIso: string;
}): string {
  const canonical = JSON.stringify({
    organizationId: payload.organizationId,
    branchId: payload.branchId,
    serviceIds: payload.serviceIds,
    startAtIso: payload.startAtIso,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
