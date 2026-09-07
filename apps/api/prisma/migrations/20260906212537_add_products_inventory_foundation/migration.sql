-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING_BALANCE', 'STOCK_RECEIVED', 'MANUAL_ADJUSTMENT', 'SALE', 'SALE_REVERSAL', 'RETURN', 'DAMAGED', 'LOST', 'EXPIRED', 'TRANSFER_IN', 'TRANSFER_OUT');

-- DropIndex
DROP INDEX "public_business_profiles_display_name_trgm_idx";

-- DropIndex
DROP INDEX "public_business_profiles_search_keywords_trgm_idx";

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_category_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "cost_price_minor" INTEGER,
    "selling_price_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "track_inventory" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "cost_price_minor" INTEGER,
    "selling_price_minor" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_inventory" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "quantity_before" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "unit_cost_minor" INTEGER,
    "reference" TEXT,
    "note" TEXT,
    "actor_membership_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_categories_organization_id_archived_at_idx" ON "product_categories"("organization_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_organization_id_id_key" ON "product_categories"("organization_id", "id");

-- CreateIndex
CREATE INDEX "products_organization_id_archived_at_idx" ON "products"("organization_id", "archived_at");

-- CreateIndex
CREATE INDEX "products_organization_id_product_category_id_idx" ON "products"("organization_id", "product_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_id_key" ON "products"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_sku_key" ON "products"("organization_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_barcode_key" ON "products"("organization_id", "barcode");

-- CreateIndex
CREATE INDEX "product_variants_organization_id_product_id_archived_at_idx" ON "product_variants"("organization_id", "product_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organization_id_id_key" ON "product_variants"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organization_id_sku_key" ON "product_variants"("organization_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organization_id_barcode_key" ON "product_variants"("organization_id", "barcode");

-- CreateIndex
CREATE INDEX "branch_inventory_organization_id_branch_id_idx" ON "branch_inventory"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "branch_inventory_organization_id_product_id_idx" ON "branch_inventory"("organization_id", "product_id");

-- CreateIndex
CREATE INDEX "branch_inventory_branch_id_quantity_on_hand_idx" ON "branch_inventory"("branch_id", "quantity_on_hand");

-- CreateIndex
CREATE UNIQUE INDEX "branch_inventory_branch_id_product_id_key" ON "branch_inventory"("branch_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_movements_organization_id_branch_id_occurred_at_idx" ON "inventory_movements"("organization_id", "branch_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_organization_id_product_id_occurred_at_idx" ON "inventory_movements"("organization_id", "product_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_branch_id_product_id_occurred_at_idx" ON "inventory_movements"("branch_id", "product_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_product_category_id_fkey" FOREIGN KEY ("organization_id", "product_category_id") REFERENCES "product_categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
