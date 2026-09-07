-- AlterTable
ALTER TABLE "receipt_line_items" ADD COLUMN     "barcode_snapshot" TEXT,
ADD COLUMN     "kind" "commerce_line_item_kind" NOT NULL DEFAULT 'SERVICE',
ADD COLUMN     "product_name_snapshot" TEXT,
ADD COLUMN     "sku_snapshot" TEXT,
ADD COLUMN     "variant_name_snapshot" TEXT,
ALTER COLUMN "service_name_snapshot" DROP NOT NULL;
