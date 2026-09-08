ALTER TABLE "marketplace_orders"
ADD COLUMN "idempotency_key" TEXT;

UPDATE "marketplace_orders"
SET "idempotency_key" = 'legacy-' || "id"::text
WHERE "idempotency_key" IS NULL;

ALTER TABLE "marketplace_orders"
ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE UNIQUE INDEX "marketplace_orders_customer_profile_id_idempotency_key_key"
ON "marketplace_orders"("customer_profile_id", "idempotency_key");
