import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import { assertSafeMoneyAmount, sumMinorAmounts } from '../../common/money/assert-safe-money-amount.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  FinancialIdempotencyOperation,
  MembershipStatus,
  TransactionCorrectionStatus,
  TransactionCorrectionType,
  TransactionKind,
} from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { assertCorrectionDecisionAuthorized } from './correction-decision-authorization.util.js';
import type { ApproveCorrectionDto } from './dto/approve-correction.dto.js';
import type { CancelCorrectionDto } from './dto/cancel-correction.dto.js';
import type { RejectCorrectionDto } from './dto/reject-correction.dto.js';
import type { RequestRefundDto } from './dto/request-refund.dto.js';
import type { RequestReversalDto } from './dto/request-reversal.dto.js';
import {
  toTransactionCorrectionView,
  transactionCorrectionViewInclude,
  type TransactionCorrectionView,
} from './transaction-correction-view.js';

const APPROVE_PERMISSION = 'refunds.approve';
const DEFAULT_PAGE_SIZE = 20;
const REQUESTABLE_ORIGINAL_STATUSES: readonly TransactionCorrectionStatus[] = [
  TransactionCorrectionStatus.REQUESTED,
  TransactionCorrectionStatus.APPROVED,
];

export interface CorrectionActor {
  organizationId: string;
  userId: string;
  membershipId: string;
  requestId: string;
}

/**
 * The correction request/decision workflow (docs task Phase 3):
 * REQUESTED -> APPROVED -> EXECUTED is the only path that ever posts a
 * corrective Transaction (TransactionCorrectionExecutionService, a
 * separate service for that atomic step). REQUESTED -> REJECTED,
 * REQUESTED -> CANCELLED, and APPROVED -> CANCELLED are all terminal
 * with no corrective Transaction ever created.
 */
@Injectable()
export class TransactionCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async requestRefund(
    tenant: TenantContext,
    transactionId: string,
    dto: RequestRefundDto,
    idempotencyKey: string | undefined,
    actor: CorrectionActor,
  ): Promise<TransactionCorrectionView> {
    if (!idempotencyKey) {
      throw new BadRequestException('An Idempotency-Key header is required to request a correction');
    }

    const originalTransaction = await this.loadCorrectableSale(tenant, transactionId);

    const originalLineItems = await this.prisma.transactionLineItem.findMany({
      where: { organizationId: tenant.organizationId, transactionId, id: { in: dto.lines.map((line) => line.originalTransactionLineItemId) } },
    });
    const originalLineItemsById = new Map(originalLineItems.map((item) => [item.id, item]));
    for (const line of dto.lines) {
      const originalLine = originalLineItemsById.get(line.originalTransactionLineItemId);
      if (!originalLine) {
        throw new BadRequestException(`Line item ${line.originalTransactionLineItemId} does not belong to this transaction`);
      }
      assertSafeMoneyAmount(line.requestedAmountMinor, 'requestedAmountMinor', { min: 1 });
      if (line.requestedAmountMinor > originalLine.priceMinorSnapshot) {
        throw new ConflictException({
          code: 'CORRECTION_LINE_AMOUNT_EXCEEDS_ORIGINAL',
          message: 'A requested refund amount cannot exceed the original line amount.',
        });
      }
    }
    const totalRequestedMinor = sumMinorAmounts(dto.lines.map((line) => line.requestedAmountMinor), 'total requested refund');

    const requestFingerprint = computeRequestFingerprint(transactionId, TransactionCorrectionType.REFUND, {
      reason: dto.reason,
      returnMethod: dto.returnMethod,
      lines: dto.lines,
    });
    const replay = await this.checkIdempotentReplay(tenant.membershipId, idempotencyKey, requestFingerprint);
    if (replay) {
      return replay;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const correction = await tx.transactionCorrection.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: originalTransaction.branchId,
          originalTransactionId: transactionId,
          correctionType: TransactionCorrectionType.REFUND,
          reason: dto.reason,
          currency: originalTransaction.currency,
          returnMethod: dto.returnMethod,
          totalRequestedMinor,
          requestedByMembershipId: tenant.membershipId,
          items: {
            create: dto.lines.map((line) => ({
              organizationId: tenant.organizationId,
              originalTransactionLineItemId: line.originalTransactionLineItemId,
              requestedAmountMinor: line.requestedAmountMinor,
            })),
          },
        },
        include: transactionCorrectionViewInclude,
      });

      await tx.transactionCorrectionStatusHistory.create({
        data: {
          organizationId: tenant.organizationId,
          correctionId: correction.id,
          previousStatus: null,
          newStatus: TransactionCorrectionStatus.REQUESTED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
        },
      });

      await tx.financialIdempotencyKey.create({
        data: {
          organizationId: tenant.organizationId,
          membershipId: tenant.membershipId,
          operation: FinancialIdempotencyOperation.REQUEST_CORRECTION,
          idempotencyKey,
          requestFingerprint,
          resourceType: 'transaction_correction',
          resourceId: correction.id,
        },
      });

      await this.auditService.record(
        {
          organizationId: tenant.organizationId,
          branchId: originalTransaction.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: 'refund.requested',
          entityType: 'transaction_correction',
          entityId: correction.id,
          requestId: actor.requestId,
          source: 'corrections',
          newState: { originalTransactionId: transactionId, totalRequestedMinor, returnMethod: dto.returnMethod },
        },
        tx,
      );

      return correction;
    });

    return toTransactionCorrectionView(created);
  }

  async requestReversal(
    tenant: TenantContext,
    transactionId: string,
    dto: RequestReversalDto,
    idempotencyKey: string | undefined,
    actor: CorrectionActor,
  ): Promise<TransactionCorrectionView> {
    if (!idempotencyKey) {
      throw new BadRequestException('An Idempotency-Key header is required to request a correction');
    }

    const originalTransaction = await this.loadCorrectableSale(tenant, transactionId);

    const alreadyExecuted = await this.prisma.transactionCorrection.count({
      where: { organizationId: tenant.organizationId, originalTransactionId: transactionId, status: TransactionCorrectionStatus.EXECUTED },
    });
    if (alreadyExecuted > 0) {
      throw new ConflictException({
        code: 'CORRECTION_ALREADY_EXECUTED',
        message: 'A refund or reversal has already been executed against this transaction.',
      });
    }

    const originalLineItems = await this.prisma.transactionLineItem.findMany({ where: { organizationId: tenant.organizationId, transactionId } });
    if (originalLineItems.length === 0) {
      throw new BadRequestException('This transaction has no line items to reverse');
    }

    const requestFingerprint = computeRequestFingerprint(transactionId, TransactionCorrectionType.REVERSAL, {
      reason: dto.reason,
      returnMethod: dto.returnMethod,
    });
    const replay = await this.checkIdempotentReplay(tenant.membershipId, idempotencyKey, requestFingerprint);
    if (replay) {
      return replay;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const correction = await tx.transactionCorrection.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: originalTransaction.branchId,
          originalTransactionId: transactionId,
          correctionType: TransactionCorrectionType.REVERSAL,
          reason: dto.reason,
          currency: originalTransaction.currency,
          returnMethod: dto.returnMethod,
          totalRequestedMinor: originalTransaction.totalMinor,
          requestedByMembershipId: tenant.membershipId,
          items: {
            create: originalLineItems.map((item) => ({
              organizationId: tenant.organizationId,
              originalTransactionLineItemId: item.id,
              requestedAmountMinor: item.priceMinorSnapshot,
            })),
          },
        },
        include: transactionCorrectionViewInclude,
      });

      await tx.transactionCorrectionStatusHistory.create({
        data: {
          organizationId: tenant.organizationId,
          correctionId: correction.id,
          previousStatus: null,
          newStatus: TransactionCorrectionStatus.REQUESTED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
        },
      });

      await tx.financialIdempotencyKey.create({
        data: {
          organizationId: tenant.organizationId,
          membershipId: tenant.membershipId,
          operation: FinancialIdempotencyOperation.REQUEST_CORRECTION,
          idempotencyKey,
          requestFingerprint,
          resourceType: 'transaction_correction',
          resourceId: correction.id,
        },
      });

      await this.auditService.record(
        {
          organizationId: tenant.organizationId,
          branchId: originalTransaction.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: 'reversal.requested',
          entityType: 'transaction_correction',
          entityId: correction.id,
          requestId: actor.requestId,
          source: 'corrections',
          newState: { originalTransactionId: transactionId, totalRequestedMinor: originalTransaction.totalMinor },
        },
        tx,
      );

      return correction;
    });

    return toTransactionCorrectionView(created);
  }

  async list(
    tenant: TenantContext,
    options: {
      branchId?: string;
      originalTransactionId?: string;
      correctionType?: TransactionCorrectionType;
      status?: TransactionCorrectionStatus;
      requestedByMembershipId?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<PaginatedPayload<TransactionCorrectionView>> {
    if (options.branchId) {
      assertMembershipHasBranchAccess(tenant, options.branchId);
    }
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.transactionCorrection.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(options.branchId ? { branchId: options.branchId } : {}),
        ...(options.originalTransactionId ? { originalTransactionId: options.originalTransactionId } : {}),
        ...(options.correctionType ? { correctionType: options.correctionType } : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.requestedByMembershipId ? { requestedByMembershipId: options.requestedByMembershipId } : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      include: transactionCorrectionViewInclude,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toTransactionCorrectionView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  async get(tenant: TenantContext, correctionId: string) {
    const correction = await this.loadOwnedCorrection(tenant, correctionId);
    return toTransactionCorrectionView(correction);
  }

  async approve(tenant: TenantContext, correctionId: string, dto: ApproveCorrectionDto, actor: CorrectionActor): Promise<TransactionCorrectionView> {
    const correction = await this.loadOwnedCorrection(tenant, correctionId);
    if (correction.status !== TransactionCorrectionStatus.REQUESTED) {
      throw new ConflictException({ code: 'CORRECTION_STATE_INVALID', message: 'Only a requested correction can be approved.' });
    }

    const { soloOwnerOverride } = await this.assertDecisionAuthorized(tenant, correction.requestedByMembershipId, dto.overrideReason);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.transactionCorrection.updateMany({
        where: { id: correctionId, status: TransactionCorrectionStatus.REQUESTED, version: correction.version },
        data: {
          status: TransactionCorrectionStatus.APPROVED,
          approvedByMembershipId: tenant.membershipId,
          approvedAt: new Date(),
          soloOwnerOverride,
          soloOwnerOverrideReason: soloOwnerOverride ? dto.overrideReason : null,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('This correction was already updated by someone else');
      }

      await tx.transactionCorrectionStatusHistory.create({
        data: {
          organizationId: tenant.organizationId,
          correctionId,
          previousStatus: TransactionCorrectionStatus.REQUESTED,
          newStatus: TransactionCorrectionStatus.APPROVED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
        },
      });

      await this.auditService.record(
        {
          organizationId: tenant.organizationId,
          branchId: correction.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: 'correction.approved',
          entityType: 'transaction_correction',
          entityId: correctionId,
          requestId: actor.requestId,
          source: 'corrections',
          newState: { soloOwnerOverride },
        },
        tx,
      );
      if (soloOwnerOverride) {
        await this.auditService.record(
          {
            organizationId: tenant.organizationId,
            branchId: correction.branchId,
            actorUserId: tenant.userId,
            actorMembershipId: tenant.membershipId,
            action: 'correction.solo_owner_override',
            entityType: 'transaction_correction',
            entityId: correctionId,
            requestId: actor.requestId,
            source: 'corrections',
            metadata: { decision: 'approve', reason: dto.overrideReason },
          },
          tx,
        );
      }

      return tx.transactionCorrection.findUniqueOrThrow({ where: { id: correctionId }, include: transactionCorrectionViewInclude });
    });

    return toTransactionCorrectionView(updated);
  }

  async reject(tenant: TenantContext, correctionId: string, dto: RejectCorrectionDto, actor: CorrectionActor): Promise<TransactionCorrectionView> {
    const correction = await this.loadOwnedCorrection(tenant, correctionId);
    if (correction.status !== TransactionCorrectionStatus.REQUESTED) {
      throw new ConflictException({ code: 'CORRECTION_STATE_INVALID', message: 'Only a requested correction can be rejected.' });
    }

    const { soloOwnerOverride } = await this.assertDecisionAuthorized(tenant, correction.requestedByMembershipId, dto.overrideReason);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.transactionCorrection.updateMany({
        where: { id: correctionId, status: TransactionCorrectionStatus.REQUESTED, version: correction.version },
        data: {
          status: TransactionCorrectionStatus.REJECTED,
          rejectedByMembershipId: tenant.membershipId,
          rejectedAt: new Date(),
          rejectionReason: dto.rejectionReason,
          soloOwnerOverride,
          soloOwnerOverrideReason: soloOwnerOverride ? dto.overrideReason : null,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('This correction was already updated by someone else');
      }

      await tx.transactionCorrectionStatusHistory.create({
        data: {
          organizationId: tenant.organizationId,
          correctionId,
          previousStatus: TransactionCorrectionStatus.REQUESTED,
          newStatus: TransactionCorrectionStatus.REJECTED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          reason: dto.rejectionReason,
        },
      });

      await this.auditService.record(
        {
          organizationId: tenant.organizationId,
          branchId: correction.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: 'correction.rejected',
          entityType: 'transaction_correction',
          entityId: correctionId,
          requestId: actor.requestId,
          source: 'corrections',
          newState: { reason: dto.rejectionReason, soloOwnerOverride },
        },
        tx,
      );
      if (soloOwnerOverride) {
        await this.auditService.record(
          {
            organizationId: tenant.organizationId,
            branchId: correction.branchId,
            actorUserId: tenant.userId,
            actorMembershipId: tenant.membershipId,
            action: 'correction.solo_owner_override',
            entityType: 'transaction_correction',
            entityId: correctionId,
            requestId: actor.requestId,
            source: 'corrections',
            metadata: { decision: 'reject', reason: dto.overrideReason },
          },
          tx,
        );
      }

      return tx.transactionCorrection.findUniqueOrThrow({ where: { id: correctionId }, include: transactionCorrectionViewInclude });
    });

    return toTransactionCorrectionView(updated);
  }

  async cancel(tenant: TenantContext, correctionId: string, dto: CancelCorrectionDto, actor: CorrectionActor): Promise<TransactionCorrectionView> {
    const correction = await this.loadOwnedCorrection(tenant, correctionId);
    if (!REQUESTABLE_ORIGINAL_STATUSES.includes(correction.status)) {
      throw new ConflictException({ code: 'CORRECTION_STATE_INVALID', message: 'Only a requested or approved correction can be cancelled.' });
    }
    const isRequester = tenant.membershipId === correction.requestedByMembershipId;
    if (!isRequester && !tenant.permissionCodes.has(APPROVE_PERMISSION)) {
      throw new ForbiddenException('You can only cancel your own correction request');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.transactionCorrection.updateMany({
        where: { id: correctionId, status: correction.status, version: correction.version },
        data: {
          status: TransactionCorrectionStatus.CANCELLED,
          cancelledByMembershipId: tenant.membershipId,
          cancelledAt: new Date(),
          cancellationReason: dto.cancellationReason,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('This correction was already updated by someone else');
      }

      await tx.transactionCorrectionStatusHistory.create({
        data: {
          organizationId: tenant.organizationId,
          correctionId,
          previousStatus: correction.status,
          newStatus: TransactionCorrectionStatus.CANCELLED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          reason: dto.cancellationReason,
        },
      });

      await this.auditService.record(
        {
          organizationId: tenant.organizationId,
          branchId: correction.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: 'correction.cancelled',
          entityType: 'transaction_correction',
          entityId: correctionId,
          requestId: actor.requestId,
          source: 'corrections',
          newState: { reason: dto.cancellationReason },
        },
        tx,
      );

      return tx.transactionCorrection.findUniqueOrThrow({ where: { id: correctionId }, include: transactionCorrectionViewInclude });
    });

    return toTransactionCorrectionView(updated);
  }

  private async assertDecisionAuthorized(
    tenant: TenantContext,
    requestedByMembershipId: string,
    overrideReason: string | undefined,
  ): Promise<{ soloOwnerOverride: boolean }> {
    const isRequester = tenant.membershipId === requestedByMembershipId;
    const hasOtherEligibleApprover = isRequester ? await this.hasOtherEligibleApprover(tenant.organizationId, tenant.membershipId) : false;
    return assertCorrectionDecisionAuthorized({
      isRequester,
      isActiveOwner: tenant.isOwner,
      hasOtherEligibleApprover,
      overrideReason,
    });
  }

  private async hasOtherEligibleApprover(organizationId: string, excludeMembershipId: string): Promise<boolean> {
    const count = await this.prisma.organizationMembership.count({
      where: {
        organizationId,
        id: { not: excludeMembershipId },
        status: MembershipStatus.ACTIVE,
        membershipRoles: { some: { role: { rolePermissions: { some: { permission: { code: APPROVE_PERMISSION } } } } } },
      },
    });
    return count > 0;
  }

  private async loadCorrectableSale(tenant: TenantContext, transactionId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, organizationId: tenant.organizationId },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    assertMembershipHasBranchAccess(tenant, transaction.branchId);
    if (transaction.kind !== TransactionKind.SALE) {
      throw new ConflictException({
        code: 'TRANSACTION_NOT_CORRECTABLE',
        message: 'Only a SALE transaction can be refunded or reversed.',
      });
    }
    return transaction;
  }

  private async loadOwnedCorrection(tenant: TenantContext, correctionId: string) {
    const correction = await this.prisma.transactionCorrection.findFirst({
      where: { id: correctionId, organizationId: tenant.organizationId },
      include: transactionCorrectionViewInclude,
    });
    if (!correction) {
      throw new NotFoundException('Correction not found');
    }
    assertMembershipHasBranchAccess(tenant, correction.branchId);
    return correction;
  }

  private async checkIdempotentReplay(
    membershipId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<TransactionCorrectionView | null> {
    const existingKey = await this.prisma.financialIdempotencyKey.findUnique({
      where: {
        membershipId_operation_idempotencyKey: {
          membershipId,
          operation: FinancialIdempotencyOperation.REQUEST_CORRECTION,
          idempotencyKey,
        },
      },
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
    const existing = await this.prisma.transactionCorrection.findUnique({
      where: { id: existingKey.resourceId },
      include: transactionCorrectionViewInclude,
    });
    return existing ? toTransactionCorrectionView(existing) : null;
  }
}

function computeRequestFingerprint(transactionId: string, correctionType: TransactionCorrectionType, payload: unknown): string {
  const canonical = JSON.stringify({ transactionId, correctionType, payload });
  return createHash('sha256').update(canonical).digest('hex');
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
