-- Allow a staff-assisted appointment to have no linked CustomerProfile
-- (docs task Phase 20: a walk-in-style customer with no Kora account).
--
-- Generated via `prisma migrate diff --from-config-datasource --to-schema
-- prisma/schema.prisma --script` and hand-edited to remove the two
-- `DROP INDEX` statements the diff tool proposed for
-- "public_business_profiles_display_name_trgm_idx" and
-- "...search_keywords_trgm_idx" — the same recurring false positive
-- documented in the remove_password_authentication and
-- add_service_catalogue_availability_appointments migrations (those
-- pg_trgm indexes are hand-written raw SQL, not declared in
-- schema.prisma, so the diff tool always sees them as "extra"). They
-- must stay.
--
-- The `appointments` table itself was created moments earlier in this
-- same development session by the
-- add_service_catalogue_availability_appointments migration and holds
-- zero rows in every environment this has been applied to — relaxing
-- NOT NULL and changing the foreign key's ON DELETE behavior from
-- RESTRICT to SET NULL are both safe regardless.

ALTER TABLE "appointments" DROP CONSTRAINT "appointments_customer_profile_id_fkey";

ALTER TABLE "appointments" ALTER COLUMN "customer_profile_id" DROP NOT NULL;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
