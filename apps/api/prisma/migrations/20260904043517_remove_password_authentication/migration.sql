-- Kora OS is passwordless by product decision (docs/SECURITY.md section
-- 6). This migration removes the password credential columns added by
-- `add_kora_authentication_rbac_and_discovery` — added and removed within
-- the same development cycle, before any production use, so this is a
-- straightforward forward migration rather than a data-carrying one.
-- `auth_identities.password_hash`/`password_algorithm` had zero rows with
-- any value in them at the time this migration was written (verified
-- against the local database before generating it); dropping them loses
-- no data.
--
-- Generated with `prisma migrate diff --from-config-datasource
-- --to-schema prisma/schema.prisma --script` and hand-edited to remove
-- two DROP INDEX statements the diff incorrectly proposed for the
-- `pg_trgm` search indexes added by hand (raw SQL, not declared in
-- schema.prisma) in the previous migration — those indexes are unrelated
-- to this change and must be kept.

-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('AUTHENTICATE');

-- CreateEnum
CREATE TYPE "otp_challenge_status" AS ENUM ('ACTIVE', 'CONSUMED', 'INVALIDATED', 'LOCKED');

-- AlterEnum: drop PASSWORD, add EMAIL_OTP from the auth_provider enum.
-- Standard Postgres rename-swap pattern for altering an enum type still
-- in use by a column; safe here regardless since auth_identities has zero
-- rows.
BEGIN;
CREATE TYPE "auth_provider_new" AS ENUM ('EMAIL_OTP', 'GOOGLE', 'APPLE', 'PHONE_OTP', 'EMAIL_MAGIC_LINK');
ALTER TABLE "auth_identities" ALTER COLUMN "provider" TYPE "auth_provider_new" USING ("provider"::text::"auth_provider_new");
ALTER TYPE "auth_provider" RENAME TO "auth_provider_old";
ALTER TYPE "auth_provider_new" RENAME TO "auth_provider";
DROP TYPE "public"."auth_provider_old";
COMMIT;

-- AlterTable
ALTER TABLE "auth_identities" DROP COLUMN "password_algorithm",
DROP COLUMN "password_hash";

-- CreateTable
CREATE TABLE "email_otp_challenges" (
    "id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "purpose" "otp_purpose" NOT NULL DEFAULT 'AUTHENTICATE',
    "code_digest" TEXT NOT NULL,
    "status" "otp_challenge_status" NOT NULL DEFAULT 'ACTIVE',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "invalidated_at" TIMESTAMPTZ(6),
    "request_ip_hash" TEXT,
    "request_user_agent" TEXT,
    "replaces_challenge_id" UUID,

    CONSTRAINT "email_otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_otp_challenges_email_normalized_purpose_status_idx" ON "email_otp_challenges"("email_normalized", "purpose", "status");

-- CreateIndex
CREATE INDEX "email_otp_challenges_request_ip_hash_created_at_idx" ON "email_otp_challenges"("request_ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "email_otp_challenges_expires_at_idx" ON "email_otp_challenges"("expires_at");
