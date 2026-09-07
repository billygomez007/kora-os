CREATE TYPE "commerce_line_item_kind" AS ENUM ('SERVICE', 'PRODUCT');

ALTER TABLE "checkout_line_items"
  ADD COLUMN "kind" "commerce_line_item_kind" NOT NULL DEFAULT 'SERVICE',
  ADD COLUMN "product_id" UUID,
  ADD COLUMN "product_variant_id" UUID,
  ADD COLUMN "product_name_snapshot" TEXT,
  ADD COLUMN "variant_name_snapshot" TEXT,
  ADD COLUMN "sku_snapshot" TEXT,
  ADD COLUMN "barcode_snapshot" TEXT,
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "unit_price_minor_snapshot" INTEGER;

ALTER TABLE "transaction_line_items"
  ADD COLUMN "kind" "commerce_line_item_kind" NOT NULL DEFAULT 'SERVICE',
  ADD COLUMN "product_id" UUID,
  ADD COLUMN "product_variant_id" UUID,
  ADD COLUMN "product_name_snapshot" TEXT,
  ADD COLUMN "variant_name_snapshot" TEXT,
  ADD COLUMN "sku_snapshot" TEXT,
  ADD COLUMN "barcode_snapshot" TEXT,
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "unit_price_minor_snapshot" INTEGER;

UPDATE "checkout_line_items"
SET "unit_price_minor_snapshot" = "price_minor_snapshot"
WHERE "unit_price_minor_snapshot" IS NULL;

UPDATE "transaction_line_items"
SET "unit_price_minor_snapshot" = "price_minor_snapshot"
WHERE "unit_price_minor_snapshot" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "checkout_line_items"
    WHERE "unit_price_minor_snapshot" IS NULL
  ) THEN
    RAISE EXCEPTION 'checkout_line_items unit price backfill failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "transaction_line_items"
    WHERE "unit_price_minor_snapshot" IS NULL
  ) THEN
    RAISE EXCEPTION 'transaction_line_items unit price backfill failed';
  END IF;
END
$$;

ALTER TABLE "checkout_line_items"
  ALTER COLUMN "unit_price_minor_snapshot" SET NOT NULL,
  ALTER COLUMN "service_session_item_id" DROP NOT NULL,
  ALTER COLUMN "service_id" DROP NOT NULL,
  ALTER COLUMN "staff_profile_id" DROP NOT NULL,
  ALTER COLUMN "service_name_snapshot" DROP NOT NULL,
  ALTER COLUMN "duration_minutes_snapshot" DROP NOT NULL;

ALTER TABLE "transaction_line_items"
  ALTER COLUMN "unit_price_minor_snapshot" SET NOT NULL,
  ALTER COLUMN "service_session_item_id" DROP NOT NULL,
  ALTER COLUMN "service_id" DROP NOT NULL,
  ALTER COLUMN "staff_profile_id" DROP NOT NULL,
  ALTER COLUMN "service_name_snapshot" DROP NOT NULL,
  ALTER COLUMN "duration_minutes_snapshot" DROP NOT NULL;

CREATE UNIQUE INDEX "checkout_line_items_service_session_item_id_key"
  ON "checkout_line_items"("service_session_item_id");

CREATE INDEX "checkout_line_items_organization_id_product_id_idx"
  ON "checkout_line_items"("organization_id", "product_id");

CREATE INDEX "checkout_line_items_organization_id_product_variant_id_idx"
  ON "checkout_line_items"("organization_id", "product_variant_id");

CREATE INDEX "transaction_line_items_organization_id_product_id_idx"
  ON "transaction_line_items"("organization_id", "product_id");

CREATE INDEX "transaction_line_items_organization_id_product_variant_id_idx"
  ON "transaction_line_items"("organization_id", "product_variant_id");

ALTER TABLE "checkout_line_items"
  ADD CONSTRAINT "checkout_line_items_organization_id_product_id_fkey"
  FOREIGN KEY ("organization_id", "product_id")
  REFERENCES "products"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "checkout_line_items"
  ADD CONSTRAINT "checkout_line_items_organization_id_product_id_product_var_fkey"
  FOREIGN KEY ("organization_id", "product_id", "product_variant_id")
  REFERENCES "product_variants"("organization_id", "product_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transaction_line_items"
  ADD CONSTRAINT "transaction_line_items_organization_id_product_id_fkey"
  FOREIGN KEY ("organization_id", "product_id")
  REFERENCES "products"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transaction_line_items"
  ADD CONSTRAINT "transaction_line_items_organization_id_product_id_product__fkey"
  FOREIGN KEY ("organization_id", "product_id", "product_variant_id")
  REFERENCES "product_variants"("organization_id", "product_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "checkout_line_items"
  ADD CONSTRAINT "checkout_line_items_quantity_positive_check"
  CHECK ("quantity" > 0),
  ADD CONSTRAINT "checkout_line_items_unit_price_nonnegative_check"
  CHECK ("unit_price_minor_snapshot" >= 0),
  ADD CONSTRAINT "checkout_line_items_total_nonnegative_check"
  CHECK ("price_minor_snapshot" >= 0),
  ADD CONSTRAINT "checkout_line_items_kind_shape_check"
  CHECK (
    (
      "kind" = 'SERVICE'
      AND "service_session_item_id" IS NOT NULL
      AND "service_id" IS NOT NULL
      AND "staff_profile_id" IS NOT NULL
      AND "service_name_snapshot" IS NOT NULL
      AND "duration_minutes_snapshot" IS NOT NULL
      AND "product_id" IS NULL
      AND "product_variant_id" IS NULL
    )
    OR
    (
      "kind" = 'PRODUCT'
      AND "service_session_item_id" IS NULL
      AND "service_id" IS NULL
      AND "staff_profile_id" IS NULL
      AND "service_name_snapshot" IS NULL
      AND "duration_minutes_snapshot" IS NULL
      AND "product_id" IS NOT NULL
      AND "product_variant_id" IS NOT NULL
      AND "product_name_snapshot" IS NOT NULL
      AND "variant_name_snapshot" IS NOT NULL
    )
  );

ALTER TABLE "transaction_line_items"
  ADD CONSTRAINT "transaction_line_items_quantity_positive_check"
  CHECK ("quantity" > 0),
  ADD CONSTRAINT "transaction_line_items_unit_price_nonnegative_check"
  CHECK ("unit_price_minor_snapshot" >= 0),
  ADD CONSTRAINT "transaction_line_items_total_nonnegative_check"
  CHECK ("price_minor_snapshot" >= 0),
  ADD CONSTRAINT "transaction_line_items_kind_shape_check"
  CHECK (
    (
      "kind" = 'SERVICE'
      AND "service_session_item_id" IS NOT NULL
      AND "service_id" IS NOT NULL
      AND "staff_profile_id" IS NOT NULL
      AND "service_name_snapshot" IS NOT NULL
      AND "duration_minutes_snapshot" IS NOT NULL
      AND "product_id" IS NULL
      AND "product_variant_id" IS NULL
    )
    OR
    (
      "kind" = 'PRODUCT'
      AND "service_session_item_id" IS NULL
      AND "service_id" IS NULL
      AND "staff_profile_id" IS NULL
      AND "service_name_snapshot" IS NULL
      AND "duration_minutes_snapshot" IS NULL
      AND "product_id" IS NOT NULL
      AND "product_variant_id" IS NOT NULL
      AND "product_name_snapshot" IS NOT NULL
      AND "variant_name_snapshot" IS NOT NULL
    )
  );
