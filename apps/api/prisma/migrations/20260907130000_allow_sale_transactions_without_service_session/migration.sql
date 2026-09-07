-- A product-only (or mixed) checkout has no ServiceSession, so a SALE
-- Transaction posted from it never has one either. `checkout_id` stays
-- required for every SALE (a SALE always comes from exactly one
-- Checkout, service or commerce); only the service_session_id half of
-- the original transactions_kind_shape constraint is relaxed. The
-- REFUND/REVERSAL branch is untouched.
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_kind_shape";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_kind_shape" CHECK (
  ("kind" = 'SALE' AND "corrected_transaction_id" IS NULL AND "checkout_id" IS NOT NULL)
  OR ("kind" != 'SALE' AND "corrected_transaction_id" IS NOT NULL AND "checkout_id" IS NULL AND "service_session_id" IS NULL)
);
