-- Kora OS: Transaction correction workflow (docs task: "Cash Controls
-- and Reconciliation -> Refund/Correction Approval -> Immutable Refund or
-- Reversal Transaction -> Commission Adjustment -> Corrected Receipt and
-- Reporting"). The original SALE Transaction is never mutated or deleted;
-- a correction always posts a brand-new Transaction (kind REFUND or
-- REVERSAL) referencing it via corrected_transaction_id.
--
-- Existing Transaction rows are safely backfilled to kind = SALE by this
-- column's own ADD COLUMN ... DEFAULT clause (0 rows exist in this
-- environment at migration time, confirmed before writing this
-- migration). checkout_id/service_session_id become nullable because a
-- REFUND/REVERSAL Transaction has no checkout or service session of its
-- own.
--
-- The two DropIndex statements `prisma migrate diff` always proposes for
-- public_business_profiles_display_name_trgm_idx and
-- _search_keywords_trgm_idx (hand-written pg_trgm indexes not declared in
-- schema.prisma) have been removed from this file, exactly as in every
-- prior migration in this project.
--
-- The financial_idempotency_operation enum additions (REQUEST_CORRECTION,
-- EXECUTE_CORRECTION) are never used as a DEFAULT or in any DML within
-- this same migration, so PostgreSQL's "unsafe use of new value of enum
-- type in the same transaction it was added in" restriction does not
-- apply here.
--
-- Hand-added below the generated body: CHECK constraints enforcing the
-- SALE/correction column-shape invariants and the correction workflow's
-- terminal-state shape, matching this project's established convention.

-- CreateEnum
CREATE TYPE "transaction_kind" AS ENUM ('SALE', 'REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "commission_accrual_kind" AS ENUM ('EARNED', 'REFUNDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "receipt_kind" AS ENUM ('SALE_RECEIPT', 'REFUND_RECEIPT', 'REVERSAL_RECORD');

-- CreateEnum
CREATE TYPE "transaction_correction_type" AS ENUM ('REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "transaction_correction_status" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXECUTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "financial_idempotency_operation" ADD VALUE 'REQUEST_CORRECTION';
ALTER TYPE "financial_idempotency_operation" ADD VALUE 'EXECUTE_CORRECTION';

-- AlterTable
ALTER TABLE "commission_accruals" ADD COLUMN     "kind" "commission_accrual_kind" NOT NULL DEFAULT 'EARNED',
ADD COLUMN     "original_accrual_id" UUID;

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "correction_reason" TEXT,
ADD COLUMN     "kind" "receipt_kind" NOT NULL DEFAULT 'SALE_RECEIPT',
ADD COLUMN     "original_receipt_id" UUID,
ADD COLUMN     "remaining_refundable_minor_snapshot" INTEGER;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "corrected_transaction_id" UUID,
ADD COLUMN     "kind" "transaction_kind" NOT NULL DEFAULT 'SALE',
ALTER COLUMN "checkout_id" DROP NOT NULL,
ALTER COLUMN "service_session_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "transaction_corrections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "original_transaction_id" UUID NOT NULL,
    "correction_type" "transaction_correction_type" NOT NULL,
    "status" "transaction_correction_status" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "return_method" "payment_method" NOT NULL,
    "total_requested_minor" INTEGER NOT NULL,
    "requested_by_membership_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_membership_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejected_by_membership_id" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "cancelled_by_membership_id" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "executed_by_membership_id" UUID,
    "executed_at" TIMESTAMPTZ(6),
    "corrective_transaction_id" UUID,
    "solo_owner_override" BOOLEAN NOT NULL DEFAULT false,
    "solo_owner_override_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transaction_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_correction_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "original_transaction_line_item_id" UUID NOT NULL,
    "requested_amount_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_correction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_correction_payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "method" "payment_method" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "safe_reference_snapshot" TEXT,
    "original_payment_record_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_correction_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_correction_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "previous_status" "transaction_correction_status",
    "new_status" "transaction_correction_status" NOT NULL,
    "actor_user_id" UUID,
    "actor_membership_id" UUID,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_correction_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_corrections_corrective_transaction_id_key" ON "transaction_corrections"("corrective_transaction_id");

-- CreateIndex
CREATE INDEX "transaction_corrections_organization_id_original_transactio_idx" ON "transaction_corrections"("organization_id", "original_transaction_id", "status");

-- CreateIndex
CREATE INDEX "transaction_corrections_organization_id_branch_id_status_idx" ON "transaction_corrections"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "transaction_corrections_organization_id_requested_by_member_idx" ON "transaction_corrections"("organization_id", "requested_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_corrections_organization_id_id_key" ON "transaction_corrections"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_corrections_organization_id_corrective_transact_key" ON "transaction_corrections"("organization_id", "corrective_transaction_id");

-- CreateIndex
CREATE INDEX "transaction_correction_items_organization_id_original_trans_idx" ON "transaction_correction_items"("organization_id", "original_transaction_line_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_correction_items_correction_id_original_transac_key" ON "transaction_correction_items"("correction_id", "original_transaction_line_item_id");

-- CreateIndex
CREATE INDEX "transaction_correction_payments_correction_id_idx" ON "transaction_correction_payments"("correction_id");

-- CreateIndex
CREATE INDEX "transaction_correction_payments_organization_id_original_pa_idx" ON "transaction_correction_payments"("organization_id", "original_payment_record_id");

-- CreateIndex
CREATE INDEX "transaction_correction_status_history_correction_id_occurre_idx" ON "transaction_correction_status_history"("correction_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transaction_correction_status_history_organization_id_occur_idx" ON "transaction_correction_status_history"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "commission_accruals_organization_id_original_accrual_id_idx" ON "commission_accruals"("organization_id", "original_accrual_id");

-- CreateIndex
CREATE INDEX "receipts_organization_id_original_receipt_id_idx" ON "receipts"("organization_id", "original_receipt_id");

-- CreateIndex
CREATE INDEX "transactions_organization_id_corrected_transaction_id_idx" ON "transactions"("organization_id", "corrected_transaction_id");

-- CreateIndex
CREATE INDEX "transactions_organization_id_kind_posted_at_idx" ON "transactions"("organization_id", "kind", "posted_at");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_corrected_transaction_id_fkey" FOREIGN KEY ("organization_id", "corrected_transaction_id") REFERENCES "transactions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_organization_id_original_accrual_id_fkey" FOREIGN KEY ("organization_id", "original_accrual_id") REFERENCES "commission_accruals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_original_receipt_id_fkey" FOREIGN KEY ("organization_id", "original_receipt_id") REFERENCES "receipts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_organization_id_original_transacti_fkey" FOREIGN KEY ("organization_id", "original_transaction_id") REFERENCES "transactions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_organization_id_corrective_transac_fkey" FOREIGN KEY ("organization_id", "corrective_transaction_id") REFERENCES "transactions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_organization_id_requested_by_membe_fkey" FOREIGN KEY ("organization_id", "requested_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_organization_id_approved_by_member_fkey" FOREIGN KEY ("organization_id", "approved_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_organization_id_rejected_by_member_fkey" FOREIGN KEY ("organization_id", "rejected_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_organization_id_cancelled_by_membe_fkey" FOREIGN KEY ("organization_id", "cancelled_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_organization_id_executed_by_member_fkey" FOREIGN KEY ("organization_id", "executed_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_correction_items" ADD CONSTRAINT "transaction_correction_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_correction_items" ADD CONSTRAINT "transaction_correction_items_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "transaction_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_correction_items" ADD CONSTRAINT "transaction_correction_items_organization_id_original_tran_fkey" FOREIGN KEY ("organization_id", "original_transaction_line_item_id") REFERENCES "transaction_line_items"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_correction_payments" ADD CONSTRAINT "transaction_correction_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_correction_payments" ADD CONSTRAINT "transaction_correction_payments_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "transaction_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_correction_payments" ADD CONSTRAINT "transaction_correction_payments_organization_id_original_p_fkey" FOREIGN KEY ("organization_id", "original_payment_record_id") REFERENCES "payment_records"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_correction_status_history" ADD CONSTRAINT "transaction_correction_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_correction_status_history" ADD CONSTRAINT "transaction_correction_status_history_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "transaction_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_correction_status_history" ADD CONSTRAINT "transaction_correction_status_history_organization_id_acto_fkey" FOREIGN KEY ("organization_id", "actor_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- transactions: a SALE keeps requiring checkout/service-session and no
-- corrected-transaction reference; a REFUND/REVERSAL requires the
-- opposite, and never carries its own adjustment (docs task Phase 3:
-- "Store Transaction monetary values as non-negative magnitudes").
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_kind_shape" CHECK (
  ("kind" = 'SALE' AND "corrected_transaction_id" IS NULL AND "checkout_id" IS NOT NULL AND "service_session_id" IS NOT NULL)
  OR ("kind" != 'SALE' AND "corrected_transaction_id" IS NOT NULL AND "checkout_id" IS NULL AND "service_session_id" IS NULL)
);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_correction_has_no_adjustment" CHECK ("kind" = 'SALE' OR "adjustment_total_minor" = 0);

-- commission_accruals: an EARNED row has no original-accrual reference; a
-- REFUNDED/REVERSED adjustment always has one.
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_kind_shape" CHECK (
  ("kind" = 'EARNED' AND "original_accrual_id" IS NULL) OR ("kind" != 'EARNED' AND "original_accrual_id" IS NOT NULL)
);

-- receipts: a SALE_RECEIPT has no original-receipt reference or
-- correction reason; a corrective receipt always has both.
-- remaining-refundable is only ever set on a REFUND_RECEIPT, never
-- negative.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_kind_shape" CHECK (
  ("kind" = 'SALE_RECEIPT' AND "original_receipt_id" IS NULL AND "correction_reason" IS NULL)
  OR ("kind" != 'SALE_RECEIPT' AND "original_receipt_id" IS NOT NULL AND "correction_reason" IS NOT NULL)
);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_remaining_refundable_only_on_refund_receipt" CHECK (
  "kind" = 'REFUND_RECEIPT' OR "remaining_refundable_minor_snapshot" IS NULL
);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_remaining_refundable_non_negative" CHECK (
  "remaining_refundable_minor_snapshot" IS NULL OR "remaining_refundable_minor_snapshot" >= 0
);

-- transaction_corrections: money/shape invariants, and the terminal-state
-- shape (each decision's actor+timestamp set together; at most one
-- terminal outcome ever recorded on one row).
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_total_requested_positive" CHECK ("total_requested_minor" > 0);
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_version_positive" CHECK ("version" > 0);
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_reason_not_blank" CHECK (length(trim("reason")) > 0);
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_approved_shape" CHECK (("approved_at" IS NULL) = ("approved_by_membership_id" IS NULL));
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_rejected_shape" CHECK (
  ("rejected_at" IS NULL) = ("rejected_by_membership_id" IS NULL) AND ("rejected_at" IS NULL) = ("rejection_reason" IS NULL)
);
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_cancelled_shape" CHECK (
  ("cancelled_at" IS NULL) = ("cancelled_by_membership_id" IS NULL) AND ("cancelled_at" IS NULL) = ("cancellation_reason" IS NULL)
);
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_executed_shape" CHECK (
  ("executed_at" IS NULL) = ("executed_by_membership_id" IS NULL) AND ("executed_at" IS NULL) = ("corrective_transaction_id" IS NULL)
);
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_solo_override_shape" CHECK (
  "solo_owner_override" = false OR (length(trim(coalesce("solo_owner_override_reason", ''))) > 0)
);
-- status correlates with its own terminal timestamp; APPROVED/EXECUTED
-- both require approved_at (EXECUTED is only ever reached via APPROVED).
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_status_rejected_shape" CHECK (("status" = 'REJECTED') = ("rejected_at" IS NOT NULL));
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_status_cancelled_shape" CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_status_executed_shape" CHECK (("status" = 'EXECUTED') = ("executed_at" IS NOT NULL));
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_status_approved_requires_approval" CHECK ("status" NOT IN ('APPROVED', 'EXECUTED') OR "approved_at" IS NOT NULL);
-- at most one terminal outcome ever recorded on one row
ALTER TABLE "transaction_corrections" ADD CONSTRAINT "transaction_corrections_single_terminal_outcome" CHECK (
  (CASE WHEN "rejected_at" IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN "cancelled_at" IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN "executed_at" IS NOT NULL THEN 1 ELSE 0 END) <= 1
);

-- transaction_correction_items / transaction_correction_payments: amounts
-- always a positive magnitude.
ALTER TABLE "transaction_correction_items" ADD CONSTRAINT "transaction_correction_items_amount_positive" CHECK ("requested_amount_minor" > 0);
ALTER TABLE "transaction_correction_payments" ADD CONSTRAINT "transaction_correction_payments_amount_positive" CHECK ("amount_minor" > 0);
