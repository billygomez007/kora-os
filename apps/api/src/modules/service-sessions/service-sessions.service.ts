import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  QueueEntryStatus,
  ServiceSessionCancelDisposition,
  ServiceSessionStatus,
} from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { AvailabilityEngineService } from '../availability/availability-engine.service.js';
import { bumpQueueRevision } from '../queue/queue-ticket.util.js';
import type { CancelServiceSessionDto } from './dto/cancel-service-session.dto.js';
import type { ReplaceServiceSessionItemsDto } from './dto/replace-service-session-items.dto.js';
import type { StartServiceSessionDto } from './dto/start-service-session.dto.js';
import { assertStartAuthorized } from './service-session-start-authorization.util.js';
import { toServiceSessionView, type ServiceSessionView } from './service-session-view.js';

const START_PERMISSION = 'service_sessions.start';
const PERFORM_PERMISSION = 'service_sessions.perform';
const MANAGE_PERMISSION = 'service_sessions.manage';
/** The permission a `.start`-only caller (typically a receptionist)
 * additionally needs to select a *different* provider than the one
 * already assigned to the queue entry — see `start()`. */
const CHANGE_PROVIDER_PERMISSION = 'queue.manage';
const ONE_ACTIVE_PER_STAFF_CONSTRAINT = 'service_sessions_one_active_per_staff';
const ONE_ACTIVE_PER_QUEUE_ENTRY_CONSTRAINT = 'service_sessions_one_active_per_queue_entry';

type ServiceSessionWithItems = Prisma.ServiceSessionGetPayload<{ include: { items: true } }>;

/**
 * The operational core of Phase 4/5 (docs task "ServiceSession
 * foundation" / "Service completion and cancellation"). `start` is the
 * only place a QueueEntry ever reaches IN_SERVICE, and `complete` the
 * only place a QueueEntry ever reaches COMPLETED — both run as one
 * database transaction covering the QueueEntry claim, the ServiceSession
 * write, and the queue history/revision bump, so a failure anywhere
 * inside leaves every row exactly as it was before the attempt (docs
 * task: "A failed service start leaves the QueueEntry unchanged" / "A
 * failed completion leaves the session and queue unchanged").
 */
@Injectable()
export class ServiceSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityEngine: AvailabilityEngineService,
    private readonly auditService: AuditService,
  ) {}

  async start(
    tenant: TenantContext,
    queueEntryId: string,
    dto: StartServiceSessionDto,
    requestId: string,
  ): Promise<ServiceSessionView> {
    const { hasManage, hasPerform, hasStart } = this.assertCanStart(tenant);

    const queueEntry = await this.prisma.queueEntry.findFirst({
      where: { id: queueEntryId, organizationId: tenant.organizationId },
      include: { services: true },
    });
    if (!queueEntry) {
      throw new NotFoundException('Queue entry not found');
    }
    assertMembershipHasBranchAccess(tenant, queueEntry.branchId);

    if (queueEntry.status !== QueueEntryStatus.WAITING && queueEntry.status !== QueueEntryStatus.CALLED) {
      throw new ConflictException({
        code: 'QUEUE_ENTRY_ALREADY_IN_SERVICE',
        message: 'This queue entry is not waiting or called.',
      });
    }
    if (queueEntry.services.length === 0) {
      throw new BadRequestException('This queue entry has no requested services');
    }

    const providerStaffProfileId = dto.staffProfileId ?? queueEntry.assignedStaffProfileId;
    if (!providerStaffProfileId) {
      throw new BadRequestException('A staff member must be assigned before starting service');
    }

    const ownStaffProfileId = hasManage
      ? null
      : await this.resolveOwnStaffProfileId(tenant.organizationId, tenant.membershipId);
    assertStartAuthorized({
      hasManage,
      hasPerform,
      hasStart,
      hasChangeProviderPermission: tenant.permissionCodes.has(CHANGE_PROVIDER_PERMISSION),
      ownStaffProfileId,
      resolvedProviderStaffProfileId: providerStaffProfileId,
      providerExplicitlyRequested: dto.staffProfileId !== undefined,
      currentlyAssignedStaffProfileId: queueEntry.assignedStaffProfileId,
    });

    const serviceIds = queueEntry.services.map((service) => service.serviceId);
    const eligible = await this.availabilityEngine.resolveEligibleProviders(
      tenant.organizationId,
      queueEntry.branchId,
      serviceIds,
      providerStaffProfileId,
    );
    if (eligible.length === 0) {
      throw new BadRequestException(
        'The selected staff member cannot perform the requested services at this branch',
      );
    }

    const items = await this.availabilityEngine.resolveEffectiveServiceItems(
      tenant.organizationId,
      queueEntry.branchId,
      serviceIds,
    );
    const currency = items[0].currency;
    const serviceTotalMinor = items.reduce((sum, item) => sum + item.priceMinor, 0);

    try {
      const session = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.queueEntry.updateMany({
          where: { id: queueEntryId, status: queueEntry.status, version: queueEntry.version },
          data: { status: QueueEntryStatus.IN_SERVICE, serviceStartedAt: new Date(), version: { increment: 1 } },
        });
        if (claim.count === 0) {
          throw new ConflictException({
            code: 'QUEUE_ENTRY_ALREADY_IN_SERVICE',
            message: 'This queue entry is no longer waiting or called.',
          });
        }

        const created = await tx.serviceSession.create({
          data: {
            organizationId: tenant.organizationId,
            branchId: queueEntry.branchId,
            queueEntryId,
            appointmentId: queueEntry.appointmentId,
            customerRecordId: queueEntry.customerRecordId,
            assignedStaffProfileId: providerStaffProfileId,
            currency,
            serviceTotalMinor,
            createdByMembershipId: tenant.membershipId,
            items: {
              create: items.map((item, index) => ({
                organizationId: tenant.organizationId,
                serviceId: item.serviceId,
                staffProfileId: providerStaffProfileId,
                serviceNameSnapshot: item.name,
                durationMinutesSnapshot: item.durationMinutes,
                priceMinorSnapshot: item.priceMinor,
                currencySnapshot: item.currency,
                displayOrder: index,
              })),
            },
          },
          include: { items: true },
        });

        await tx.queueEntryStatusHistory.create({
          data: {
            organizationId: tenant.organizationId,
            queueEntryId,
            previousStatus: queueEntry.status,
            newStatus: QueueEntryStatus.IN_SERVICE,
            actorUserId: tenant.userId,
            actorMembershipId: tenant.membershipId,
          },
        });
        await tx.serviceSessionStatusHistory.create({
          data: {
            organizationId: tenant.organizationId,
            serviceSessionId: created.id,
            previousStatus: null,
            newStatus: ServiceSessionStatus.IN_PROGRESS,
            actorUserId: tenant.userId,
            actorMembershipId: tenant.membershipId,
          },
        });
        await bumpQueueRevision(tx, queueEntry.branchQueueDayId);

        return created;
      });

      await this.auditService.record({
        organizationId: tenant.organizationId,
        branchId: queueEntry.branchId,
        actorUserId: tenant.userId,
        actorMembershipId: tenant.membershipId,
        action: 'service_session.started',
        entityType: 'service_session',
        entityId: session.id,
        requestId,
        source: 'service_sessions',
        newState: { status: ServiceSessionStatus.IN_PROGRESS, assignedStaffProfileId: providerStaffProfileId },
      });

      return toServiceSessionView(session);
    } catch (error) {
      if (isUniqueConstraintViolation(error, ONE_ACTIVE_PER_STAFF_CONSTRAINT)) {
        throw new ConflictException({
          code: 'STAFF_ALREADY_SERVING',
          message: 'This staff member is already serving another customer.',
        });
      }
      if (isUniqueConstraintViolation(error, ONE_ACTIVE_PER_QUEUE_ENTRY_CONSTRAINT)) {
        throw new ConflictException({
          code: 'QUEUE_ENTRY_ALREADY_IN_SERVICE',
          message: 'This queue entry already has an active service session.',
        });
      }
      throw error;
    }
  }

  async replaceItems(
    tenant: TenantContext,
    serviceSessionId: string,
    dto: ReplaceServiceSessionItemsDto,
    requestId: string,
  ): Promise<ServiceSessionView> {
    const hasManage = this.assertCanPerform(tenant);
    const session = await this.loadOwnedSession(tenant.organizationId, serviceSessionId);
    assertMembershipHasBranchAccess(tenant, session.branchId);
    await this.assertOwnSessionUnlessManage(tenant, hasManage, session.assignedStaffProfileId);

    if (session.status !== ServiceSessionStatus.IN_PROGRESS) {
      throw new ConflictException({
        code: 'SERVICE_SESSION_NOT_IN_PROGRESS',
        message: 'Only an in-progress service session can have its items replaced.',
      });
    }

    const items = await this.availabilityEngine.resolveEffectiveServiceItems(
      tenant.organizationId,
      session.branchId,
      dto.serviceIds,
    );
    const currency = items[0].currency;
    const serviceTotalMinor = items.reduce((sum, item) => sum + item.priceMinor, 0);
    const previousTotal = session.serviceTotalMinor;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.serviceSession.updateMany({
        where: { id: serviceSessionId, status: ServiceSessionStatus.IN_PROGRESS, version: session.version },
        data: { currency, serviceTotalMinor, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException('This service session was already updated by someone else');
      }
      await tx.serviceSessionItem.deleteMany({ where: { serviceSessionId } });
      await tx.serviceSessionItem.createMany({
        data: items.map((item, index) => ({
          organizationId: tenant.organizationId,
          serviceSessionId,
          serviceId: item.serviceId,
          staffProfileId: session.assignedStaffProfileId,
          serviceNameSnapshot: item.name,
          durationMinutesSnapshot: item.durationMinutes,
          priceMinorSnapshot: item.priceMinor,
          currencySnapshot: item.currency,
          displayOrder: index,
        })),
      });
      return tx.serviceSession.findUniqueOrThrow({ where: { id: serviceSessionId }, include: { items: true } });
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: session.branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: 'service_session.items_updated',
      entityType: 'service_session',
      entityId: serviceSessionId,
      requestId,
      source: 'service_sessions',
      previousState: { serviceTotalMinor: previousTotal },
      newState: { serviceTotalMinor },
    });

    return toServiceSessionView(updated);
  }

  async complete(tenant: TenantContext, serviceSessionId: string, requestId: string): Promise<ServiceSessionView> {
    const hasManage = this.assertCanPerform(tenant);
    const session = await this.loadOwnedSession(tenant.organizationId, serviceSessionId);
    assertMembershipHasBranchAccess(tenant, session.branchId);
    await this.assertOwnSessionUnlessManage(tenant, hasManage, session.assignedStaffProfileId);

    if (session.status !== ServiceSessionStatus.IN_PROGRESS) {
      throw new ConflictException({
        code: 'SERVICE_SESSION_NOT_IN_PROGRESS',
        message: 'Only an in-progress service session can be completed.',
      });
    }
    if (session.items.length === 0) {
      throw new BadRequestException('A service session must have at least one item to complete');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.serviceSession.updateMany({
        where: { id: serviceSessionId, status: ServiceSessionStatus.IN_PROGRESS, version: session.version },
        data: {
          status: ServiceSessionStatus.COMPLETED,
          completedAt: new Date(),
          completedByMembershipId: tenant.membershipId,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('This service session was already updated by someone else');
      }

      const queueResult = await tx.queueEntry.updateMany({
        where: { id: session.queueEntryId, status: QueueEntryStatus.IN_SERVICE },
        data: { status: QueueEntryStatus.COMPLETED, completedAt: new Date(), version: { increment: 1 } },
      });
      if (queueResult.count === 0) {
        throw new ConflictException('The related queue entry was already updated by someone else');
      }

      const queueEntry = await tx.queueEntry.findUniqueOrThrow({ where: { id: session.queueEntryId } });
      await tx.queueEntryStatusHistory.create({
        data: {
          organizationId: tenant.organizationId,
          queueEntryId: session.queueEntryId,
          previousStatus: QueueEntryStatus.IN_SERVICE,
          newStatus: QueueEntryStatus.COMPLETED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
        },
      });
      await tx.serviceSessionStatusHistory.create({
        data: {
          organizationId: tenant.organizationId,
          serviceSessionId,
          previousStatus: ServiceSessionStatus.IN_PROGRESS,
          newStatus: ServiceSessionStatus.COMPLETED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
        },
      });
      await bumpQueueRevision(tx, queueEntry.branchQueueDayId);

      return tx.serviceSession.findUniqueOrThrow({ where: { id: serviceSessionId }, include: { items: true } });
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: session.branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: 'service_session.completed',
      entityType: 'service_session',
      entityId: serviceSessionId,
      requestId,
      source: 'service_sessions',
      previousState: { status: ServiceSessionStatus.IN_PROGRESS },
      newState: { status: ServiceSessionStatus.COMPLETED, serviceTotalMinor: session.serviceTotalMinor },
    });

    return toServiceSessionView(updated);
  }

  /**
   * RETURN_TO_QUEUE / CANCEL_VISIT are the only two ways an IN_SERVICE
   * QueueEntry ever leaves IN_SERVICE outside of completion (docs task
   * Phase 5) — deliberately not routed through
   * QueueCommandsService/assertQueueTransitionAllowed, which governs the
   * plain staff-command state machine only.
   */
  async cancel(
    tenant: TenantContext,
    serviceSessionId: string,
    dto: CancelServiceSessionDto,
    requestId: string,
  ): Promise<ServiceSessionView> {
    const hasManage = this.assertCanPerform(tenant);
    const session = await this.loadOwnedSession(tenant.organizationId, serviceSessionId);
    assertMembershipHasBranchAccess(tenant, session.branchId);
    await this.assertOwnSessionUnlessManage(tenant, hasManage, session.assignedStaffProfileId);

    if (session.status !== ServiceSessionStatus.IN_PROGRESS) {
      throw new ConflictException({
        code: 'SERVICE_SESSION_NOT_IN_PROGRESS',
        message: 'Only an in-progress service session can be cancelled.',
      });
    }

    const newQueueStatus =
      dto.disposition === ServiceSessionCancelDisposition.RETURN_TO_QUEUE
        ? QueueEntryStatus.WAITING
        : QueueEntryStatus.CANCELLED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.serviceSession.updateMany({
        where: { id: serviceSessionId, status: ServiceSessionStatus.IN_PROGRESS, version: session.version },
        data: {
          status: ServiceSessionStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason,
          cancelDisposition: dto.disposition,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('This service session was already updated by someone else');
      }

      const queueResult = await tx.queueEntry.updateMany({
        where: { id: session.queueEntryId, status: QueueEntryStatus.IN_SERVICE },
        data: {
          status: newQueueStatus,
          ...(newQueueStatus === QueueEntryStatus.CANCELLED ? { cancelledAt: new Date() } : {}),
          version: { increment: 1 },
        },
      });
      if (queueResult.count === 0) {
        throw new ConflictException('The related queue entry was already updated by someone else');
      }

      const queueEntry = await tx.queueEntry.findUniqueOrThrow({ where: { id: session.queueEntryId } });
      await tx.queueEntryStatusHistory.create({
        data: {
          organizationId: tenant.organizationId,
          queueEntryId: session.queueEntryId,
          previousStatus: QueueEntryStatus.IN_SERVICE,
          newStatus: newQueueStatus,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          reason: dto.reason,
        },
      });
      await tx.serviceSessionStatusHistory.create({
        data: {
          organizationId: tenant.organizationId,
          serviceSessionId,
          previousStatus: ServiceSessionStatus.IN_PROGRESS,
          newStatus: ServiceSessionStatus.CANCELLED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          reason: dto.reason,
          cancelDisposition: dto.disposition,
        },
      });
      await bumpQueueRevision(tx, queueEntry.branchQueueDayId);

      return tx.serviceSession.findUniqueOrThrow({ where: { id: serviceSessionId }, include: { items: true } });
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: session.branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: 'service_session.cancelled',
      entityType: 'service_session',
      entityId: serviceSessionId,
      requestId,
      source: 'service_sessions',
      previousState: { status: ServiceSessionStatus.IN_PROGRESS },
      newState: { status: ServiceSessionStatus.CANCELLED, disposition: dto.disposition },
    });

    return toServiceSessionView(updated);
  }

  /** Used by `replaceItems`/`complete`/`cancel` — deliberately excludes
   * `service_sessions.start`, which permits reaching `start()` only
   * (docs task correction: "It does not permit replacing session
   * items, completing a session, cancelling a session or acting as the
   * assigned provider"). */
  private assertCanPerform(tenant: TenantContext): boolean {
    const hasManage = tenant.permissionCodes.has(MANAGE_PERMISSION);
    const hasPerform = tenant.permissionCodes.has(PERFORM_PERMISSION);
    if (!hasManage && !hasPerform) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return hasManage;
  }

  /** Used by `start()` only — the any-of set `@RequireAnyPermission`
   * already gated at the route, resolved here into which specific
   * permission(s) the caller holds so `start()` can apply the right
   * fine-grained rule for each (docs task correction 2). */
  private assertCanStart(tenant: TenantContext): {
    hasManage: boolean;
    hasPerform: boolean;
    hasStart: boolean;
  } {
    const hasManage = tenant.permissionCodes.has(MANAGE_PERMISSION);
    const hasPerform = tenant.permissionCodes.has(PERFORM_PERMISSION);
    const hasStart = tenant.permissionCodes.has(START_PERMISSION);
    if (!hasManage && !hasPerform && !hasStart) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return { hasManage, hasPerform, hasStart };
  }

  /** A provider must not complete/cancel/edit another provider's session
   * unless they hold the broader `service_sessions.manage` permission
   * (docs task Phase 5). */
  private async assertOwnSessionUnlessManage(
    tenant: TenantContext,
    hasManage: boolean,
    assignedStaffProfileId: string,
  ): Promise<void> {
    if (hasManage) {
      return;
    }
    const ownStaffProfileId = await this.resolveOwnStaffProfileId(tenant.organizationId, tenant.membershipId);
    if (!ownStaffProfileId || ownStaffProfileId !== assignedStaffProfileId) {
      throw new ForbiddenException('You can only act on your own service session');
    }
  }

  private async resolveOwnStaffProfileId(organizationId: string, membershipId: string): Promise<string | null> {
    const profile = await this.prisma.staffProfile.findUnique({
      where: { organizationId_membershipId: { organizationId, membershipId } },
    });
    return profile?.id ?? null;
  }

  private async loadOwnedSession(organizationId: string, serviceSessionId: string): Promise<ServiceSessionWithItems> {
    const session = await this.prisma.serviceSession.findFirst({
      where: { id: serviceSessionId, organizationId },
      include: { items: true },
    });
    if (!session) {
      throw new NotFoundException('Service session not found');
    }
    return session;
  }
}
