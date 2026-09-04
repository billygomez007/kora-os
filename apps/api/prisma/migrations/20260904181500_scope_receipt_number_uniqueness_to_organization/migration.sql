-- Kora OS: scope Receipt.receiptNumber uniqueness to the organization,
-- not the whole platform.
--
-- The prior migration (20260904180000_add_commission_and_receipt_models)
-- declared `receiptNumber` globally unique. A receipt number is built
-- from Branch.code, which is itself only unique *per organization*
-- (@@unique([organizationId, code])) — two different organizations may
-- legitimately have a branch coded "MAIN", which would format to the
-- identical receipt number string under a global constraint. Real-world
-- receipt numbers are always scoped to the issuing business; nothing
-- about "human-readable" or "database-enforced uniqueness" implies
-- platform-wide uniqueness. Forward-only correction — the prior
-- migration is not edited (docs task: "Do not modify an already-applied
-- migration").
--
-- The two DropIndex statements for public_business_profiles_display_
-- name_trgm_idx / _search_keywords_trgm_idx that `prisma migrate diff`
-- always proposes (hand-written pg_trgm indexes not declared in
-- schema.prisma) have been removed from this file, exactly as in every
-- prior migration in this project.

DROP INDEX "receipts_receipt_number_key";

CREATE UNIQUE INDEX "receipts_organization_id_receipt_number_key" ON "receipts"("organization_id", "receipt_number");
