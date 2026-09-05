import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  PaymentDisputeResolution,
  PaymentDisputeStatus,
  PaymentRecordStatus,
  PaymentVerificationAction,
} from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { CheckoutSettlementService } from './checkout-settlement.service.js';
import type { ResolvePaymentDisputeDto } from './dto/resolve-payment-dispute.dto.js';
import { toPaymentDisputeView, type PaymentDisputeView } from './payment-dispute-view.js';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Owner/manager dispute resolution (docs task Phase 3). Only a
 * `payments.resolve` holder ever reaches these methods (route-gated) —
 * distinct from PaymentVerificationsService, which owns the provider's
 * own confirm/dispute actions. `payments.resolve` is never scoped to
 * "own branch only" the way `payments.verify_own` is scoped to "own
 * assigned work only", since every role that holds it (owner, manager)
 * already holds the broad `branches.manage` permission in this codebase
 * (docs/API_SPEC.md section 27) — so this service deliberately does not
 * repeat a branch-access check every other financial service performs.
 */
@Injectable()
export class PaymentDisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly checkoutSettlement: CheckoutSettlementService,
  ) {}

  async list(
    tenant: TenantContext,
    options: { status?: PaymentDisputeStatus; cursor?: string; limit?: number },
  ): Promise<PaginatedPayload<PaymentDisputeView>> {
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.paymentDispute.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(options.status ? { status: options.status } : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      include: { paymentRecord: true },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map((row) => toPaymentDisputeView(row, row.paymentRecord)),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  async get(tenant: TenantContext, disputeId: string): Promise<PaymentDisputeView> {
    const dispute = await this.prisma.paymentDispute.findFirst({
      where: { id: disputeId, organizationId: tenant.organizationId },
      include: { paymentRecord: true },
    });
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }
    return toPaymentDisputeView(dispute, dispute.paymentRecord);
  }

  async resolve(
    tenant: TenantContext,
    disputeId: string,
    dto: ResolvePaymentDisputeDto,
    requestId: string,
  ): Promise<PaymentDisputeView> {
    const dispute = await this.prisma.paymentDispute.findFirst({
      where: { id: disputeId, organizationId: tenant.organizationId },
    });
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }
    if (dispute.status !== PaymentDisputeStatus.OPEN) {
      throw new ConflictException({
        code: 'PAYMENT_DISPUTE_ALREADY_RESOLVED',
        message: 'This dispute has already been resolved.',
      });
    }

    const payment = await this.prisma.paymentRecord.findUniqueOrThrow({ where: { id: dispute.paymentRecordId } });
    const isConfirming = dto.resolution === PaymentDisputeResolution.CONFIRM_PAYMENT;

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedCheckout = await this.checkoutSettlement.lockCheckout(tx, payment.checkoutId);

      const freshDispute = await tx.paymentDispute.findUniqueOrThrow({ where: { id: disputeId } });
      if (freshDispute.status !== PaymentDisputeStatus.OPEN) {
        throw new ConflictException({
          code: 'PAYMENT_DISPUTE_ALREADY_RESOLVED',
          message: 'This dispute has already been resolved.',
        });
      }
      const freshPayment = await tx.paymentRecord.findUniqueOrThrow({ where: { id: payment.id } });
      if (freshPayment.status !== PaymentRecordStatus.DISPUTED) {
        throw new ConflictException({
          code: 'PAYMENT_DISPUTE_REQUIRED',
          message: 'This payment is not currently disputed.',
        });
      }

      const newDisputeStatus = isConfirming
        ? PaymentDisputeStatus.RESOLVED_CONFIRMED
        : PaymentDisputeStatus.RESOLVED_REJECTED;
      const paymentUpdateData: Prisma.PaymentRecordUncheckedUpdateManyInput = isConfirming
        ? {
            status: PaymentRecordStatus.CONFIRMED,
            confirmedByMembershipId: tenant.membershipId,
            confirmedAt: new Date(),
            version: { increment: 1 },
          }
        : {
            status: PaymentRecordStatus.VOIDED,
            voidedAt: new Date(),
            voidedByMembershipId: tenant.membershipId,
            voidReason: dto.resolutionNote ?? 'Rejected via dispute resolution',
            version: { increment: 1 },
          };

      const paymentUpdateResult = await tx.paymentRecord.updateMany({
        where: { id: payment.id, version: freshPayment.version },
        data: paymentUpdateData,
      });
      if (paymentUpdateResult.count === 0) {
        throw new ConflictException('This payment was already updated by someone else');
      }

      const disputeUpdateResult = await tx.paymentDispute.updateMany({
        where: { id: disputeId, status: PaymentDisputeStatus.OPEN },
        data: {
          status: newDisputeStatus,
          resolvedByMembershipId: tenant.membershipId,
          resolvedAt: new Date(),
          resolution: dto.resolution,
          resolutionNote: dto.resolutionNote ?? null,
        },
      });
      if (disputeUpdateResult.count === 0) {
        throw new ConflictException('This dispute was already resolved by someone else');
      }

      await tx.paymentVerificationEvent.create({
        data: {
          organizationId: tenant.organizationId,
          paymentRecordId: payment.id,
          action: isConfirming ? PaymentVerificationAction.RESOLVED_CONFIRMED : PaymentVerificationAction.RESOLVED_REJECTED,
          previousStatus: PaymentRecordStatus.DISPUTED,
          newStatus: isConfirming ? PaymentRecordStatus.CONFIRMED : PaymentRecordStatus.VOIDED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          reason: dto.resolutionNote,
        },
      });

      await this.auditService.record(
        {
          organizationId: tenant.organizationId,
          branchId: payment.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: isConfirming ? 'payment.dispute_resolved_confirmed' : 'payment.dispute_resolved_rejected',
          entityType: 'payment_dispute',
          entityId: disputeId,
          requestId,
          source: 'payments',
          previousState: { status: PaymentDisputeStatus.OPEN },
          newState: { status: newDisputeStatus, resolutionNote: dto.resolutionNote ?? null },
        },
        tx,
      );

      await this.checkoutSettlement.recalculate(tx, lockedCheckout, {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        membershipId: tenant.membershipId,
        requestId,
      });

      return tx.paymentDispute.findUniqueOrThrow({ where: { id: disputeId }, include: { paymentRecord: true } });
    });

    return toPaymentDisputeView(updated, updated.paymentRecord);
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
}
