import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import { generateReference } from '../../common/identity/generate-reference.util.js';
import { assertSafeMoneyAmount, sumMinorAmounts } from '../../common/money/assert-safe-money-amount.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CashPolicyMode,
  CheckoutStatus,
  FinancialIdempotencyOperation,
  PaymentMethod,
  PaymentRecordStatus,
  PaymentVerificationAction,
} from '../../generated/prisma/client.js';
import type { PaymentRecord } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { CashSessionsService } from '../cash/cash-sessions.service.js';
import { CheckoutSettlementService } from './checkout-settlement.service.js';
import type { RecordPaymentDto } from './dto/record-payment.dto.js';
import type { VoidPaymentDto } from './dto/void-payment.dto.js';
import { toPaymentRecordView, type PaymentRecordView } from './payment-record-view.js';

const REFERENCE_PREFIX = 'PAY';
const MAX_REFERENCE_ATTEMPTS = 5;
const IDEMPOTENCY_UNIQUE_CONSTRAINT = 'financial_idempotency_keys_membership_id_operation_idempote_key';
const REFERENCE_UNIQUE_CONSTRAINT = 'payment_records_reference_key';
const OPEN_CHECKOUT_STATUSES: readonly CheckoutStatus[] = [
  CheckoutStatus.OPEN,
  CheckoutStatus.AWAITING_VERIFICATION,
  CheckoutStatus.DISPUTED,
];

/**
 * Phase 2 of the financial-integrity stage: recording a staff member's
 * *claim* that money changed hands against an open Checkout — never
 * itself verified revenue (see PaymentVerificationsService for the
 * confirm/dispute step that a claim must still pass, and
 * CheckoutSettlementService for how a Checkout becomes SETTLED).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly checkoutSettlement: CheckoutSettlementService,
    private readonly cashSessionsService: CashSessionsService,
  ) {}

  async listForCheckout(tenant: TenantContext, checkoutId: string): Promise<PaymentRecordView[]> {
    const checkout = await this.prisma.checkout.findFirst({
      where: { id: checkoutId, organizationId: tenant.organizationId },
    });
    if (!checkout) {
      throw new NotFoundException('Checkout not found');
    }
    assertMembershipHasBranchAccess(tenant, checkout.branchId);

    const payments = await this.prisma.paymentRecord.findMany({
      where: { checkoutId },
      orderBy: { recordedAt: 'asc' },
    });
    return payments.map(toPaymentRecordView);
  }

  async record(
    tenant: TenantContext,
    checkoutId: string,
    dto: RecordPaymentDto,
    idempotencyKey: string | undefined,
    requestId: string,
  ): Promise<PaymentRecordView> {
    if (!idempotencyKey) {
      throw new BadRequestException('An Idempotency-Key header is required to record a payment');
    }

    const checkout = await this.prisma.checkout.findFirst({
      where: { id: checkoutId, organizationId: tenant.organizationId },
    });
    if (!checkout) {
      throw new NotFoundException('Checkout not found');
    }
    assertMembershipHasBranchAccess(tenant, checkout.branchId);

    if (dto.currency !== checkout.currency) {
      throw new BadRequestException('The payment currency must match the checkout currency');
    }
    assertSafeMoneyAmount(dto.appliedAmountMinor, 'appliedAmountMinor', { min: 1 });
    if (dto.tenderedAmountMinor !== undefined) {
      if (dto.method !== PaymentMethod.CASH) {
        throw new BadRequestException('tenderedAmountMinor is only meaningful for a CASH payment');
      }
      assertSafeMoneyAmount(dto.tenderedAmountMinor, 'tenderedAmountMinor', { min: 1 });
      if (dto.tenderedAmountMinor < dto.appliedAmountMinor) {
        throw new BadRequestException('tenderedAmountMinor cannot be less than appliedAmountMinor');
      }
    }

    if (dto.method === PaymentMethod.CASH) {
      const cashPolicyMode = await this.cashSessionsService.resolveCashPolicyMode(tenant.organizationId, checkout.branchId);
      if (cashPolicyMode === CashPolicyMode.REQUIRED && !dto.cashSessionId) {
        throw new BadRequestException(
          "This branch's cash policy is REQUIRED — a cashSessionId is required to record a CASH payment.",
        );
      }
    } else if (dto.cashSessionId) {
      throw new BadRequestException('cashSessionId is only meaningful for a CASH payment');
    }

    const requestFingerprint = computeRecordPaymentFingerprint(checkoutId, dto);
    const replay = await this.checkIdempotentReplay(tenant.membershipId, idempotencyKey, requestFingerprint);
    if (replay) {
      return replay;
    }

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
      const reference = generateReference(REFERENCE_PREFIX);
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const lockedCheckout = await this.checkoutSettlement.lockCheckout(tx, checkoutId);
          if (lockedCheckout.status === CheckoutStatus.SETTLED) {
            throw new ConflictException({
              code: 'CHECKOUT_ALREADY_SETTLED',
              message: 'This checkout has already been settled.',
            });
          }
          if (!OPEN_CHECKOUT_STATUSES.includes(lockedCheckout.status)) {
            throw new ConflictException({
              code: 'CHECKOUT_STATE_INVALID',
              message: 'This checkout can no longer accept payments.',
            });
          }

          const activePayments = await tx.paymentRecord.findMany({
            where: { checkoutId, status: { not: PaymentRecordStatus.VOIDED } },
          });
          const activeTotal = sumMinorAmounts(
            activePayments.map((payment) => payment.appliedAmountMinor),
            'combined active applied payments',
          );
          if (activeTotal + dto.appliedAmountMinor > lockedCheckout.totalMinor) {
            throw new ConflictException({
              code: 'CHECKOUT_BALANCE_EXCEEDED',
              message: 'This payment would exceed the checkout total.',
            });
          }

          // Every checkout this flow can settle already has an operator
          // (Checkout.assignedStaffProfileId is nullable only pre-
          // settlement) — this is the last gate before that value
          // becomes PaymentRecord.confirmationRequiredByStaffProfileId,
          // which stays a required column on purpose, matching
          // TransactionPostingService's own guard for the same reason.
          if (!lockedCheckout.assignedStaffProfileId) {
            throw new ConflictException({
              code: 'CHECKOUT_MISSING_OPERATOR',
              message: 'This checkout has no assigned staff member and cannot accept a payment requiring confirmation.',
            });
          }

          const record = await tx.paymentRecord.create({
            data: {
              organizationId: tenant.organizationId,
              branchId: lockedCheckout.branchId,
              checkoutId,
              reference,
              method: dto.method,
              appliedAmountMinor: dto.appliedAmountMinor,
              tenderedAmountMinor: dto.tenderedAmountMinor ?? null,
              currency: dto.currency,
              externalReference: dto.externalReference ?? null,
              note: dto.note ?? null,
              recordedByMembershipId: tenant.membershipId,
              confirmationRequiredByStaffProfileId: lockedCheckout.assignedStaffProfileId,
              recordedAt: new Date(),
            },
          });

          await tx.paymentVerificationEvent.create({
            data: {
              organizationId: tenant.organizationId,
              paymentRecordId: record.id,
              action: PaymentVerificationAction.RECORDED,
              previousStatus: null,
              newStatus: PaymentRecordStatus.RECORDED,
              actorUserId: tenant.userId,
              actorMembershipId: tenant.membershipId,
            },
          });

          // A CASH payment with a supplied session gets exactly one
          // PAYMENT_RECEIVED CashLedgerEntry, atomically alongside the
          // PaymentRecord itself — the Checkout lock is already held
          // above, and recordPaymentReceivedEntry takes the CashSession
          // lock second, preserving one global lock order everywhere in
          // the codebase (docs task Phase 1/2).
          if (dto.cashSessionId) {
            await this.cashSessionsService.recordPaymentReceivedEntry(tx, tenant, dto.cashSessionId, {
              branchId: lockedCheckout.branchId,
              currency: dto.currency,
              paymentRecordId: record.id,
              appliedAmountMinor: dto.appliedAmountMinor,
            });
          }

          await tx.financialIdempotencyKey.create({
            data: {
              organizationId: tenant.organizationId,
              membershipId: tenant.membershipId,
              operation: FinancialIdempotencyOperation.RECORD_PAYMENT,
              idempotencyKey,
              requestFingerprint,
              resourceType: 'payment_record',
              resourceId: record.id,
            },
          });

          await this.auditService.record(
            {
              organizationId: tenant.organizationId,
              branchId: lockedCheckout.branchId,
              actorUserId: tenant.userId,
              actorMembershipId: tenant.membershipId,
              action: 'payment.recorded',
              entityType: 'payment_record',
              entityId: record.id,
              requestId,
              source: 'payments',
              newState: { status: PaymentRecordStatus.RECORDED, appliedAmountMinor: record.appliedAmountMinor, method: record.method },
            },
            tx,
          );

          await this.checkoutSettlement.recalculate(tx, lockedCheckout, {
            organizationId: tenant.organizationId,
            userId: tenant.userId,
            membershipId: tenant.membershipId,
            requestId,
          });

          return record;
        });

        return toPaymentRecordView(created);
      } catch (error) {
        if (isUniqueConstraintViolation(error, IDEMPOTENCY_UNIQUE_CONSTRAINT)) {
          const raced = await this.checkIdempotentReplay(tenant.membershipId, idempotencyKey, requestFingerprint);
          if (raced) {
            return raced;
          }
        }
        if (isUniqueConstraintViolation(error, REFERENCE_UNIQUE_CONSTRAINT)) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a unique payment reference. Please try again.');
  }

  async void(tenant: TenantContext, paymentId: string, dto: VoidPaymentDto, requestId: string): Promise<PaymentRecordView> {
    const payment = await this.loadOwnedPayment(tenant, paymentId);

    if (payment.status !== PaymentRecordStatus.RECORDED) {
      throw new ConflictException({
        code: 'PAYMENT_STATE_INVALID',
        message: 'Only a payment still awaiting confirmation can be voided.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedCheckout = await this.checkoutSettlement.lockCheckout(tx, payment.checkoutId);
      const fresh = await tx.paymentRecord.findUniqueOrThrow({ where: { id: paymentId } });
      if (fresh.status !== PaymentRecordStatus.RECORDED) {
        throw new ConflictException({
          code: 'PAYMENT_STATE_INVALID',
          message: 'Only a payment still awaiting confirmation can be voided.',
        });
      }

      const result = await tx.paymentRecord.updateMany({
        where: { id: paymentId, version: fresh.version },
        data: {
          status: PaymentRecordStatus.VOIDED,
          voidedAt: new Date(),
          voidedByMembershipId: tenant.membershipId,
          voidReason: dto.reason,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('This payment was already updated by someone else');
      }

      await tx.paymentVerificationEvent.create({
        data: {
          organizationId: tenant.organizationId,
          paymentRecordId: paymentId,
          action: PaymentVerificationAction.VOIDED,
          previousStatus: PaymentRecordStatus.RECORDED,
          newStatus: PaymentRecordStatus.VOIDED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          reason: dto.reason,
        },
      });

      await this.auditService.record(
        {
          organizationId: tenant.organizationId,
          branchId: payment.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: 'payment.voided',
          entityType: 'payment_record',
          entityId: paymentId,
          requestId,
          source: 'payments',
          previousState: { status: PaymentRecordStatus.RECORDED },
          newState: { status: PaymentRecordStatus.VOIDED, reason: dto.reason },
        },
        tx,
      );

      await this.checkoutSettlement.recalculate(tx, lockedCheckout, {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        membershipId: tenant.membershipId,
        requestId,
      });

      return tx.paymentRecord.findUniqueOrThrow({ where: { id: paymentId } });
    });

    return toPaymentRecordView(updated);
  }

  async loadOwnedPayment(tenant: TenantContext, paymentId: string): Promise<PaymentRecord> {
    const payment = await this.prisma.paymentRecord.findFirst({
      where: { id: paymentId, organizationId: tenant.organizationId },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    assertMembershipHasBranchAccess(tenant, payment.branchId);
    return payment;
  }

  private async checkIdempotentReplay(
    membershipId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<PaymentRecordView | null> {
    const existingKey = await this.prisma.financialIdempotencyKey.findUnique({
      where: {
        membershipId_operation_idempotencyKey: {
          membershipId,
          operation: FinancialIdempotencyOperation.RECORD_PAYMENT,
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
    const existingPayment = await this.prisma.paymentRecord.findUnique({ where: { id: existingKey.resourceId } });
    return existingPayment ? toPaymentRecordView(existingPayment) : null;
  }
}

function computeRecordPaymentFingerprint(checkoutId: string, dto: RecordPaymentDto): string {
  const canonical = JSON.stringify({
    checkoutId,
    method: dto.method,
    appliedAmountMinor: dto.appliedAmountMinor,
    tenderedAmountMinor: dto.tenderedAmountMinor ?? null,
    currency: dto.currency,
    externalReference: dto.externalReference ?? null,
    note: dto.note ?? null,
    cashSessionId: dto.cashSessionId ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
