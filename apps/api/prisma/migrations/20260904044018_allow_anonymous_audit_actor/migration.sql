-- Relaxes audit_events.actor_user_id from NOT NULL to nullable, mirroring
-- the existing nullable organization_id ("platform-level actions that are
-- not scoped to a single organization"): an OTP request for an email with
-- no Kora account yet has no user to attribute the "OTP requested" audit
-- event to — the account, if any, is only created on successful
-- verification (docs task Phase C). entity_type/entity_id (e.g.
-- "email_otp_challenge"/the challenge ID) carry the subject of such an
-- event instead. Relaxing a NOT NULL constraint is always safe regardless
-- of existing data — no existing row's actor_user_id becomes invalid.
--
-- Generated with `prisma migrate diff --from-config-datasource
-- --to-schema prisma/schema.prisma --script` and hand-edited to remove
-- two DROP INDEX statements the diff incorrectly proposed for the
-- pg_trgm search indexes (raw SQL, not declared in schema.prisma), same
-- as in the previous migration.

-- AlterTable
ALTER TABLE "audit_events" ALTER COLUMN "actor_user_id" DROP NOT NULL;
