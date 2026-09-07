ALTER TABLE "checkouts"
  ALTER COLUMN "service_session_id" DROP NOT NULL,
  ALTER COLUMN "customer_record_id" DROP NOT NULL,
  ALTER COLUMN "assigned_staff_profile_id" DROP NOT NULL;
