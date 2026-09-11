ALTER TABLE "marketplace_orders"
ADD CONSTRAINT "marketplace_orders_customer_profile_id_fkey"
FOREIGN KEY ("customer_profile_id")
REFERENCES "customer_profiles"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "marketplace_orders"
ADD CONSTRAINT "marketplace_orders_organization_id_fkey"
FOREIGN KEY ("organization_id")
REFERENCES "organizations"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "marketplace_orders"
ADD CONSTRAINT "marketplace_orders_organization_id_branch_id_fkey"
FOREIGN KEY ("organization_id", "branch_id")
REFERENCES "branches"("organization_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
