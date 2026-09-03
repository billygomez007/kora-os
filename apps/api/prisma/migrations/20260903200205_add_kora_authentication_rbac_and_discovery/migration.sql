/*
  Warnings:

  - You are about to drop the column `password_hash` on the `users` table. All the data in the column will be lost.
  - Added the required column `role_id` to the `staff_invitations` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('PASSWORD', 'GOOGLE', 'APPLE', 'PHONE_OTP', 'EMAIL_MAGIC_LINK');

-- CreateEnum
CREATE TYPE "session_revoked_reason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'EXPIRED', 'ADMIN');

-- CreateEnum
CREATE TYPE "business_profile_visibility" AS ENUM ('PUBLIC', 'LINK_ONLY', 'PRIVATE');

-- CreateEnum
CREATE TYPE "business_verification_status" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "is_discoverable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "opening_hours_note" TEXT,
ADD COLUMN     "public_email" TEXT,
ADD COLUMN     "public_phone" TEXT;

-- AlterTable
ALTER TABLE "staff_invitations" ADD COLUMN     "branch_id" UUID,
ADD COLUMN     "role_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password_hash";

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "auth_provider" NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "password_hash" TEXT,
    "password_algorithm" TEXT DEFAULT 'argon2id',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_label" TEXT,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" "session_revoked_reason",

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_profile_id" UUID,
    "name" TEXT NOT NULL,
    "phone_e164" TEXT,
    "email_normalized" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "customer_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_favorites" (
    "id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "business_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_category_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_category_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_business_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "logo_image_url" TEXT,
    "cover_image_url" TEXT,
    "visibility" "business_profile_visibility" NOT NULL DEFAULT 'PRIVATE',
    "verification_status" "business_verification_status" NOT NULL DEFAULT 'UNVERIFIED',
    "search_keywords" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "public_business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_subject_key" ON "auth_identities"("provider", "provider_subject");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_user_id_key" ON "customer_profiles"("user_id");

-- CreateIndex
CREATE INDEX "customer_records_organization_id_customer_profile_id_idx" ON "customer_records"("organization_id", "customer_profile_id");

-- CreateIndex
CREATE INDEX "customer_records_organization_id_phone_e164_idx" ON "customer_records"("organization_id", "phone_e164");

-- CreateIndex
CREATE INDEX "customer_records_organization_id_email_normalized_idx" ON "customer_records"("organization_id", "email_normalized");

-- CreateIndex
CREATE INDEX "customer_favorites_organization_id_idx" ON "customer_favorites"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_favorites_customer_profile_id_organization_id_key" ON "customer_favorites"("customer_profile_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_categories_code_key" ON "business_categories"("code");

-- CreateIndex
CREATE INDEX "organization_category_assignments_category_id_idx" ON "organization_category_assignments"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_category_assignments_organization_id_category__key" ON "organization_category_assignments"("organization_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_business_profiles_organization_id_key" ON "public_business_profiles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_business_profiles_slug_key" ON "public_business_profiles"("slug");

-- CreateIndex
CREATE INDEX "public_business_profiles_visibility_published_at_idx" ON "public_business_profiles"("visibility", "published_at");

-- CreateIndex
CREATE INDEX "branches_organization_id_is_discoverable_idx" ON "branches"("organization_id", "is_discoverable");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_records" ADD CONSTRAINT "customer_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_records" ADD CONSTRAINT "customer_records_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_category_assignments" ADD CONSTRAINT "organization_category_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_category_assignments" ADD CONSTRAINT "organization_category_assignments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "business_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_business_profiles" ADD CONSTRAINT "public_business_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Manual addition (docs task Phase 9): trigram search support for
-- "business name or search text" filtering. pg_trgm lets a partial,
-- misspelling-tolerant ILIKE '%text%' query use a GIN index instead of a
-- full table scan. Safe to add: it only defines a new extension/operator
-- class and two new indexes, and does not touch any existing data.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "public_business_profiles_display_name_trgm_idx" ON "public_business_profiles" USING GIN ("display_name" gin_trgm_ops);

CREATE INDEX "public_business_profiles_search_keywords_trgm_idx" ON "public_business_profiles" USING GIN ("search_keywords" gin_trgm_ops);
