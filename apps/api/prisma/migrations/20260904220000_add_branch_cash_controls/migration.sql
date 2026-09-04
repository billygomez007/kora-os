-- Kora OS: Branch cash controls (docs task: "Cash Controls and
-- Reconciliation"). A CashSession's expected/counted/variance figures are
-- a physical-custody calculation, never revenue -- see
-- docs/ARCHITECTURE.md.
--
-- The two DropIndex statements `prisma migrate diff` always proposes for
-- public_business_profiles_display_name_trgm_idx and
-- _search_keywords_trgm_idx (hand-written pg_trgm indexes not declared in
-- schema.prisma) have been removed from this file, exactly as in every
-- prior migration in this project.
--
-- Hand-added below the generated body:
--   1. A partial UNIQUE index restricting cash_sessions to at most one
--      OPEN row per (register_id, currency) -- Prisma 7.10's schema DSL
--      has no stable declarative support for a partial index, so this is
--      written by hand and confirmed by a real-database integration test
--      (cash-session-uniqueness.integration-spec.ts).
--   2. CHECK constraints for money/shape invariants the column types
--      alone cannot express, matching this project's established
--      convention.
--   3. A BEFORE INSERT trigger on cash_ledger_entries rejecting any
--      insert whose cash_session is not OPEN -- a hard database-level
--      backstop behind the application-level row lock CashSessionService
--      takes on the session before ever writing a ledger entry or
--      closing it, confirmed by a real-database integration test.

-- CreateEnum
CREATE TYPE "cash_policy_mode" AS ENUM ('OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "cash_session_status" AS ENUM ('OPEN', 'CLOSED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "cash_ledger_entry_type" AS ENUM ('OPENING_FLOAT', 'PAYMENT_RECEIVED', 'CASH_IN', 'CASH_OUT', 'SAFE_DROP', 'REFUND_PAID');

-- CreateEnum
CREATE TYPE "cash_session_review_outcome" AS ENUM ('MATCHED', 'ACCEPTED_VARIANCE', 'INVESTIGATION_REQUIRED');

-- CreateTable
CREATE TABLE "branch_cash_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "mode" "cash_policy_mode" NOT NULL DEFAULT 'OPTIONAL',
    "updated_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_cash_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_membership_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "register_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "opened_by_membership_id" UUID NOT NULL,
    "opening_float_minor" INTEGER NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_membership_id" UUID,
    "expected_closing_cash_minor" INTEGER,
    "counted_cash_minor" INTEGER,
    "variance_minor" INTEGER,
    "status" "cash_session_status" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_ledger_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "register_id" UUID NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "type" "cash_ledger_entry_type" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "payment_record_id" UUID,
    "corrective_transaction_id" UUID,
    "reason" TEXT,
    "actor_membership_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_session_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "outcome" "cash_session_review_outcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewed_by_membership_id" UUID NOT NULL,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_session_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_cash_policies_branch_id_key" ON "branch_cash_policies"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_cash_policies_organization_id_branch_id_key" ON "branch_cash_policies"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "cash_registers_organization_id_branch_id_archived_at_idx" ON "cash_registers"("organization_id", "branch_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_organization_id_branch_id_code_key" ON "cash_registers"("organization_id", "branch_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_organization_id_id_key" ON "cash_registers"("organization_id", "id");

-- CreateIndex
CREATE INDEX "cash_sessions_organization_id_branch_id_status_idx" ON "cash_sessions"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_organization_id_register_id_status_idx" ON "cash_sessions"("organization_id", "register_id", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_organization_id_opened_by_membership_id_statu_idx" ON "cash_sessions"("organization_id", "opened_by_membership_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_organization_id_id_key" ON "cash_sessions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_ledger_entries_payment_record_id_key" ON "cash_ledger_entries"("payment_record_id");

-- CreateIndex
CREATE INDEX "cash_ledger_entries_organization_id_cash_session_id_occurre_idx" ON "cash_ledger_entries"("organization_id", "cash_session_id", "occurred_at");

-- CreateIndex
CREATE INDEX "cash_ledger_entries_organization_id_corrective_transaction__idx" ON "cash_ledger_entries"("organization_id", "corrective_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_ledger_entries_organization_id_id_key" ON "cash_ledger_entries"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_ledger_entries_organization_id_payment_record_id_key" ON "cash_ledger_entries"("organization_id", "payment_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_session_reviews_cash_session_id_key" ON "cash_session_reviews"("cash_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_session_reviews_organization_id_cash_session_id_key" ON "cash_session_reviews"("organization_id", "cash_session_id");

-- AddForeignKey
ALTER TABLE "branch_cash_policies" ADD CONSTRAINT "branch_cash_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_cash_policies" ADD CONSTRAINT "branch_cash_policies_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_cash_policies" ADD CONSTRAINT "branch_cash_policies_organization_id_updated_by_membership_fkey" FOREIGN KEY ("organization_id", "updated_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_organization_id_created_by_membership_id_fkey" FOREIGN KEY ("organization_id", "created_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_organization_id_archived_by_membership_id_fkey" FOREIGN KEY ("organization_id", "archived_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_organization_id_register_id_fkey" FOREIGN KEY ("organization_id", "register_id") REFERENCES "cash_registers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_organization_id_opened_by_membership_id_fkey" FOREIGN KEY ("organization_id", "opened_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_organization_id_closed_by_membership_id_fkey" FOREIGN KEY ("organization_id", "closed_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_organization_id_register_id_fkey" FOREIGN KEY ("organization_id", "register_id") REFERENCES "cash_registers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_organization_id_cash_session_id_fkey" FOREIGN KEY ("organization_id", "cash_session_id") REFERENCES "cash_sessions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_organization_id_payment_record_id_fkey" FOREIGN KEY ("organization_id", "payment_record_id") REFERENCES "payment_records"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_organization_id_corrective_transaction_fkey" FOREIGN KEY ("organization_id", "corrective_transaction_id") REFERENCES "transactions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_organization_id_actor_membership_id_fkey" FOREIGN KEY ("organization_id", "actor_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_session_reviews" ADD CONSTRAINT "cash_session_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_session_reviews" ADD CONSTRAINT "cash_session_reviews_organization_id_cash_session_id_fkey" FOREIGN KEY ("organization_id", "cash_session_id") REFERENCES "cash_sessions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_session_reviews" ADD CONSTRAINT "cash_session_reviews_organization_id_reviewed_by_membershi_fkey" FOREIGN KEY ("organization_id", "reviewed_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only one OPEN cash session may exist per (register, currency) at a time.
CREATE UNIQUE INDEX "cash_sessions_one_open_per_register_currency" ON "cash_sessions" ("register_id", "currency") WHERE "status" = 'OPEN';

-- branch_cash_policies: no shape invariants beyond the enum/FK already
-- expressed by the column types.

-- cash_registers: no additional invariants.

-- cash_sessions: money non-negative, version positive, and the
-- expected/counted/variance/closedAt/closedBy columns are either all
-- null (still OPEN) or all set together (closed exactly once).
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opening_float_non_negative" CHECK ("opening_float_minor" >= 0);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_version_positive" CHECK ("version" > 0);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_close_shape" CHECK (
  ("closed_at" IS NULL AND "closed_by_membership_id" IS NULL AND "expected_closing_cash_minor" IS NULL AND "counted_cash_minor" IS NULL AND "variance_minor" IS NULL)
  OR ("closed_at" IS NOT NULL AND "closed_by_membership_id" IS NOT NULL AND "expected_closing_cash_minor" IS NOT NULL AND "counted_cash_minor" IS NOT NULL AND "variance_minor" IS NOT NULL)
);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_expected_closing_cash_non_negative" CHECK ("expected_closing_cash_minor" IS NULL OR "expected_closing_cash_minor" >= 0);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_counted_cash_non_negative" CHECK ("counted_cash_minor" IS NULL OR "counted_cash_minor" >= 0);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_variance_equals_counted_minus_expected" CHECK (
  "variance_minor" IS NULL OR "variance_minor" = "counted_cash_minor" - "expected_closing_cash_minor"
);
-- OPEN sessions have none of the close columns set; CLOSED/REVIEWED do.
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_status_matches_close_shape" CHECK (
  ("status" = 'OPEN' AND "closed_at" IS NULL) OR ("status" != 'OPEN' AND "closed_at" IS NOT NULL)
);

-- cash_ledger_entries: amount is always a positive magnitude; a manual
-- CASH_IN/CASH_OUT/SAFE_DROP always carries a reason; only REFUND_PAID
-- ever carries a corrective-transaction reference; only PAYMENT_RECEIVED
-- ever carries a payment-record reference.
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_amount_positive" CHECK ("amount_minor" > 0);
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_manual_movement_requires_reason" CHECK (
  ("type" NOT IN ('CASH_IN', 'CASH_OUT', 'SAFE_DROP')) OR ("reason" IS NOT NULL AND length(trim("reason")) > 0)
);
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_payment_record_only_on_payment_received" CHECK (
  ("type" = 'PAYMENT_RECEIVED' AND "payment_record_id" IS NOT NULL) OR ("type" != 'PAYMENT_RECEIVED' AND "payment_record_id" IS NULL)
);
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_corrective_transaction_only_on_refund_paid" CHECK (
  ("type" = 'REFUND_PAID' AND "corrective_transaction_id" IS NOT NULL) OR ("type" != 'REFUND_PAID' AND "corrective_transaction_id" IS NULL)
);

-- cash_session_reviews: reason always required, non-blank.
ALTER TABLE "cash_session_reviews" ADD CONSTRAINT "cash_session_reviews_reason_not_blank" CHECK (length(trim("reason")) > 0);

-- A cash ledger entry may only ever be inserted against an OPEN session.
-- This is a hard backstop behind CashSessionService's own row lock; the
-- FOR UPDATE below is what makes it race-safe against a concurrent close
-- (see the migration header and CashSessionService.lockCashSession).
CREATE OR REPLACE FUNCTION reject_cash_ledger_entry_on_non_open_session() RETURNS TRIGGER AS $$
DECLARE
  session_status "cash_session_status";
BEGIN
  SELECT "status" INTO session_status FROM "cash_sessions" WHERE "id" = NEW."cash_session_id" FOR UPDATE;
  IF session_status IS NULL THEN
    RAISE EXCEPTION 'Cash session % does not exist', NEW."cash_session_id";
  END IF;
  IF session_status != 'OPEN' THEN
    RAISE EXCEPTION 'Cannot add a cash ledger entry to a % cash session', session_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cash_ledger_entries_require_open_session"
BEFORE INSERT ON "cash_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION reject_cash_ledger_entry_on_non_open_session();
