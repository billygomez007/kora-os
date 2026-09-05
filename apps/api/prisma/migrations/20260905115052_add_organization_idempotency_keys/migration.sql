-- Kora OS: Organization onboarding idempotency (docs task "Business
-- Onboarding Contract"). A client-generated Idempotency-Key header lets a
-- retried POST /v1/organizations request replay its original result
-- rather than creating a second organization, owner membership, and
-- trial subscription. Scoped per owner user (there is no organization to
-- scope by yet on the very first attempt in a retry sequence).
--
-- The two DropIndex statements `prisma migrate diff` always proposes for
-- public_business_profiles_display_name_trgm_idx and
-- _search_keywords_trgm_idx (hand-written pg_trgm indexes not declared in
-- schema.prisma) have been removed from this file, exactly as in every
-- prior migration in this project.

-- CreateTable
CREATE TABLE "organization_idempotency_keys" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_idempotency_keys_owner_user_id_idempotency_key_key" ON "organization_idempotency_keys"("owner_user_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "organization_idempotency_keys" ADD CONSTRAINT "organization_idempotency_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
