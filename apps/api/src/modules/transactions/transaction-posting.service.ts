import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import { generateReference } from '../../common/identity/generate-reference.util.js';
import { sumMinorAmounts } from '../../common/money/assert-safe-money-amount.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CheckoutStatus, PaymentRecordStatus } from '../../generated/prisma/client.js';
import type { Checkout, Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { CommissionAccrualService } from '../commissions/commission-accrual.service.js';
import { ReceiptService } from '../receipts/receipt.service.js';
import { transactionViewInclude, toTransactionView, type TransactionView } from './transaction-view.js';

type TransactionClient = Prisma.TransactionClient;

const REFERENCE_PREFIX = 'TXN';
const MAX_REFERENCE_ATTEMPTS = 5;

export interface PostTransactionActor {
  organizationId: string;
  userId: string;
  membershipId: string;
  requestId: string;
}

/**
 * Posts exactly one immutable Transaction for a Checkout whose confirmed
 * payments now exactly cover its total (docs task Phase 4). Never called
 * from a controller directly — only from CheckoutSettlementService
 * (modules/payments), which has already taken a `SELECT ... FOR UPDATE`
 * lock on the Checkout row inside `tx` before calling this, so exactly
 * one concurrent caller can ever reach this method for a given Checkout
 * at a time (docs task: "Lock the Checkout before calculating confirmed
 * totals" / "Concurrent confirmations must produce exactly one
 * Transaction"). The unique-constraint catch below is defense-in-depth
 * only, not the primary exclusivity mechanism.
 */
@Injectable()
export class TransactionPostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly commissionAccrualService: CommissionAccrualService,
    private readonly receiptService: ReceiptService,
  ) {}

  async postForCheckout(
    tx: TransactionClient,
    checkout: Checkout,
    actor: PostTransactionActor,
  ): Promise<TransactionView> {
    if (checkout.status === CheckoutStatus.SETTLED) {
      const existing = await tx.transaction.findUnique({
        where: { checkoutId: checkout.id },
        include: transactionViewInclude,
      });
      if (existing) {
        return toTransactionView(existing);
      }
    }

    const confirmedPayments = await tx.paymentRecord.findMany({
      where: { checkoutId: checkout.id, status: PaymentRecordStatus.CONFIRMED },
    });
    const confirmedTotal = sumMinorAmounts(
      confirmedPayments.map((payment) => payment.appliedAmountMinor),
      'confirmed applied payments',
    );
    if (confirmedTotal !== checkout.totalMinor) {
      // Defensive only — CheckoutSettlementService never calls this
      // method unless deriveCheckoutSettlement already returned
      // READY_TO_SETTLE against the very same locked snapshot.
      throw new InternalServerErrorException('Checkout is not ready to settle');
    }

    const lineItems = await tx.checkoutLineItem.findMany({ where: { checkoutId: checkout.id } });

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
      const reference = generateReference(REFERENCE_PREFIX);
      try {
        const created = await tx.transaction.create({
          data: {
            organizationId: checkout.organizationId,
            branchId: checkout.branchId,
            checkoutId: checkout.id,
            serviceSessionId: checkout.serviceSessionId,
            customerRecordId: checkout.customerRecordId,
            assignedStaffProfileId: checkout.assignedStaffProfileId,
            reference,
            currency: checkout.currency,
            subtotalMinor: checkout.subtotalMinor,
            adjustmentTotalMinor: checkout.adjustmentTotalMinor,
            totalMinor: checkout.totalMinor,
            items: {
              create: lineItems.map((item) => ({
                organizationId: checkout.organizationId,
                serviceSessionItemId: item.serviceSessionItemId,
                serviceId: item.serviceId,
                staffProfileId: item.staffProfileId,
                serviceNameSnapshot: item.serviceNameSnapshot,
                durationMinutesSnapshot: item.durationMinutesSnapshot,
                priceMinorSnapshot: item.priceMinorSnapshot,
                currencySnapshot: item.currencySnapshot,
                displayOrder: item.displayOrder,
              })),
            },
            allocations: {
              create: confirmedPayments.map((payment) => ({
                organizationId: checkout.organizationId,
                paymentRecordId: payment.id,
                appliedAmountMinor: payment.appliedAmountMinor,
              })),
            },
          },
          include: transactionViewInclude,
        });

        // Commission accrual and receipt issuance run inside this same
        // database transaction, immediately after the Transaction itself
        // is created — if either throws, the whole `tx` (Transaction,
        // its line items and allocations, and the pending Checkout
        // settle update below) rolls back together (docs task Phase 2:
        // "If accrual creation unexpectedly fails, Transaction posting
        // must roll back"). Both are internally idempotent against a
        // retry of this same call (see their own header comments), which
        // is what lets `ensureDerivedRecords` reuse them verbatim.
        await this.commissionAccrualService.accrueForTransaction(tx, created, created.items, actor);
        await this.receiptService.issueForTransaction(tx, created, created.items, confirmedPayments, actor);

        const settleResult = await tx.checkout.updateMany({
          where: { id: checkout.id, version: checkout.version },
          data: { status: CheckoutStatus.SETTLED, settledAt: new Date(), version: { increment: 1 } },
        });
        if (settleResult.count === 0) {
          throw new ConflictException('This checkout was already updated by someone else');
        }

        await this.auditService.record(
          {
            organizationId: checkout.organizationId,
            branchId: checkout.branchId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'transaction.posted',
            entityType: 'transaction',
            entityId: created.id,
            requestId: actor.requestId,
            source: 'transactions',
            newState: { checkoutId: checkout.id, totalMinor: created.totalMinor, reference: created.reference },
          },
          tx,
        );

        return toTransactionView(created);
      } catch (error) {
        if (isUniqueConstraintViolation(error, 'transactions_checkout_id_key')) {
          const existing = await tx.transaction.findUnique({
            where: { checkoutId: checkout.id },
            include: transactionViewInclude,
          });
          if (existing) {
            return toTransactionView(existing);
          }
        }
        if (isUniqueConstraintViolation(error, 'transactions_reference_key')) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a unique transaction reference. Please try again.');
  }

  /**
   * Internal repair path — never exposed through any controller or
   * unauthenticated route (docs task Phase 2: "must not be exposed as
   * an unauthenticated or arbitrary public backfill endpoint"). Safe to
   * call any number of times for the same `transactionId`: both
   * `CommissionAccrualService.accrueForTransaction` and
   * `ReceiptService.issueForTransaction` are themselves idempotent (they
   * check what already exists before creating anything), so this simply
   * re-runs the same derivation the original posting attempt did and
   * fills in whatever is still missing — nothing more. `actor` is
   * supplied by the caller (an internal ops tool or test), since a
   * repair has no HTTP request of its own to attribute one from.
   */
  async ensureDerivedRecords(transactionId: string, actor: PostTransactionActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: transactionViewInclude,
      });
      const confirmedPayments = await tx.paymentRecord.findMany({
        where: { checkoutId: transaction.checkoutId, status: PaymentRecordStatus.CONFIRMED },
      });

      await this.commissionAccrualService.accrueForTransaction(tx, transaction, transaction.items, actor);
      await this.receiptService.issueForTransaction(tx, transaction, transaction.items, confirmedPayments, actor);
    });
  }
}
