import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import { generateReference } from '../../common/identity/generate-reference.util.js';
import { sumMinorAmounts } from '../../common/money/assert-safe-money-amount.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CommissionAccrualKind,
  FinancialIdempotencyOperation,
  PaymentMethod,
  TransactionCorrectionStatus,
  TransactionCorrectionType,
  TransactionKind,
} from '../../generated/prisma/client.js';
import type { Prisma, TransactionCorrection } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { CashSessionsService } from '../cash/cash-sessions.service.js';
import { CommissionAdjustmentService } from '../commissions/commission-adjustment.service.js';
import { ReceiptService } from '../receipts/receipt.service.js';
import { transactionViewInclude } from '../transactions/transaction-view.js';
import type { CorrectionActor } from './transaction-corrections.service.js';
import type { ExecuteCorrectionDto } from './dto/execute-correction.dto.js';
import {
  toTransactionCorrectionView,
  transactionCorrectionViewInclude,
  type TransactionCorrectionView,
} from './transaction-correction-view.js';

type TransactionClient = Prisma.TransactionClient;

const REFERENCE_PREFIX_BY_TYPE: Record<TransactionCorrectionType, string> = {
  [TransactionCorrectionType.REFUND]: 'REF',
  [TransactionCorrectionType.REVERSAL]: 'REV',
};
const MAX_REFERENCE_ATTEMPTS = 5;
const IDEMPOTENCY_UNIQUE_CONSTRAINT = 'financial_idempotency_keys_membership_id_operation_idempote_key';
const REFERENCE_UNIQUE_CONSTRAINT = 'transactions_reference_key';

/**
 * Executes exactly one APPROVED TransactionCorrection into an immutable,
 * POSTED corrective Transaction (docs task Phase 3), atomically alongside
 * its commission adjustments and corrective receipt — and a CashLedgerEntry
 * when the return method is CASH. The chain (payment verification/
 * resolution -> POSTED Transaction has its own analogue here: correction
 * approval -> POSTED corrective Transaction -> CommissionAccrual
 * adjustments -> corrective Receipt) all commits or rolls back together.
 *
 * The original SALE Transaction row is locked (`SELECT ... FOR UPDATE`)
 * as the very first database action, before the TransactionCorrection's
 * own row — this is what serializes every concurrent execution attempt
 * against the same sale (whether a retry of this same correction, or a
 * different correction against the same sale), the same "lock the
 * aggregate root first" pattern CheckoutSettlementService and
 * CashSessionsService already establish elsewhere in this codebase.
 * Remaining-refundable amounts are always recalculated fresh, under that
 * lock, from other corrections' own immutable EXECUTED records — never
 * from anything computed before the lock was acquired.
 */
@Injectable()
export class TransactionCorrectionExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly commissionAdjustmentService: CommissionAdjustmentService,
    private readonly receiptService: ReceiptService,
    private readonly cashSessionsService: CashSessionsService,
  ) {}

  async execute(
    tenant: TenantContext,
    correctionId: string,
    dto: ExecuteCorrectionDto,
    idempotencyKey: string | undefined,
    actor: CorrectionActor,
  ): Promise<TransactionCorrectionView> {
    if (!idempotencyKey) {
      throw new BadRequestException('An Idempotency-Key header is required to execute a correction');
    }

    const correction = await this.loadOwnedCorrection(tenant, correctionId);

    // Checked before the status gate below so a genuine retry of a
    // request that already succeeded (same key, same body, arriving
    // after the correction has moved to EXECUTED) replays the original
    // result instead of a spurious 409 — the same "idempotency first"
    // ordering PaymentsService.record already establishes.
    const requestFingerprint = computeExecuteFingerprint(correctionId, dto);
    const replay = await this.checkIdempotentReplay(tenant.membershipId, idempotencyKey, requestFingerprint);
    if (replay) {
      return replay;
    }

    if (correction.status !== TransactionCorrectionStatus.APPROVED) {
      throw new ConflictException({ code: 'CORRECTION_STATE_INVALID', message: 'Only an approved correction can be executed.' });
    }

    if (correction.returnMethod === PaymentMethod.CASH) {
      const cashPolicyMode = await this.cashSessionsService.resolveCashPolicyMode(tenant.organizationId, correction.branchId);
      if (cashPolicyMode === 'REQUIRED' && !dto.cashSessionId) {
        throw new BadRequestException(
          "This branch's cash policy is REQUIRED — a cashSessionId is required to execute a CASH refund.",
        );
      }
    } else if (dto.cashSessionId) {
      throw new BadRequestException('cashSessionId is only meaningful for a CASH return method');
    }

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
      const reference = generateReference(REFERENCE_PREFIX_BY_TYPE[correction.correctionType]);
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const lockedCorrection = await this.lockCorrection(tx, correctionId);
          if (lockedCorrection.status !== TransactionCorrectionStatus.APPROVED) {
            throw new ConflictException({ code: 'CORRECTION_STATE_INVALID', message: 'Only an approved correction can be executed.' });
          }

          // Lock the ORIGINAL sale transaction first — the aggregate
          // root every concurrent execution against this sale must
          // serialize on, before any remaining-refundable amount is
          // computed.
          await tx.$queryRaw`SELECT id FROM transactions WHERE id = ${lockedCorrection.originalTransactionId}::uuid FOR UPDATE`;
          const originalTransaction = await tx.transaction.findUniqueOrThrow({ where: { id: lockedCorrection.originalTransactionId } });
          const originalLineItems = await tx.transactionLineItem.findMany({ where: { transactionId: originalTransaction.id } });
          const originalLineItemsById = new Map(originalLineItems.map((item) => [item.id, item]));

          const correctionItems = await tx.transactionCorrectionItem.findMany({
            where: { correctionId },
            orderBy: { createdAt: 'asc' },
          });

          const otherExecuted = await tx.transactionCorrection.findMany({
            where: {
              organizationId: tenant.organizationId,
              originalTransactionId: originalTransaction.id,
              status: TransactionCorrectionStatus.EXECUTED,
              id: { not: correctionId },
            },
            include: { items: true },
          });

          if (lockedCorrection.correctionType === TransactionCorrectionType.REVERSAL && otherExecuted.length > 0) {
            throw new ConflictException({
              code: 'CORRECTION_ALREADY_EXECUTED',
              message: 'A refund or reversal has already been executed against this transaction.',
            });
          }

          const executedByLine = new Map<string, number>();
          for (const executedCorrection of otherExecuted) {
            for (const item of executedCorrection.items) {
              executedByLine.set(
                item.originalTransactionLineItemId,
                (executedByLine.get(item.originalTransactionLineItemId) ?? 0) + item.requestedAmountMinor,
              );
            }
          }

          for (const item of correctionItems) {
            const originalLine = originalLineItemsById.get(item.originalTransactionLineItemId);
            if (!originalLine) {
              throw new ConflictException('An original line item referenced by this correction no longer exists');
            }
            const alreadyExecuted = executedByLine.get(item.originalTransactionLineItemId) ?? 0;
            if (alreadyExecuted + item.requestedAmountMinor > originalLine.priceMinorSnapshot) {
              throw new ConflictException({
                code: 'CORRECTION_EXCEEDS_REMAINING_REFUNDABLE',
                message: 'This correction would exceed the remaining refundable amount for one or more lines.',
              });
            }
          }

          const correctiveLineItemsData = correctionItems.map((item, index) => {
            const originalLine = originalLineItemsById.get(item.originalTransactionLineItemId)!;
            return {
              organizationId: tenant.organizationId,
              serviceSessionItemId: originalLine.serviceSessionItemId,
              serviceId: originalLine.serviceId,
              staffProfileId: originalLine.staffProfileId,
              serviceNameSnapshot: originalLine.serviceNameSnapshot,
              durationMinutesSnapshot: originalLine.durationMinutesSnapshot,
              priceMinorSnapshot: item.requestedAmountMinor,
              currencySnapshot: originalLine.currencySnapshot,
              displayOrder: index,
            };
          });
          const subtotalMinor = sumMinorAmounts(
            correctiveLineItemsData.map((item) => item.priceMinorSnapshot),
            'corrective transaction subtotal',
          );
          const kind = lockedCorrection.correctionType === TransactionCorrectionType.REVERSAL ? TransactionKind.REVERSAL : TransactionKind.REFUND;

          const correctiveTransaction = await tx.transaction.create({
            data: {
              organizationId: tenant.organizationId,
              branchId: originalTransaction.branchId,
              customerRecordId: originalTransaction.customerRecordId,
              assignedStaffProfileId: originalTransaction.assignedStaffProfileId,
              reference,
              kind,
              correctedTransactionId: originalTransaction.id,
              currency: originalTransaction.currency,
              subtotalMinor,
              adjustmentTotalMinor: 0,
              totalMinor: subtotalMinor,
              items: { create: correctiveLineItemsData },
            },
            include: transactionViewInclude,
          });

          const sortedCorrectiveItems = correctiveTransaction.items.slice().sort((a, b) => a.displayOrder - b.displayOrder);
          const pairings = sortedCorrectiveItems.map((correctiveLineItem, index) => ({
            correctiveLineItem,
            originalTransactionLineItemId: correctionItems[index].originalTransactionLineItemId,
            originalLineAmountMinor: originalLineItemsById.get(correctionItems[index].originalTransactionLineItemId)!.priceMinorSnapshot,
          }));
          const accrualKind = kind === TransactionKind.REVERSAL ? CommissionAccrualKind.REVERSED : CommissionAccrualKind.REFUNDED;
          await this.commissionAdjustmentService.adjustForCorrection(tx, correctiveTransaction, pairings, accrualKind, actor);

          let remainingRefundableMinor: number | null = null;
          if (kind === TransactionKind.REFUND) {
            let totalRemaining = 0;
            for (const originalLine of originalLineItems) {
              const thisCorrectionAmount =
                correctionItems.find((item) => item.originalTransactionLineItemId === originalLine.id)?.requestedAmountMinor ?? 0;
              const alreadyExecuted = executedByLine.get(originalLine.id) ?? 0;
              totalRemaining += Math.max(originalLine.priceMinorSnapshot - alreadyExecuted - thisCorrectionAmount, 0);
            }
            remainingRefundableMinor = totalRemaining;
          }

          const originalReceipt = await tx.receipt.findUniqueOrThrow({ where: { transactionId: originalTransaction.id } });
          await this.receiptService.issueCorrectiveReceipt(
            tx,
            correctiveTransaction,
            sortedCorrectiveItems,
            {
              originalReceiptId: originalReceipt.id,
              correctionReason: lockedCorrection.reason,
              returnMethod: lockedCorrection.returnMethod,
              remainingRefundableMinor,
            },
            actor,
          );

          if (lockedCorrection.returnMethod === PaymentMethod.CASH && dto.cashSessionId) {
            await this.cashSessionsService.recordRefundPaidEntry(tx, tenant, dto.cashSessionId, {
              branchId: originalTransaction.branchId,
              currency: originalTransaction.currency,
              correctiveTransactionId: correctiveTransaction.id,
              amountMinor: correctiveTransaction.totalMinor,
            });
          }

          await tx.transactionCorrectionPayment.create({
            data: {
              organizationId: tenant.organizationId,
              correctionId,
              method: lockedCorrection.returnMethod,
              amountMinor: correctiveTransaction.totalMinor,
            },
          });

          const settled = await tx.transactionCorrection.updateMany({
            where: { id: correctionId, status: TransactionCorrectionStatus.APPROVED, version: lockedCorrection.version },
            data: {
              status: TransactionCorrectionStatus.EXECUTED,
              executedByMembershipId: tenant.membershipId,
              executedAt: new Date(),
              correctiveTransactionId: correctiveTransaction.id,
              version: { increment: 1 },
            },
          });
          if (settled.count === 0) {
            throw new ConflictException('This correction was already updated by someone else');
          }

          await tx.transactionCorrectionStatusHistory.create({
            data: {
              organizationId: tenant.organizationId,
              correctionId,
              previousStatus: TransactionCorrectionStatus.APPROVED,
              newStatus: TransactionCorrectionStatus.EXECUTED,
              actorUserId: tenant.userId,
              actorMembershipId: tenant.membershipId,
            },
          });

          await tx.financialIdempotencyKey.create({
            data: {
              organizationId: tenant.organizationId,
              membershipId: tenant.membershipId,
              operation: FinancialIdempotencyOperation.EXECUTE_CORRECTION,
              idempotencyKey,
              requestFingerprint,
              resourceType: 'transaction_correction',
              resourceId: correctionId,
            },
          });

          await this.auditService.record(
            {
              organizationId: tenant.organizationId,
              branchId: originalTransaction.branchId,
              actorUserId: tenant.userId,
              actorMembershipId: tenant.membershipId,
              action: 'correction.executed',
              entityType: 'transaction_correction',
              entityId: correctionId,
              requestId: actor.requestId,
              source: 'corrections',
              newState: { correctiveTransactionId: correctiveTransaction.id, totalMinor: correctiveTransaction.totalMinor, kind },
            },
            tx,
          );

          return tx.transactionCorrection.findUniqueOrThrow({ where: { id: correctionId }, include: transactionCorrectionViewInclude });
        });

        return toTransactionCorrectionView(result);
      } catch (error) {
        if (isUniqueConstraintViolation(error, REFERENCE_UNIQUE_CONSTRAINT)) {
          continue;
        }
        if (isUniqueConstraintViolation(error, IDEMPOTENCY_UNIQUE_CONSTRAINT)) {
          const raced = await this.checkIdempotentReplay(tenant.membershipId, idempotencyKey, requestFingerprint);
          if (raced) {
            return raced;
          }
        }
        // A genuine concurrent retry of this exact request (same key,
        // same body) may lose the race for the correction's own row —
        // one more replay check before surfacing what would otherwise
        // look like a transient failure to a caller who did nothing
        // wrong.
        const raced = await this.checkIdempotentReplay(tenant.membershipId, idempotencyKey, requestFingerprint);
        if (raced) {
          return raced;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a unique transaction reference. Please try again.');
  }

  private async lockCorrection(tx: TransactionClient, correctionId: string): Promise<TransactionCorrection> {
    await tx.$queryRaw`SELECT id FROM transaction_corrections WHERE id = ${correctionId}::uuid FOR UPDATE`;
    return tx.transactionCorrection.findUniqueOrThrow({ where: { id: correctionId } });
  }

  private async loadOwnedCorrection(tenant: TenantContext, correctionId: string) {
    const correction = await this.prisma.transactionCorrection.findFirst({
      where: { id: correctionId, organizationId: tenant.organizationId },
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
          operation: FinancialIdempotencyOperation.EXECUTE_CORRECTION,
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

function computeExecuteFingerprint(correctionId: string, dto: ExecuteCorrectionDto): string {
  const canonical = JSON.stringify({ correctionId, cashSessionId: dto.cashSessionId ?? null });
  return createHash('sha256').update(canonical).digest('hex');
}
