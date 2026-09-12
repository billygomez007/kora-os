CREATE TYPE "staff_invitation_delivery_status" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

ALTER TABLE "staff_invitations"
  ADD COLUMN "delivery_status" "staff_invitation_delivery_status" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "delivery_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_delivery_attempt_at" TIMESTAMPTZ(6),
  ADD COLUMN "next_delivery_attempt_at" TIMESTAMPTZ(6),
  ADD COLUMN "delivered_at" TIMESTAMPTZ(6),
  ADD COLUMN "provider_message_id" TEXT,
  ADD COLUMN "last_delivery_error_code" TEXT,
  ADD COLUMN "delivery_retryable" BOOLEAN NOT NULL DEFAULT true;
