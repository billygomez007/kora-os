-- Walk-in / anonymous cash sales (Products + Sales MVP) have no
-- CustomerRecord. Checkout.customer_record_id was already made nullable
-- in the prior migration; Transaction and Receipt copy that value
-- forward at posting/issuance time and must accept null too.
ALTER TABLE "transactions"
  ALTER COLUMN "customer_record_id" DROP NOT NULL;

ALTER TABLE "receipts"
  ALTER COLUMN "customer_record_id" DROP NOT NULL;
