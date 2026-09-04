-- Add Kora service catalogue, staff assignments, branch business hours,
-- staff availability, and appointment booking (docs task "Service
-- Catalogue -> Staff-Service Assignments -> Business Hours -> Staff
-- Availability -> Appointment Availability -> Customer Booking").
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
--    always sees them as "extra" and wants to drop them — the same
--    false positive documented in the remove_password_authentication
--    migration. They must stay.
-- 2. CHECK constraints for positive/non-negative amounts, valid time
--    ordering, and day-of-week range were added by hand — Prisma has no
--    declarative way to express a CHECK constraint in this schema-first
--    workflow.
-- 3. The double-booking exclusion constraint (docs task Phase 18) was
--    added by hand at the end — Prisma has no first-class way to declare
--    a PostgreSQL EXCLUDE constraint. It requires the `btree_gist`
--    extension (for a GiST equality operator class on a uuid column,
--    combined with `tstzrange` overlap) enabled below.
-- CreateEnum
CREATE TYPE "service_pricing_type" AS ENUM ('FIXED', 'FROM');

-- CreateEnum
CREATE TYPE "branch_schedule_exception_type" AS ENUM ('CLOSED', 'SPECIAL_HOURS', 'HOLIDAY', 'EMERGENCY_CLOSURE');

-- CreateEnum
CREATE TYPE "staff_availability_exception_type" AS ENUM ('TIME_OFF', 'SICK_LEAVE', 'HOLIDAY', 'SPECIAL_AVAILABILITY');

-- CreateEnum
CREATE TYPE "appointment_source" AS ENUM ('CUSTOMER_APP', 'BUSINESS_STAFF');

-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('CONFIRMED', 'CANCELLED', 'NO_SHOW');



-- AlterTable
ALTER TABLE "customer_profiles" ADD COLUMN     "area" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "location_consented_at" TIMESTAMPTZ(6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "phone_e164" TEXT;

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_category_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "pricing_type" "service_pricing_type" NOT NULL DEFAULT 'FIXED',
    "is_bookable_by_customer" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_services" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "price_override_minor" INTEGER,
    "duration_override_minutes" INTEGER,
    "is_bookable_by_customer_override" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_service_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "is_bookable" BOOLEAN NOT NULL DEFAULT true,
    "duration_override_minutes" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_service_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_business_hours" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_local_time" VARCHAR(5) NOT NULL,
    "end_local_time" VARCHAR(5) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_schedule_exceptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "branch_schedule_exception_type" NOT NULL,
    "intervals" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_booking_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "slot_interval_minutes" INTEGER NOT NULL,
    "min_booking_lead_time_minutes" INTEGER NOT NULL,
    "max_booking_horizon_days" INTEGER NOT NULL,
    "buffer_before_minutes" INTEGER NOT NULL,
    "buffer_after_minutes" INTEGER NOT NULL,
    "cancellation_cutoff_minutes" INTEGER NOT NULL,
    "allow_customer_provider_selection" BOOLEAN NOT NULL,
    "allow_any_provider" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_booking_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_availability_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_local_time" VARCHAR(5) NOT NULL,
    "end_local_time" VARCHAR(5) NOT NULL,
    "effective_from" DATE,
    "effective_until" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_availability_exceptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "staff_availability_exception_type" NOT NULL,
    "is_full_day" BOOLEAN NOT NULL DEFAULT true,
    "start_local_time" VARCHAR(5),
    "end_local_time" VARCHAR(5),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "customer_record_id" UUID NOT NULL,
    "assigned_staff_profile_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "occupied_start_at" TIMESTAMPTZ(6) NOT NULL,
    "occupied_end_at" TIMESTAMPTZ(6) NOT NULL,
    "branch_time_zone" TEXT NOT NULL,
    "status" "appointment_status" NOT NULL DEFAULT 'CONFIRMED',
    "source" "appointment_source" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "total_price_minor" INTEGER NOT NULL,
    "idempotency_key" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_reason" TEXT,
    "cancelled_by_membership_id" UUID,
    "no_show_marked_at" TIMESTAMPTZ(6),
    "no_show_marked_by_membership_id" UUID,
    "created_by_user_id" UUID,
    "created_by_membership_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "duration_minutes_snapshot" INTEGER NOT NULL,
    "price_minor_snapshot" INTEGER NOT NULL,
    "currency_snapshot" CHAR(3) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "previous_status" "appointment_status",
    "new_status" "appointment_status" NOT NULL,
    "actor_user_id" UUID,
    "actor_membership_id" UUID,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_idempotency_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "appointment_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_categories_organization_id_archived_at_idx" ON "service_categories"("organization_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_organization_id_id_key" ON "service_categories"("organization_id", "id");

-- CreateIndex
CREATE INDEX "services_organization_id_archived_at_idx" ON "services"("organization_id", "archived_at");

-- CreateIndex
CREATE INDEX "services_organization_id_service_category_id_idx" ON "services"("organization_id", "service_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_organization_id_id_key" ON "services"("organization_id", "id");

-- CreateIndex
CREATE INDEX "branch_services_organization_id_branch_id_idx" ON "branch_services"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_services_branch_id_service_id_key" ON "branch_services"("branch_id", "service_id");

-- CreateIndex
CREATE INDEX "staff_service_assignments_organization_id_branch_id_service_idx" ON "staff_service_assignments"("organization_id", "branch_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_service_assignments_staff_profile_id_branch_id_servic_key" ON "staff_service_assignments"("staff_profile_id", "branch_id", "service_id");

-- CreateIndex
CREATE INDEX "branch_business_hours_organization_id_branch_id_day_of_week_idx" ON "branch_business_hours"("organization_id", "branch_id", "day_of_week");

-- CreateIndex
CREATE INDEX "branch_schedule_exceptions_organization_id_branch_id_date_idx" ON "branch_schedule_exceptions"("organization_id", "branch_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "branch_schedule_exceptions_branch_id_date_key" ON "branch_schedule_exceptions"("branch_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "branch_booking_policies_organization_id_branch_id_key" ON "branch_booking_policies"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "staff_availability_rules_organization_id_staff_profile_id_b_idx" ON "staff_availability_rules"("organization_id", "staff_profile_id", "branch_id", "day_of_week");

-- CreateIndex
CREATE INDEX "staff_availability_exceptions_organization_id_staff_profile_idx" ON "staff_availability_exceptions"("organization_id", "staff_profile_id", "branch_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_reference_key" ON "appointments"("reference");

-- CreateIndex
CREATE INDEX "appointments_organization_id_branch_id_start_at_idx" ON "appointments"("organization_id", "branch_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_organization_id_assigned_staff_profile_id_star_idx" ON "appointments"("organization_id", "assigned_staff_profile_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_customer_profile_id_start_at_idx" ON "appointments"("customer_profile_id", "start_at");

-- CreateIndex
CREATE INDEX "appointment_items_appointment_id_display_order_idx" ON "appointment_items"("appointment_id", "display_order");

-- CreateIndex
CREATE INDEX "appointment_status_history_appointment_id_occurred_at_idx" ON "appointment_status_history"("appointment_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_idempotency_keys_customer_profile_id_idempotenc_key" ON "appointment_idempotency_keys"("customer_profile_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "customer_records_organization_id_id_key" ON "customer_records"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_organization_id_id_key" ON "staff_profiles"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_service_category_id_fkey" FOREIGN KEY ("organization_id", "service_category_id") REFERENCES "service_categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_services" ADD CONSTRAINT "branch_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_services" ADD CONSTRAINT "branch_services_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_services" ADD CONSTRAINT "branch_services_organization_id_service_id_fkey" FOREIGN KEY ("organization_id", "service_id") REFERENCES "services"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_service_assignments" ADD CONSTRAINT "staff_service_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_service_assignments" ADD CONSTRAINT "staff_service_assignments_organization_id_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_service_assignments" ADD CONSTRAINT "staff_service_assignments_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_service_assignments" ADD CONSTRAINT "staff_service_assignments_organization_id_service_id_fkey" FOREIGN KEY ("organization_id", "service_id") REFERENCES "services"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_business_hours" ADD CONSTRAINT "branch_business_hours_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_business_hours" ADD CONSTRAINT "branch_business_hours_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_schedule_exceptions" ADD CONSTRAINT "branch_schedule_exceptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_schedule_exceptions" ADD CONSTRAINT "branch_schedule_exceptions_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_booking_policies" ADD CONSTRAINT "branch_booking_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_booking_policies" ADD CONSTRAINT "branch_booking_policies_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability_rules" ADD CONSTRAINT "staff_availability_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability_rules" ADD CONSTRAINT "staff_availability_rules_organization_id_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability_rules" ADD CONSTRAINT "staff_availability_rules_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability_exceptions" ADD CONSTRAINT "staff_availability_exceptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability_exceptions" ADD CONSTRAINT "staff_availability_exceptions_organization_id_staff_profil_fkey" FOREIGN KEY ("organization_id", "staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability_exceptions" ADD CONSTRAINT "staff_availability_exceptions_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_customer_record_id_fkey" FOREIGN KEY ("organization_id", "customer_record_id") REFERENCES "customer_records"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_assigned_staff_profile_id_fkey" FOREIGN KEY ("organization_id", "assigned_staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_organization_id_service_id_fkey" FOREIGN KEY ("organization_id", "service_id") REFERENCES "services"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_idempotency_keys" ADD CONSTRAINT "appointment_idempotency_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written: amount/time/shape CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "services" ADD CONSTRAINT "services_duration_minutes_positive" CHECK ("duration_minutes" > 0);
ALTER TABLE "services" ADD CONSTRAINT "services_price_minor_non_negative" CHECK ("price_minor" >= 0);

ALTER TABLE "branch_services" ADD CONSTRAINT "branch_services_duration_override_positive" CHECK ("duration_override_minutes" IS NULL OR "duration_override_minutes" > 0);
ALTER TABLE "branch_services" ADD CONSTRAINT "branch_services_price_override_non_negative" CHECK ("price_override_minor" IS NULL OR "price_override_minor" >= 0);

ALTER TABLE "staff_service_assignments" ADD CONSTRAINT "staff_service_assignments_duration_override_positive" CHECK ("duration_override_minutes" IS NULL OR "duration_override_minutes" > 0);

ALTER TABLE "branch_business_hours" ADD CONSTRAINT "branch_business_hours_day_of_week_range" CHECK ("day_of_week" BETWEEN 0 AND 6);
ALTER TABLE "branch_business_hours" ADD CONSTRAINT "branch_business_hours_time_order" CHECK ("start_local_time" < "end_local_time");

ALTER TABLE "staff_availability_rules" ADD CONSTRAINT "staff_availability_rules_day_of_week_range" CHECK ("day_of_week" BETWEEN 0 AND 6);
ALTER TABLE "staff_availability_rules" ADD CONSTRAINT "staff_availability_rules_time_order" CHECK ("start_local_time" < "end_local_time");
ALTER TABLE "staff_availability_rules" ADD CONSTRAINT "staff_availability_rules_effective_range" CHECK ("effective_from" IS NULL OR "effective_until" IS NULL OR "effective_from" <= "effective_until");

-- Partial-day exceptions must carry both local times (start < end); a
-- full-day exception must carry neither (docs task Phase 14: "Partial-day
-- unavailability").
ALTER TABLE "staff_availability_exceptions" ADD CONSTRAINT "staff_availability_exceptions_partial_day_times" CHECK (
  ("is_full_day" = true AND "start_local_time" IS NULL AND "end_local_time" IS NULL)
  OR ("is_full_day" = false AND "start_local_time" IS NOT NULL AND "end_local_time" IS NOT NULL AND "start_local_time" < "end_local_time")
);

-- SPECIAL_HOURS is the only exception type that carries replacement
-- intervals; every other type means the branch is fully closed that date.
ALTER TABLE "branch_schedule_exceptions" ADD CONSTRAINT "branch_schedule_exceptions_intervals_shape" CHECK (
  ("type" = 'SPECIAL_HOURS' AND "intervals" IS NOT NULL)
  OR ("type" != 'SPECIAL_HOURS' AND "intervals" IS NULL)
);

ALTER TABLE "branch_booking_policies" ADD CONSTRAINT "branch_booking_policies_positive_values" CHECK (
  "slot_interval_minutes" > 0
  AND "min_booking_lead_time_minutes" >= 0
  AND "max_booking_horizon_days" > 0
  AND "buffer_before_minutes" >= 0
  AND "buffer_after_minutes" >= 0
  AND "cancellation_cutoff_minutes" >= 0
);

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_time_order" CHECK ("end_at" > "start_at");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_occupied_time_order" CHECK ("occupied_end_at" > "occupied_start_at");
-- Buffers only ever extend the occupied window outward from the service
-- time itself, never shrink it.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_occupied_contains_service_time" CHECK ("occupied_start_at" <= "start_at" AND "occupied_end_at" >= "end_at");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_total_price_non_negative" CHECK ("total_price_minor" >= 0);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_version_positive" CHECK ("version" > 0);

ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_duration_positive" CHECK ("duration_minutes_snapshot" > 0);
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_price_non_negative" CHECK ("price_minor_snapshot" >= 0);

-- ---------------------------------------------------------------------------
-- Hand-written: double-booking prevention (docs task Phase 18)
--
-- A PostgreSQL EXCLUDE constraint using the assigned staff member and a
-- UTC timestamp range covering the *occupied* window (service time plus
-- buffers). `btree_gist` supplies the GiST equality operator class this
-- needs for the uuid column; without it, only the range side could use a
-- GiST index and the equality side could not participate in the same
-- exclusion constraint. `[)` bounds (inclusive start, exclusive end) mean
-- two appointments that are exactly back-to-back do not count as
-- overlapping — "adjacent" bookings are allowed, only genuine overlap is
-- rejected. The `WHERE` clause limits this to CONFIRMED appointments only
-- (docs task: "Apply it only to statuses that block availability" /
-- "Cancelled appointments do not block the slot"); NO_SHOW is likewise
-- excluded since by the time an appointment is marked no-show its time
-- has already passed and cannot conflict with a new booking anyway.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_staff_double_booking"
  EXCLUDE USING gist (
    "assigned_staff_profile_id" WITH =,
    tstzrange("occupied_start_at", "occupied_end_at", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED');
