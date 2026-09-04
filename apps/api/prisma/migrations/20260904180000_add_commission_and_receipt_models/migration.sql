-- Kora OS: Commissions and Service Receipts (docs task: Posted Transaction
-- -> Commission calculation and immutable accrual -> Service receipt ->
-- Staff earnings -> Owner/manager reporting).
--
-- The two DropIndex statements `prisma migrate diff` always proposes for
-- public_business_profiles_display_name_trgm_idx and
-- _search_keywords_trgm_idx (hand-written pg_trgm indexes not declared in
-- schema.prisma) have been removed from this file, exactly as in every
-- prior migration in this project — see docs/DATA_MODEL.md.
--
-- Hand-added below the generated body:
--   1. A partial UNIQUE index with NULLS NOT DISTINCT on commission_rules
--      scope columns (branch_id/staff_profile_id/service_id), restricted
--      to currently-active rows (effective_until IS NULL AND
--      deactivated_at IS NULL) -- Prisma 7.10's schema DSL has no stable
--      declarative support for NULLS NOT DISTINCT, so this is written by
--      hand and confirmed by a real-database integration test
--      (commission-rule-uniqueness.integration-spec.ts).
--   2. CHECK constraints enforcing money/percentage/shape invariants the
--      column types alone cannot express, matching the project's
--      established convention (see the checkout/payment/transaction
--      migration).

-- CreateEnum
CREATE TYPE "commission_rule_type" AS ENUM ('PERCENTAGE', 'FIXED', 'NONE');

-- CreateEnum
CREATE TYPE "commission_calculation_basis" AS ENUM ('GROSS_LINE', 'NET_LINE_AFTER_ADJUSTMENTS');

-- CreateEnum
CREATE TYPE "commission_accrual_source" AS ENUM ('POLICY', 'NO_POLICY');

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "staff_profile_id" UUID,
    "service_id" UUID,
    "type" "commission_rule_type" NOT NULL,
    "rate_basis_points" INTEGER,
    "fixed_amount_minor" INTEGER,
    "fixed_currency" CHAR(3),
    "basis" "commission_calculation_basis" NOT NULL DEFAULT 'GROSS_LINE',
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_until" TIMESTAMPTZ(6),
    "created_by_membership_id" UUID NOT NULL,
    "supersedes_rule_id" UUID,
    "deactivated_at" TIMESTAMPTZ(6),
    "deactivated_by_membership_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_accruals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "transaction_line_item_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "commission_rule_id" UUID,
    "source" "commission_accrual_source" NOT NULL,
    "rule_type_snapshot" "commission_rule_type",
    "rate_basis_points_snapshot" INTEGER,
    "fixed_amount_minor_snapshot" INTEGER,
    "basis_snapshot" "commission_calculation_basis" NOT NULL,
    "basis_amount_minor" INTEGER NOT NULL,
    "calculated_amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_receipt_sequences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_receipt_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "branch_receipt_sequence_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "customer_record_id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "business_name_snapshot" TEXT NOT NULL,
    "branch_name_snapshot" TEXT NOT NULL,
    "branch_phone_snapshot" TEXT,
    "branch_address_snapshot" TEXT,
    "customer_name_snapshot" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "subtotal_minor_snapshot" INTEGER NOT NULL,
    "adjustment_total_minor_snapshot" INTEGER NOT NULL,
    "total_minor_snapshot" INTEGER NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_line_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "transaction_line_item_id" UUID NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_minor_snapshot" INTEGER NOT NULL,
    "line_total_minor_snapshot" INTEGER NOT NULL,
    "currency_snapshot" CHAR(3) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_payment_summaries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "method" "payment_method" NOT NULL,
    "amount_minor_snapshot" INTEGER NOT NULL,
    "currency_snapshot" CHAR(3) NOT NULL,
    "safe_reference_snapshot" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_payment_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_rules_organization_id_effective_from_effective_u_idx" ON "commission_rules"("organization_id", "effective_from", "effective_until");

-- CreateIndex
CREATE INDEX "commission_rules_organization_id_branch_id_idx" ON "commission_rules"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "commission_rules_organization_id_staff_profile_id_idx" ON "commission_rules"("organization_id", "staff_profile_id");

-- CreateIndex
CREATE INDEX "commission_rules_organization_id_service_id_idx" ON "commission_rules"("organization_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_rules_organization_id_id_key" ON "commission_rules"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_rules_organization_id_supersedes_rule_id_key" ON "commission_rules"("organization_id", "supersedes_rule_id");

-- CreateIndex
CREATE INDEX "commission_accruals_organization_id_staff_profile_id_calcul_idx" ON "commission_accruals"("organization_id", "staff_profile_id", "calculated_at");

-- CreateIndex
CREATE INDEX "commission_accruals_organization_id_transaction_id_idx" ON "commission_accruals"("organization_id", "transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_accruals_transaction_line_item_id_staff_profile__key" ON "commission_accruals"("transaction_line_item_id", "staff_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_accruals_organization_id_transaction_line_item_i_key" ON "commission_accruals"("organization_id", "transaction_line_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_accruals_organization_id_id_key" ON "commission_accruals"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_receipt_sequences_organization_id_branch_id_year_key" ON "branch_receipt_sequences"("organization_id", "branch_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_transaction_id_key" ON "receipts"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_number_key" ON "receipts"("receipt_number");

-- CreateIndex
CREATE INDEX "receipts_organization_id_branch_id_issued_at_idx" ON "receipts"("organization_id", "branch_id", "issued_at");

-- CreateIndex
CREATE INDEX "receipts_organization_id_customer_record_id_idx" ON "receipts"("organization_id", "customer_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_organization_id_id_key" ON "receipts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_organization_id_transaction_id_key" ON "receipts"("organization_id", "transaction_id");

-- CreateIndex
CREATE INDEX "receipt_line_items_receipt_id_display_order_idx" ON "receipt_line_items"("receipt_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_line_items_transaction_line_item_id_key" ON "receipt_line_items"("transaction_line_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_line_items_organization_id_transaction_line_item_id_key" ON "receipt_line_items"("organization_id", "transaction_line_item_id");

-- CreateIndex
CREATE INDEX "receipt_payment_summaries_receipt_id_idx" ON "receipt_payment_summaries"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_line_items_organization_id_id_key" ON "transaction_line_items"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organization_id_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organization_id_service_id_fkey" FOREIGN KEY ("organization_id", "service_id") REFERENCES "services"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organization_id_created_by_membership_id_fkey" FOREIGN KEY ("organization_id", "created_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organization_id_deactivated_by_membership_fkey" FOREIGN KEY ("organization_id", "deactivated_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organization_id_supersedes_rule_id_fkey" FOREIGN KEY ("organization_id", "supersedes_rule_id") REFERENCES "commission_rules"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_organization_id_transaction_id_fkey" FOREIGN KEY ("organization_id", "transaction_id") REFERENCES "transactions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_organization_id_transaction_line_item__fkey" FOREIGN KEY ("organization_id", "transaction_line_item_id") REFERENCES "transaction_line_items"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_organization_id_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_organization_id_commission_rule_id_fkey" FOREIGN KEY ("organization_id", "commission_rule_id") REFERENCES "commission_rules"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_receipt_sequences" ADD CONSTRAINT "branch_receipt_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_receipt_sequences" ADD CONSTRAINT "branch_receipt_sequences_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_branch_receipt_sequence_id_fkey" FOREIGN KEY ("branch_receipt_sequence_id") REFERENCES "branch_receipt_sequences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_transaction_id_fkey" FOREIGN KEY ("organization_id", "transaction_id") REFERENCES "transactions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_customer_record_id_fkey" FOREIGN KEY ("organization_id", "customer_record_id") REFERENCES "customer_records"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_issued_by_membership_id_fkey" FOREIGN KEY ("organization_id", "issued_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_organization_id_transaction_line_item_i_fkey" FOREIGN KEY ("organization_id", "transaction_line_item_id") REFERENCES "transaction_line_items"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_payment_summaries" ADD CONSTRAINT "receipt_payment_summaries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_payment_summaries" ADD CONSTRAINT "receipt_payment_summaries_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only one CURRENT commission rule (not yet superseded or deactivated)
-- may exist per exact scope combination. Scope columns are independently
-- nullable, so a plain UNIQUE constraint would treat every NULL as
-- distinct and fail to prevent two different "organization default"
-- rules (all three scope columns null) from coexisting -- NULLS NOT
-- DISTINCT (PostgreSQL 15+; this project runs PostgreSQL 18) is what
-- makes that comparison treat NULL = NULL as a match instead.
CREATE UNIQUE INDEX "commission_rules_current_scope_key" ON "commission_rules" ("organization_id", "branch_id", "staff_profile_id", "service_id") NULLS NOT DISTINCT WHERE "effective_until" IS NULL AND "deactivated_at" IS NULL;

-- commission_rules: money/percentage/shape invariants.
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_percentage_shape" CHECK (
  ("type" != 'PERCENTAGE' AND "rate_basis_points" IS NULL)
  OR ("type" = 'PERCENTAGE' AND "rate_basis_points" IS NOT NULL AND "rate_basis_points" >= 0 AND "rate_basis_points" <= 10000)
);
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_fixed_shape" CHECK (
  ("type" != 'FIXED' AND "fixed_amount_minor" IS NULL AND "fixed_currency" IS NULL)
  OR ("type" = 'FIXED' AND "fixed_amount_minor" IS NOT NULL AND "fixed_amount_minor" >= 0 AND "fixed_currency" IS NOT NULL)
);
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_effective_window" CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from");
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_deactivation_shape" CHECK (
  ("deactivated_at" IS NULL AND "deactivated_by_membership_id" IS NULL)
  OR ("deactivated_at" IS NOT NULL AND "deactivated_by_membership_id" IS NOT NULL)
);
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_version_positive" CHECK ("version" > 0);

-- commission_accruals: money non-negative, POLICY/NO_POLICY shape.
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_basis_amount_non_negative" CHECK ("basis_amount_minor" >= 0);
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_calculated_amount_non_negative" CHECK ("calculated_amount_minor" >= 0);
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_policy_shape" CHECK (
  ("source" = 'POLICY' AND "commission_rule_id" IS NOT NULL)
  OR ("source" = 'NO_POLICY' AND "commission_rule_id" IS NULL AND "rule_type_snapshot" IS NULL AND "rate_basis_points_snapshot" IS NULL AND "fixed_amount_minor_snapshot" IS NULL)
);

-- branch_receipt_sequences: the atomic counter never goes negative.
ALTER TABLE "branch_receipt_sequences" ADD CONSTRAINT "branch_receipt_sequences_last_sequence_non_negative" CHECK ("last_sequence" >= 0);

-- receipts: totals non-negative and internally consistent, sequence positive.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_subtotal_non_negative" CHECK ("subtotal_minor_snapshot" >= 0);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_total_non_negative" CHECK ("total_minor_snapshot" >= 0);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_total_equals_subtotal_plus_adjustments" CHECK ("total_minor_snapshot" = "subtotal_minor_snapshot" + "adjustment_total_minor_snapshot");
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_sequence_number_positive" CHECK ("sequence_number" > 0);

-- receipt_line_items: quantity/price sanity.
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_unit_price_non_negative" CHECK ("unit_price_minor_snapshot" >= 0);
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_line_total_non_negative" CHECK ("line_total_minor_snapshot" >= 0);

-- receipt_payment_summaries: amount always positive (a payment method
-- summary line only exists to describe money that was actually applied).
ALTER TABLE "receipt_payment_summaries" ADD CONSTRAINT "receipt_payment_summaries_amount_positive" CHECK ("amount_minor_snapshot" > 0);
