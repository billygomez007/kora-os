ALTER TABLE "products"
ADD COLUMN "is_visible_on_marketplace" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "image_url" TEXT;
