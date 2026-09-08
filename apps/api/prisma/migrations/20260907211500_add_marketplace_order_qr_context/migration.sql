ALTER TABLE "marketplace_orders"
ADD COLUMN "source_qr_code_id" UUID,
ADD COLUMN "source_qr_type" "QrCodeType",
ADD COLUMN "source_qr_label" TEXT,
ADD COLUMN "source_qr_resource_key" TEXT;

ALTER TABLE "marketplace_orders"
ADD CONSTRAINT "marketplace_orders_source_qr_code_id_fkey"
FOREIGN KEY ("source_qr_code_id")
REFERENCES "business_qr_codes"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "marketplace_orders_source_qr_code_id_idx"
ON "marketplace_orders"("source_qr_code_id");
