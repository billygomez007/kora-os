-- Add ServiceSessionStatusHistory: an append-only domain lifecycle
-- ledger for one ServiceSession, complementing (not replacing) the
-- global AuditEvent trail.
--
-- Generated via `prisma migrate diff --from-config-datasource --to-schema
-- prisma/schema.prisma --script` and hand-edited:
--
-- 1. Two `DROP INDEX` statements the diff tool proposed for
--    "public_business_profiles_display_name_trgm_idx" and
--    "...search_keywords_trgm_idx" were removed. Those pg_trgm indexes
--    were added by hand-written raw SQL in the
--    add_kora_authentication_rbac_and_discovery migration and are not
--    declared in schema.prisma's model definitions, so the diff tool
--    always proposes dropping them every time — the same false positive
--    already documented in three earlier migrations. They must stay.
-- 2. Two CHECK constraints were added by hand — Prisma has no
--    declarative way to express a CHECK constraint in this
--    schema-first workflow:
--    - `previous_status IS NULL` if and only if `new_status =
--      'IN_PROGRESS'`, since no transition other than session start
--      ever produces IN_PROGRESS.
--    - `cancel_disposition IS NOT NULL` if and only if `new_status =
--      'CANCELLED'`, the same shape pattern
--      `service_sessions_cancel_disposition_shape` already establishes
--      on the `service_sessions` table itself.

-- CreateTable
CREATE TABLE "service_session_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_session_id" UUID NOT NULL,
    "previous_status" "service_session_status",
    "new_status" "service_session_status" NOT NULL,
    "actor_user_id" UUID,
    "actor_membership_id" UUID,
    "reason" TEXT,
    "cancel_disposition" "service_session_cancel_disposition",
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_session_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_session_status_history_service_session_id_occurred__idx" ON "service_session_status_history"("service_session_id", "occurred_at");

-- CreateIndex
CREATE INDEX "service_session_status_history_organization_id_occurred_at_idx" ON "service_session_status_history"("organization_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "service_session_status_history" ADD CONSTRAINT "service_session_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_session_status_history" ADD CONSTRAINT "service_session_status_history_service_session_id_fkey" FOREIGN KEY ("service_session_id") REFERENCES "service_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written: shape CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "service_session_status_history" ADD CONSTRAINT "service_session_status_history_initial_shape" CHECK (
  ("previous_status" IS NULL AND "new_status" = 'IN_PROGRESS')
  OR ("previous_status" IS NOT NULL AND "new_status" != 'IN_PROGRESS')
);

ALTER TABLE "service_session_status_history" ADD CONSTRAINT "service_session_status_history_cancel_disposition_shape" CHECK (
  ("new_status" = 'CANCELLED' AND "cancel_disposition" IS NOT NULL)
  OR ("new_status" != 'CANCELLED' AND "cancel_disposition" IS NULL)
);
