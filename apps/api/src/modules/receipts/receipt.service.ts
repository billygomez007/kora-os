import { ConflictException, Injectable } from '@nestjs/common';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import { utcToLocalDate } from '../../common/scheduling/local-time.util.js';
import { ReceiptKind } from '../../generated/prisma/client.js';
import type {
  PaymentMethod,
  PaymentRecord,
  Prisma,
  Transaction as TransactionModel,
  TransactionLineItem,
} from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { formatReceiptNumber } from './receipt-number.util.js';
import {
  receiptViewInclude,
  toReceiptView,
  type ReceiptView,
} from './receipt-view.js';

type TransactionClient = Prisma.TransactionClient;

const MAX_SEQUENCE_ATTEMPTS = 5;
const WALK_IN_CUSTOMER_NAME = 'Walk-in customer';

export interface ReceiptActor {
  organizationId: string;
  userId: string;
  membershipId: string;
  requestId: string;
}

/**
 * Issues exactly one immutable Receipt for a POSTED Transaction (docs
 * task Phase 3) — never called from a controller directly, only from
 * TransactionPostingService, inside the same database transaction that
 * posts the Transaction and creates its CommissionAccrual rows. Every
 * business/branch/customer/line/payment value is a snapshot taken here,
 * atomically, never a later live read of a mutable row.
 *
 * `issueForTransaction` is idempotent — it checks for an existing
 * receipt for this transaction first — so it also serves as
 * TransactionPostingService.ensureDerivedRecords' repair path with no
 * separate code to keep in sync.
 */
@Injectable()
export class ReceiptService {
  constructor(private readonly auditService: AuditService) {}

  async issueForTransaction(
    tx: TransactionClient,
    transaction: TransactionModel,
    lineItems: readonly TransactionLineItem[],
    confirmedPayments: readonly PaymentRecord[],
    actor: ReceiptActor,
  ): Promise<ReceiptView> {
    const existing = await tx.receipt.findUnique({
      where: { transactionId: transaction.id },
      include: receiptViewInclude,
    });
    if (existing) {
      return toReceiptView(existing);
    }

    const [organization, branch, customerRecord] = await Promise.all([
      tx.organization.findUniqueOrThrow({
        where: { id: transaction.organizationId },
      }),
      tx.branch.findUniqueOrThrow({ where: { id: transaction.branchId } }),
      transaction.customerRecordId
        ? tx.customerRecord.findUniqueOrThrow({
            where: { id: transaction.customerRecordId },
          })
        : null,
    ]);

    // The branch's own local calendar year at posting time, matching
    // every other branch-local-date convention in this codebase
    // (queue ticket numbering, business-hours resolution) — a receipt
    // issued at 23:58 branch-local on 31 December belongs to that year,
    // not whatever UTC's clock says.
    const branchLocalDate = utcToLocalDate(
      transaction.postedAt,
      branch.timeZone,
    );
    const year = Number(branchLocalDate.slice(0, 4));
    const branchAddress = formatBranchAddress(branch);

    for (let attempt = 0; attempt < MAX_SEQUENCE_ATTEMPTS; attempt += 1) {
      const sequenceRow = await tx.branchReceiptSequence.upsert({
        where: {
          organizationId_branchId_year: {
            organizationId: transaction.organizationId,
            branchId: transaction.branchId,
            year,
          },
        },
        update: { lastSequence: { increment: 1 } },
        create: {
          organizationId: transaction.organizationId,
          branchId: transaction.branchId,
          year,
          lastSequence: 1,
        },
      });
      const receiptNumber = formatReceiptNumber(
        branch.code,
        year,
        sequenceRow.lastSequence,
      );

      try {
        const created = await tx.receipt.create({
          data: {
            organizationId: transaction.organizationId,
            branchId: transaction.branchId,
            branchReceiptSequenceId: sequenceRow.id,
            transactionId: transaction.id,
            customerRecordId: transaction.customerRecordId,
            receiptNumber,
            sequenceNumber: sequenceRow.lastSequence,
            businessNameSnapshot: organization.name,
            branchNameSnapshot: branch.name,
            branchPhoneSnapshot: branch.phone,
            branchAddressSnapshot: branchAddress,
            customerNameSnapshot: customerRecord?.name ?? WALK_IN_CUSTOMER_NAME,
            currency: transaction.currency,
            subtotalMinorSnapshot: transaction.subtotalMinor,
            adjustmentTotalMinorSnapshot: transaction.adjustmentTotalMinor,
            totalMinorSnapshot: transaction.totalMinor,
            issuedByMembershipId: actor.membershipId,
            lineItems: {
              create: lineItems.map((item) => ({
                organizationId: transaction.organizationId,
                transactionLineItemId: item.id,
                kind: item.kind,
                serviceNameSnapshot: item.serviceNameSnapshot,
                productNameSnapshot: item.productNameSnapshot,
                variantNameSnapshot: item.variantNameSnapshot,
                skuSnapshot: item.skuSnapshot,
                barcodeSnapshot: item.barcodeSnapshot,
                quantity: item.quantity,
                unitPriceMinorSnapshot: item.unitPriceMinorSnapshot,
                lineTotalMinorSnapshot: item.priceMinorSnapshot,
                currencySnapshot: item.currencySnapshot,
                displayOrder: item.displayOrder,
              })),
            },
            paymentSummaries: {
              create: confirmedPayments.map((payment) => ({
                organizationId: transaction.organizationId,
                method: payment.method,
                amountMinorSnapshot: payment.appliedAmountMinor,
                currencySnapshot: payment.currency,
                safeReferenceSnapshot: payment.externalReference,
              })),
            },
          },
          include: receiptViewInclude,
        });

        await this.auditService.record(
          {
            organizationId: transaction.organizationId,
            branchId: transaction.branchId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'receipt.issued',
            entityType: 'receipt',
            entityId: created.id,
            requestId: actor.requestId,
            source: 'receipts',
            newState: {
              transactionId: transaction.id,
              receiptNumber,
              totalMinor: created.totalMinorSnapshot,
            },
          },
          tx,
        );

        return toReceiptView(created);
      } catch (error) {
        if (isUniqueConstraintViolation(error, 'receipts_transaction_id_key')) {
          const raced = await tx.receipt.findUnique({
            where: { transactionId: transaction.id },
            include: receiptViewInclude,
          });
          if (raced) {
            return toReceiptView(raced);
          }
        }
        if (
          isUniqueConstraintViolation(
            error,
            'receipts_organization_id_receipt_number_key',
          )
        ) {
          // Only reachable if the atomic sequence counter itself was
          // somehow reused (it should never be) — retry with a freshly
          // incremented sequence rather than surfacing a raw conflict.
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Could not allocate a unique receipt number. Please try again.',
    );
  }

  /**
   * Issues exactly one immutable corrective document (REFUND_RECEIPT or
   * REVERSAL_RECORD) for a REFUND/REVERSAL Transaction — never a
   * statutory tax invoice or credit note (docs task Phase 5). Idempotent
   * the same way `issueForTransaction` is: checks for an existing
   * receipt for this transaction first. Reuses the same atomic
   * per-(branch, year) sequence as a sale receipt — corrective documents
   * share one continuous, gapless numbering series per branch, matching
   * how they already share one branch.
   */
  async issueCorrectiveReceipt(
    tx: TransactionClient,
    correctiveTransaction: TransactionModel,
    correctiveLineItems: readonly TransactionLineItem[],
    params: {
      originalReceiptId: string;
      correctionReason: string;
      returnMethod: PaymentMethod;
      remainingRefundableMinor: number | null;
    },
    actor: ReceiptActor,
  ): Promise<ReceiptView> {
    const existing = await tx.receipt.findUnique({
      where: { transactionId: correctiveTransaction.id },
      include: receiptViewInclude,
    });
    if (existing) {
      return toReceiptView(existing);
    }

    const [organization, branch, customerRecord] = await Promise.all([
      tx.organization.findUniqueOrThrow({
        where: { id: correctiveTransaction.organizationId },
      }),
      tx.branch.findUniqueOrThrow({
        where: { id: correctiveTransaction.branchId },
      }),
      correctiveTransaction.customerRecordId
        ? tx.customerRecord.findUniqueOrThrow({
            where: { id: correctiveTransaction.customerRecordId },
          })
        : null,
    ]);

    const branchLocalDate = utcToLocalDate(
      correctiveTransaction.postedAt,
      branch.timeZone,
    );
    const year = Number(branchLocalDate.slice(0, 4));
    const branchAddress = formatBranchAddress(branch);
    const kind =
      correctiveTransaction.kind === 'REVERSAL'
        ? ReceiptKind.REVERSAL_RECORD
        : ReceiptKind.REFUND_RECEIPT;

    for (let attempt = 0; attempt < MAX_SEQUENCE_ATTEMPTS; attempt += 1) {
      const sequenceRow = await tx.branchReceiptSequence.upsert({
        where: {
          organizationId_branchId_year: {
            organizationId: correctiveTransaction.organizationId,
            branchId: correctiveTransaction.branchId,
            year,
          },
        },
        update: { lastSequence: { increment: 1 } },
        create: {
          organizationId: correctiveTransaction.organizationId,
          branchId: correctiveTransaction.branchId,
          year,
          lastSequence: 1,
        },
      });
      const receiptNumber = formatReceiptNumber(
        branch.code,
        year,
        sequenceRow.lastSequence,
      );

      try {
        const created = await tx.receipt.create({
          data: {
            organizationId: correctiveTransaction.organizationId,
            branchId: correctiveTransaction.branchId,
            branchReceiptSequenceId: sequenceRow.id,
            transactionId: correctiveTransaction.id,
            customerRecordId: correctiveTransaction.customerRecordId,
            receiptNumber,
            sequenceNumber: sequenceRow.lastSequence,
            kind,
            originalReceiptId: params.originalReceiptId,
            correctionReason: params.correctionReason,
            remainingRefundableMinorSnapshot:
              kind === ReceiptKind.REFUND_RECEIPT
                ? params.remainingRefundableMinor
                : null,
            businessNameSnapshot: organization.name,
            branchNameSnapshot: branch.name,
            branchPhoneSnapshot: branch.phone,
            branchAddressSnapshot: branchAddress,
            customerNameSnapshot: customerRecord?.name ?? WALK_IN_CUSTOMER_NAME,
            currency: correctiveTransaction.currency,
            subtotalMinorSnapshot: correctiveTransaction.subtotalMinor,
            adjustmentTotalMinorSnapshot:
              correctiveTransaction.adjustmentTotalMinor,
            totalMinorSnapshot: correctiveTransaction.totalMinor,
            issuedByMembershipId: actor.membershipId,
            lineItems: {
              create: correctiveLineItems.map((item) => ({
                organizationId: correctiveTransaction.organizationId,
                transactionLineItemId: item.id,
                kind: item.kind,
                serviceNameSnapshot: item.serviceNameSnapshot,
                productNameSnapshot: item.productNameSnapshot,
                variantNameSnapshot: item.variantNameSnapshot,
                skuSnapshot: item.skuSnapshot,
                barcodeSnapshot: item.barcodeSnapshot,
                quantity: item.quantity,
                unitPriceMinorSnapshot: item.unitPriceMinorSnapshot,
                lineTotalMinorSnapshot: item.priceMinorSnapshot,
                currencySnapshot: item.currencySnapshot,
                displayOrder: item.displayOrder,
              })),
            },
            paymentSummaries: {
              create: [
                {
                  organizationId: correctiveTransaction.organizationId,
                  method: params.returnMethod,
                  amountMinorSnapshot: correctiveTransaction.totalMinor,
                  currencySnapshot: correctiveTransaction.currency,
                },
              ],
            },
          },
          include: receiptViewInclude,
        });

        await this.auditService.record(
          {
            organizationId: correctiveTransaction.organizationId,
            branchId: correctiveTransaction.branchId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'receipt.issued',
            entityType: 'receipt',
            entityId: created.id,
            requestId: actor.requestId,
            source: 'receipts',
            newState: {
              transactionId: correctiveTransaction.id,
              receiptNumber,
              kind,
              totalMinor: created.totalMinorSnapshot,
            },
          },
          tx,
        );

        return toReceiptView(created);
      } catch (error) {
        if (isUniqueConstraintViolation(error, 'receipts_transaction_id_key')) {
          const raced = await tx.receipt.findUnique({
            where: { transactionId: correctiveTransaction.id },
            include: receiptViewInclude,
          });
          if (raced) {
            return toReceiptView(raced);
          }
        }
        if (
          isUniqueConstraintViolation(
            error,
            'receipts_organization_id_receipt_number_key',
          )
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Could not allocate a unique receipt number. Please try again.',
    );
  }
}

/** A single formatted line combining whatever contact/location fields
 * the branch has set — never all of Branch's operational contact
 * details, only what is genuinely useful on a receipt (docs task Phase
 * 3: "safe contact/location details"). Returns null when the branch has
 * none of these set. */
function formatBranchAddress(branch: {
  addressLine: string | null;
  city: string | null;
  region: string | null;
}): string | null {
  const parts = [branch.addressLine, branch.city, branch.region].filter(
    (part): part is string => Boolean(part?.trim()),
  );
  return parts.length > 0 ? parts.join(', ') : null;
}
