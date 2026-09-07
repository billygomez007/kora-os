-- Restore marketplace search indexes unintentionally removed by the products/inventory migration.

CREATE INDEX IF NOT EXISTS "public_business_profiles_display_name_trgm_idx" ON "public_business_profiles" USING GIN ("display_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "public_business_profiles_search_keywords_trgm_idx" ON "public_business_profiles" USING GIN ("search_keywords" gin_trgm_ops);
