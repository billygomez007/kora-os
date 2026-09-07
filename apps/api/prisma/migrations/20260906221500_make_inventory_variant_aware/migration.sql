-- DropIndex
DROP INDEX "branch_inventory_branch_id_product_id_key";

-- DropIndex
DROP INDEX "inventory_movements_branch_id_product_id_occurred_at_idx";

-- DropIndex
DROP INDEX "products_organization_id_barcode_key";

-- DropIndex
DROP INDEX "products_organization_id_sku_key";

-- AlterTable
ALTER TABLE "branch_inventory" ADD COLUMN     "product_variant_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "product_variant_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "product_variants" ALTER COLUMN "selling_price_minor" SET NOT NULL;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "barcode",
DROP COLUMN "cost_price_minor",
DROP COLUMN "selling_price_minor",
DROP COLUMN "sku";

-- CreateIndex
CREATE INDEX "branch_inventory_organization_id_product_variant_id_idx" ON "branch_inventory"("organization_id", "product_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_inventory_branch_id_product_variant_id_key" ON "branch_inventory"("branch_id", "product_variant_id");

-- CreateIndex
CREATE INDEX "inventory_movements_organization_id_product_variant_id_occu_idx" ON "inventory_movements"("organization_id", "product_variant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_branch_id_product_variant_id_occurred_a_idx" ON "inventory_movements"("branch_id", "product_variant_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organization_id_product_id_id_key" ON "product_variants"("organization_id", "product_id", "id");

-- AddForeignKey
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_organization_id_product_id_product_varian_fkey" FOREIGN KEY ("organization_id", "product_id", "product_variant_id") REFERENCES "product_variants"("organization_id", "product_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_product_id_product_var_fkey" FOREIGN KEY ("organization_id", "product_id", "product_variant_id") REFERENCES "product_variants"("organization_id", "product_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
