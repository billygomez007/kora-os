-- Add Kora walk-in intake, live branch queue, and service sessions
-- (docs task "Walk-in intake -> Live branch queue -> Staff assignment ->
-- Service Session -> Service completion").
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
--    always sees them as "extra" and proposes dropping them every time —
--    the same false positive already documented in two earlier
--    migrations. They must stay.
-- 2. CHECK constraints for positive ticket numbers, non-negative
--    service-session totals, and positive/non-negative snapshot amounts
--    were added by hand — Prisma has no declarative way to express a
--    CHECK constraint in this schema-first workflow.
-- 3. Two partial unique indexes (docs task Phase 4: "Enforce at the
--    database level, preferably with a partial unique index") were added
--    by hand at the end — Prisma has no declarative way to express a
--    `WHERE` clause on a unique index. Together they guarantee at most
--    one IN_PROGRESS ServiceSession per staff profile, and at most one
--    IN_PROGRESS ServiceSession per queue entry, without relying on an
--    application-only check-then-insert.

-- CreateEnum
CREATE TYPE "queue_entry_source" AS ENUM ('WALK_IN', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "queue_entry_status" AS ENUM ('WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "queue_entry_priority" AS ENUM ('NORMAL', 'PRIORITY');

-- CreateEnum
CREATE TYPE "service_session_status" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "service_session_cancel_disposition" AS ENUM ('RETURN_TO_QUEUE', 'CANCEL_VISIT');

-- CreateTable
CREATE TABLE "branch_queue_days" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "last_ticket_number" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_queue_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "branch_queue_day_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "source" "queue_entry_source" NOT NULL,
    "appointment_id" UUID,
    "customer_record_id" UUID NOT NULL,
    "status" "queue_entry_status" NOT NULL DEFAULT 'WAITING',
    "priority" "queue_entry_priority" NOT NULL DEFAULT 'NORMAL',
    "assigned_staff_profile_id" UUID,
    "notes" TEXT,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "called_at" TIMESTAMPTZ(6),
    "service_started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "no_show_at" TIMESTAMPTZ(6),
    "created_by_membership_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_entry_services" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "queue_entry_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_entry_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_entry_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "queue_entry_id" UUID NOT NULL,
    "previous_status" "queue_entry_status",
    "new_status" "queue_entry_status" NOT NULL,
    "actor_user_id" UUID,
    "actor_membership_id" UUID,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_entry_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_intake_idempotency_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "queue_entry_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_intake_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "queue_entry_id" UUID NOT NULL,
    "appointment_id" UUID,
    "customer_record_id" UUID NOT NULL,
    "assigned_staff_profile_id" UUID NOT NULL,
    "status" "service_session_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "currency" CHAR(3) NOT NULL,
    "service_total_minor" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "cancel_disposition" "service_session_cancel_disposition",
    "created_by_membership_id" UUID NOT NULL,
    "completed_by_membership_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_session_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_session_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "duration_minutes_snapshot" INTEGER NOT NULL,
    "price_minor_snapshot" INTEGER NOT NULL,
    "currency_snapshot" CHAR(3) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_session_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_queue_days_organization_id_branch_id_business_date_key" ON "branch_queue_days"("organization_id", "branch_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "branch_queue_days_organization_id_id_key" ON "branch_queue_days"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_appointment_id_key" ON "queue_entries"("appointment_id");

-- CreateIndex
CREATE INDEX "queue_entries_organization_id_branch_id_business_date_statu_idx" ON "queue_entries"("organization_id", "branch_id", "business_date", "status");

-- CreateIndex
CREATE INDEX "queue_entries_organization_id_assigned_staff_profile_id_sta_idx" ON "queue_entries"("organization_id", "assigned_staff_profile_id", "status");

-- CreateIndex
CREATE INDEX "queue_entries_organization_id_customer_record_id_idx" ON "queue_entries"("organization_id", "customer_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_organization_id_id_key" ON "queue_entries"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_organization_id_appointment_id_key" ON "queue_entries"("organization_id", "appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_branch_id_business_date_ticket_number_key" ON "queue_entries"("branch_id", "business_date", "ticket_number");

-- CreateIndex
CREATE INDEX "queue_entry_services_queue_entry_id_display_order_idx" ON "queue_entry_services"("queue_entry_id", "display_order");

-- CreateIndex
CREATE INDEX "queue_entry_status_history_queue_entry_id_occurred_at_idx" ON "queue_entry_status_history"("queue_entry_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "queue_intake_idempotency_keys_membership_id_idempotency_key_key" ON "queue_intake_idempotency_keys"("membership_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "service_sessions_organization_id_branch_id_status_idx" ON "service_sessions"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "service_sessions_organization_id_assigned_staff_profile_id__idx" ON "service_sessions"("organization_id", "assigned_staff_profile_id", "status");

-- CreateIndex
CREATE INDEX "service_sessions_organization_id_queue_entry_id_idx" ON "service_sessions"("organization_id", "queue_entry_id");

-- CreateIndex
CREATE INDEX "service_session_items_service_session_id_display_order_idx" ON "service_session_items"("service_session_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_organization_id_id_key" ON "appointments"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "branch_queue_days" ADD CONSTRAINT "branch_queue_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_queue_days" ADD CONSTRAINT "branch_queue_days_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_organization_id_branch_queue_day_id_fkey" FOREIGN KEY ("organization_id", "branch_queue_day_id") REFERENCES "branch_queue_days"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_organization_id_appointment_id_fkey" FOREIGN KEY ("organization_id", "appointment_id") REFERENCES "appointments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_organization_id_customer_record_id_fkey" FOREIGN KEY ("organization_id", "customer_record_id") REFERENCES "customer_records"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_organization_id_assigned_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "assigned_staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_organization_id_created_by_membership_id_fkey" FOREIGN KEY ("organization_id", "created_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entry_services" ADD CONSTRAINT "queue_entry_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entry_services" ADD CONSTRAINT "queue_entry_services_queue_entry_id_fkey" FOREIGN KEY ("queue_entry_id") REFERENCES "queue_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entry_services" ADD CONSTRAINT "queue_entry_services_organization_id_service_id_fkey" FOREIGN KEY ("organization_id", "service_id") REFERENCES "services"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entry_status_history" ADD CONSTRAINT "queue_entry_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entry_status_history" ADD CONSTRAINT "queue_entry_status_history_queue_entry_id_fkey" FOREIGN KEY ("queue_entry_id") REFERENCES "queue_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_intake_idempotency_keys" ADD CONSTRAINT "queue_intake_idempotency_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_organization_id_queue_entry_id_fkey" FOREIGN KEY ("organization_id", "queue_entry_id") REFERENCES "queue_entries"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_organization_id_appointment_id_fkey" FOREIGN KEY ("organization_id", "appointment_id") REFERENCES "appointments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_organization_id_customer_record_id_fkey" FOREIGN KEY ("organization_id", "customer_record_id") REFERENCES "customer_records"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_organization_id_assigned_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "assigned_staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_organization_id_created_by_membership_id_fkey" FOREIGN KEY ("organization_id", "created_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_organization_id_completed_by_membership_i_fkey" FOREIGN KEY ("organization_id", "completed_by_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_session_items" ADD CONSTRAINT "service_session_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_session_items" ADD CONSTRAINT "service_session_items_service_session_id_fkey" FOREIGN KEY ("service_session_id") REFERENCES "service_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_session_items" ADD CONSTRAINT "service_session_items_organization_id_service_id_fkey" FOREIGN KEY ("organization_id", "service_id") REFERENCES "services"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_session_items" ADD CONSTRAINT "service_session_items_organization_id_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written: amount/shape CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "branch_queue_days" ADD CONSTRAINT "branch_queue_days_last_ticket_number_non_negative" CHECK ("last_ticket_number" >= 0);
ALTER TABLE "branch_queue_days" ADD CONSTRAINT "branch_queue_days_revision_non_negative" CHECK ("revision" >= 0);

ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_ticket_number_positive" CHECK ("ticket_number" > 0);
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_version_positive" CHECK ("version" > 0);

ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_total_non_negative" CHECK ("service_total_minor" >= 0);
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_version_positive" CHECK ("version" > 0);
-- A CANCELLED session's disposition (RETURN_TO_QUEUE / CANCEL_VISIT) is
-- only ever set alongside CANCELLED, matching the same "shape" pattern
-- BranchScheduleException.intervals already establishes in this schema.
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_cancel_disposition_shape" CHECK (
  ("status" = 'CANCELLED' AND "cancel_disposition" IS NOT NULL)
  OR ("status" != 'CANCELLED' AND "cancel_disposition" IS NULL)
);

ALTER TABLE "service_session_items" ADD CONSTRAINT "service_session_items_duration_positive" CHECK ("duration_minutes_snapshot" > 0);
ALTER TABLE "service_session_items" ADD CONSTRAINT "service_session_items_price_non_negative" CHECK ("price_minor_snapshot" >= 0);

-- ---------------------------------------------------------------------------
-- Hand-written: at most one active ServiceSession per staff profile, and
-- at most one active ServiceSession per queue entry (docs task Phase 4).
--
-- `queue_entry_id` deliberately carries no plain (non-partial) unique
-- constraint — a queue entry may accumulate more than one ServiceSession
-- over its lifetime (e.g. a RETURN_TO_QUEUE cancellation followed by a
-- later restart), so only *at most one IN_PROGRESS row at a time* is
-- enforced, not "at most one ever". Both indexes are consulted inside the
-- same transaction that claims the QueueEntry (see
-- ServiceSessionsService.start), so a violation here rolls the whole
-- attempt back and leaves the QueueEntry exactly as it was.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "service_sessions_one_active_per_staff" ON "service_sessions"("assigned_staff_profile_id") WHERE ("status" = 'IN_PROGRESS');
CREATE UNIQUE INDEX "service_sessions_one_active_per_queue_entry" ON "service_sessions"("queue_entry_id") WHERE ("status" = 'IN_PROGRESS');
