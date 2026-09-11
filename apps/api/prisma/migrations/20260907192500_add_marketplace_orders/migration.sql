CREATE TYPE "MarketplaceOrderStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "MarketplaceFulfillmentMethod" AS ENUM (
  'PICKUP',
  'DELIVERY'
);

CREATE TABLE "marketplace_orders" (
  "id" UUID NOT NULL,
  "reference" TEXT NOT NULL,
  "customer_profile_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "business_slug_snapshot" TEXT NOT NULL,
  "business_name_snapshot" TEXT NOT NULL,
  "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'PENDING',
  "fulfillment_method" "MarketplaceFulfillmentMethod" NOT NULL DEFAULT 'PICKUP',
  "currency" CHAR(3) NOT NULL,
  "subtotal_minor" INTEGER NOT NULL,
  "total_minor" INTEGER NOT NULL,
  "checkout_id" UUID,
  "customer_note" TEXT,
  "accepted_at" TIMESTAMPTZ(6),
  "ready_for_pickup_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "cancellation_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketplace_order_items" (
  "id" UUID NOT NULL,
  "marketplace_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "variant_name_snapshot" TEXT NOT NULL,
  "sku_snapshot" TEXT,
  "image_url_snapshot" TEXT,
  "quantity" INTEGER NOT NULL,
  "unit_price_minor_snapshot" INTEGER NOT NULL,
  "price_minor_snapshot" INTEGER NOT NULL,
  "currency_snapshot" CHAR(3) NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "marketplace_order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_orders_reference_key"
ON "marketplace_orders"("reference");

CREATE INDEX "marketplace_orders_customer_profile_id_created_at_idx"
ON "marketplace_orders"("customer_profile_id", "created_at");

CREATE INDEX "marketplace_orders_organization_id_status_created_at_idx"
ON "marketplace_orders"("organization_id", "status", "created_at");

CREATE INDEX "marketplace_orders_branch_id_status_created_at_idx"
ON "marketplace_orders"("branch_id", "status", "created_at");

CREATE INDEX "marketplace_orders_checkout_id_idx"
ON "marketplace_orders"("checkout_id");

CREATE INDEX "marketplace_order_items_marketplace_order_id_display_order_idx"
ON "marketplace_order_items"("marketplace_order_id", "display_order");

CREATE INDEX "marketplace_order_items_product_variant_id_idx"
ON "marketplace_order_items"("product_variant_id");

ALTER TABLE "marketplace_order_items"
ADD CONSTRAINT "marketplace_order_items_marketplace_order_id_fkey"
FOREIGN KEY ("marketplace_order_id")
REFERENCES "marketplace_orders"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
