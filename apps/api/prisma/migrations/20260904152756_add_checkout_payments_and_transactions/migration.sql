-- Add Kora Checkout, manual payment recording, provider
-- confirmation/dispute, and posted Transaction (docs task "Completed
-- ServiceSession -> Checkout -> Manual payment recording -> Provider
-- confirmation or dispute -> Manager resolution -> Immutable verified
-- Transaction").
--
-- Generated via `prisma migrate diff --from-config-datasource --to-schema
-- prisma/schema.prisma --script` and hand-edited:
--
-- 1. Two `DROP INDEX` statements the diff tool proposed for
--    "public_business_profiles_display_name_trgm_idx" and
--    "...search_keywords_trgm_idx" were removed. Those pg_trgm indexes
--    were added by hand-written raw SQL in the
--    add_kora_authentication_rbac_and_discovery migration and are not
--    declared in schema.prisma's model definitions, so the diff tool
--    always proposes dropping them every time — the same false positive
--    already documented in four earlier migrations. They must stay.
-- 2. CHECK constraints for non-negative/positive amounts, the
--    subtotal+adjustment=total invariant, non-empty reasons, and
--    dispute-resolution shape were added by hand — Prisma has no
--    declarative way to express a CHECK constraint in this schema-first
--    workflow. `adjustment_total_minor` is a *signed* net value
--    (positive = net surcharge, negative = net discount) specifically so
--    `total_minor = subtotal_minor + adjustment_total_minor` can be a
--    single, always-true CHECK constraint on both `checkouts` and
--    `transactions`.

-- CreateEnum
CREATE TYPE "checkout_status" AS ENUM ('OPEN', 'AWAITING_VERIFICATION', 'DISPUTED', 'SETTLED', 'VOIDED');

-- CreateEnum
CREATE TYPE "checkout_adjustment_type" AS ENUM ('DISCOUNT', 'SURCHARGE');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'MOBILE_MONEY', 'CARD', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "payment_record_status" AS ENUM ('RECORDED', 'CONFIRMED', 'DISPUTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "payment_verification_action" AS ENUM ('RECORDED', 'CONFIRMED', 'DISPUTED', 'RESOLVED_CONFIRMED', 'RESOLVED_REJECTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "payment_dispute_status" AS ENUM ('OPEN', 'RESOLVED_CONFIRMED', 'RESOLVED_REJECTED');

-- CreateEnum
CREATE TYPE "payment_dispute_resolution" AS ENUM ('CONFIRM_PAYMENT', 'REJECT_PAYMENT');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('POSTED');

-- CreateEnum
CREATE TYPE "financial_idempotency_operation" AS ENUM ('CREATE_CHECKOUT', 'RECORD_PAYMENT');

-- CreateTable
CREATE TABLE "checkouts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "service_session_id" UUID NOT NULL,
    "customer_record_id" UUID NOT NULL,
    "assigned_staff_profile_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "checkout_status" NOT NULL DEFAULT 'OPEN',
    "currency" CHAR(3) NOT NULL,
    "subtotal_minor" INTEGER NOT NULL,
    "adjustment_total_minor" INTEGER NOT NULL DEFAULT 0,
    "total_minor" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "settled_at" TIMESTAMPTZ(6),
    "voided_at" TIMESTAMPTZ(6),
    "voided_by_membership_id" UUID,
    "void_reason" TEXT,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_line_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "service_session_item_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "duration_minutes_snapshot" INTEGER NOT NULL,
    "price_minor_snapshot" INTEGER NOT NULL,
    "currency_snapshot" CHAR(3) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_adjustments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "type" "checkout_adjustment_type" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "method" "payment_method" NOT NULL,
    "status" "payment_record_status" NOT NULL DEFAULT 'RECORDED',
    "applied_amount_minor" INTEGER NOT NULL,
    "tendered_amount_minor" INTEGER,
    "currency" CHAR(3) NOT NULL,
    "external_reference" TEXT,
    "note" TEXT,
    "recorded_by_membership_id" UUID NOT NULL,
    "confirmation_required_by_staff_profile_id" UUID NOT NULL,
    "confirmed_by_membership_id" UUID,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),
    "disputed_at" TIMESTAMPTZ(6),
    "voided_at" TIMESTAMPTZ(6),
    "voided_by_membership_id" UUID,
    "void_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_verification_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_record_id" UUID NOT NULL,
    "action" "payment_verification_action" NOT NULL,
    "previous_status" "payment_record_status",
    "new_status" "payment_record_status" NOT NULL,
    "actor_user_id" UUID,
    "actor_membership_id" UUID,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_verification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_disputes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_record_id" UUID NOT NULL,
    "status" "payment_dispute_status" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "opened_by_membership_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_membership_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution" "payment_dispute_resolution",
    "resolution_note" TEXT,

    CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "service_session_id" UUID NOT NULL,
    "customer_record_id" UUID NOT NULL,
    "assigned_staff_profile_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "transaction_status" NOT NULL DEFAULT 'POSTED',
    "currency" CHAR(3) NOT NULL,
    "subtotal_minor" INTEGER NOT NULL,
    "adjustment_total_minor" INTEGER NOT NULL,
    "total_minor" INTEGER NOT NULL,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_line_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "service_session_item_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "duration_minutes_snapshot" INTEGER NOT NULL,
    "price_minor_snapshot" INTEGER NOT NULL,
    "currency_snapshot" CHAR(3) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_payment_allocations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "payment_record_id" UUID NOT NULL,
    "applied_amount_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_idempotency_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "operation" "financial_idempotency_operation" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_service_session_id_key" ON "checkouts"("service_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_reference_key" ON "checkouts"("reference");

-- CreateIndex
CREATE INDEX "checkouts_organization_id_branch_id_status_idx" ON "checkouts"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "checkouts_organization_id_assigned_staff_profile_id_status_idx" ON "checkouts"("organization_id", "assigned_staff_profile_id", "status");

-- CreateIndex
CREATE INDEX "checkouts_organization_id_customer_record_id_idx" ON "checkouts"("organization_id", "customer_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_organization_id_id_key" ON "checkouts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_organization_id_service_session_id_key" ON "checkouts"("organization_id", "service_session_id");

-- CreateIndex
CREATE INDEX "checkout_line_items_checkout_id_display_order_idx" ON "checkout_line_items"("checkout_id", "display_order");

-- CreateIndex
CREATE INDEX "checkout_adjustments_checkout_id_created_at_idx" ON "checkout_adjustments"("checkout_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_reference_key" ON "payment_records"("reference");

-- CreateIndex
CREATE INDEX "payment_records_organization_id_checkout_id_status_idx" ON "payment_records"("organization_id", "checkout_id", "status");

-- CreateIndex
CREATE INDEX "payment_records_organization_id_confirmation_required_by_st_idx" ON "payment_records"("organization_id", "confirmation_required_by_staff_profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_organization_id_id_key" ON "payment_records"("organization_id", "id");

-- CreateIndex
CREATE INDEX "payment_verification_events_payment_record_id_occurred_at_idx" ON "payment_verification_events"("payment_record_id", "occurred_at");

-- CreateIndex
CREATE INDEX "payment_verification_events_organization_id_occurred_at_idx" ON "payment_verification_events"("organization_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_disputes_payment_record_id_key" ON "payment_disputes"("payment_record_id");

-- CreateIndex
CREATE INDEX "payment_disputes_organization_id_status_idx" ON "payment_disputes"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_disputes_organization_id_payment_record_id_key" ON "payment_disputes"("organization_id", "payment_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_checkout_id_key" ON "transactions"("checkout_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_service_session_id_key" ON "transactions"("service_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_reference_key" ON "transactions"("reference");

-- CreateIndex
CREATE INDEX "transactions_organization_id_branch_id_posted_at_idx" ON "transactions"("organization_id", "branch_id", "posted_at");

-- CreateIndex
CREATE INDEX "transactions_organization_id_assigned_staff_profile_id_post_idx" ON "transactions"("organization_id", "assigned_staff_profile_id", "posted_at");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_organization_id_id_key" ON "transactions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_organization_id_checkout_id_key" ON "transactions"("organization_id", "checkout_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_organization_id_service_session_id_key" ON "transactions"("organization_id", "service_session_id");

-- CreateIndex
CREATE INDEX "transaction_line_items_transaction_id_display_order_idx" ON "transaction_line_items"("transaction_id", "display_order");

-- CreateIndex
CREATE INDEX "transaction_payment_allocations_organization_id_payment_rec_idx" ON "transaction_payment_allocations"("organization_id", "payment_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_payment_allocations_transaction_id_payment_reco_key" ON "transaction_payment_allocations"("transaction_id", "payment_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_idempotency_keys_membership_id_operation_idempote_key" ON "financial_idempotency_keys"("membership_id", "operation", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "service_sessions_organization_id_id_key" ON "service_sessions"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_organization_id_service_session_id_fkey" FOREIGN KEY ("organization_id", "service_session_id") REFERENCES "service_sessions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_organization_id_customer_record_id_fkey" FOREIGN KEY ("organization_id", "customer_record_id") REFERENCES "customer_records"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_organization_id_assigned_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "assigned_staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_organization_id_created_by_membership_id_fkey" FOREIGN KEY ("organization_id", "created_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_organization_id_voided_by_membership_id_fkey" FOREIGN KEY ("organization_id", "voided_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_line_items" ADD CONSTRAINT "checkout_line_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_line_items" ADD CONSTRAINT "checkout_line_items_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "checkouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_line_items" ADD CONSTRAINT "checkout_line_items_service_session_item_id_fkey" FOREIGN KEY ("service_session_item_id") REFERENCES "service_session_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_line_items" ADD CONSTRAINT "checkout_line_items_organization_id_service_id_fkey" FOREIGN KEY ("organization_id", "service_id") REFERENCES "services"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_line_items" ADD CONSTRAINT "checkout_line_items_organization_id_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_adjustments" ADD CONSTRAINT "checkout_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_adjustments" ADD CONSTRAINT "checkout_adjustments_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "checkouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_organization_id_checkout_id_fkey" FOREIGN KEY ("organization_id", "checkout_id") REFERENCES "checkouts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_organization_id_recorded_by_membership_id_fkey" FOREIGN KEY ("organization_id", "recorded_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_organization_id_confirmation_required_by_s_fkey" FOREIGN KEY ("organization_id", "confirmation_required_by_staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_organization_id_confirmed_by_membership_id_fkey" FOREIGN KEY ("organization_id", "confirmed_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_organization_id_voided_by_membership_id_fkey" FOREIGN KEY ("organization_id", "voided_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_verification_events" ADD CONSTRAINT "payment_verification_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_verification_events" ADD CONSTRAINT "payment_verification_events_payment_record_id_fkey" FOREIGN KEY ("payment_record_id") REFERENCES "payment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_organization_id_payment_record_id_fkey" FOREIGN KEY ("organization_id", "payment_record_id") REFERENCES "payment_records"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_organization_id_opened_by_membership_id_fkey" FOREIGN KEY ("organization_id", "opened_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_organization_id_resolved_by_membership_id_fkey" FOREIGN KEY ("organization_id", "resolved_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_checkout_id_fkey" FOREIGN KEY ("organization_id", "checkout_id") REFERENCES "checkouts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_service_session_id_fkey" FOREIGN KEY ("organization_id", "service_session_id") REFERENCES "service_sessions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_customer_record_id_fkey" FOREIGN KEY ("organization_id", "customer_record_id") REFERENCES "customer_records"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_assigned_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "assigned_staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_service_session_item_id_fkey" FOREIGN KEY ("service_session_item_id") REFERENCES "service_session_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_organization_id_service_id_fkey" FOREIGN KEY ("organization_id", "service_id") REFERENCES "services"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_organization_id_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_payment_allocations" ADD CONSTRAINT "transaction_payment_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_payment_allocations" ADD CONSTRAINT "transaction_payment_allocations_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_payment_allocations" ADD CONSTRAINT "transaction_payment_allocations_organization_id_payment_re_fkey" FOREIGN KEY ("organization_id", "payment_record_id") REFERENCES "payment_records"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_idempotency_keys" ADD CONSTRAINT "financial_idempotency_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written: amount/shape CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_subtotal_non_negative" CHECK ("subtotal_minor" >= 0);
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_total_non_negative" CHECK ("total_minor" >= 0);
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_total_equals_subtotal_plus_adjustments" CHECK ("total_minor" = "subtotal_minor" + "adjustment_total_minor");
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_version_positive" CHECK ("version" > 0);
-- A void requires all three void fields together, and a non-void row has none of them.
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_void_shape" CHECK (
  ("voided_at" IS NULL AND "voided_by_membership_id" IS NULL AND "void_reason" IS NULL)
  OR ("voided_at" IS NOT NULL AND "voided_by_membership_id" IS NOT NULL AND "void_reason" IS NOT NULL)
);

ALTER TABLE "checkout_adjustments" ADD CONSTRAINT "checkout_adjustments_amount_positive" CHECK ("amount_minor" > 0);
ALTER TABLE "checkout_adjustments" ADD CONSTRAINT "checkout_adjustments_reason_not_blank" CHECK (length(trim("reason")) > 0);

ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_applied_amount_positive" CHECK ("applied_amount_minor" > 0);
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_tendered_covers_applied" CHECK ("tendered_amount_minor" IS NULL OR "tendered_amount_minor" >= "applied_amount_minor");
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_version_positive" CHECK ("version" > 0);
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_void_shape" CHECK (
  ("voided_at" IS NULL AND "voided_by_membership_id" IS NULL AND "void_reason" IS NULL)
  OR ("voided_at" IS NOT NULL AND "voided_by_membership_id" IS NOT NULL AND "void_reason" IS NOT NULL)
);

ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_reason_not_blank" CHECK (length(trim("reason")) > 0);
-- An OPEN dispute has no resolution fields set; a resolved one has all three.
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_resolution_shape" CHECK (
  ("status" = 'OPEN' AND "resolved_at" IS NULL AND "resolved_by_membership_id" IS NULL AND "resolution" IS NULL)
  OR ("status" != 'OPEN' AND "resolved_at" IS NOT NULL AND "resolved_by_membership_id" IS NOT NULL AND "resolution" IS NOT NULL)
);

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subtotal_non_negative" CHECK ("subtotal_minor" >= 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_total_non_negative" CHECK ("total_minor" >= 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_total_equals_subtotal_plus_adjustments" CHECK ("total_minor" = "subtotal_minor" + "adjustment_total_minor");

ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_duration_positive" CHECK ("duration_minutes_snapshot" > 0);
ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_price_non_negative" CHECK ("price_minor_snapshot" >= 0);

ALTER TABLE "transaction_payment_allocations" ADD CONSTRAINT "transaction_payment_allocations_amount_positive" CHECK ("applied_amount_minor" > 0);

ALTER TABLE "checkout_line_items" ADD CONSTRAINT "checkout_line_items_duration_positive" CHECK ("duration_minutes_snapshot" > 0);
ALTER TABLE "checkout_line_items" ADD CONSTRAINT "checkout_line_items_price_non_negative" CHECK ("price_minor_snapshot" >= 0);
