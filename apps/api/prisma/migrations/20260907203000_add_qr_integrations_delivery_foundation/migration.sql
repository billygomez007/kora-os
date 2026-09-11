-- CreateEnum
CREATE TYPE "QrCodeType" AS ENUM ('BUSINESS', 'BRANCH', 'TABLE', 'COUNTER', 'ROOM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "IntegrationCategory" AS ENUM ('DELIVERY', 'PAYMENT', 'COMMUNICATION', 'ACCOUNTING', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DRAFT', 'QUOTING', 'QUOTED', 'REQUESTED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryEventSource" AS ENUM ('KORA', 'PROVIDER');

-- CreateTable
CREATE TABLE "business_qr_codes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "code" TEXT NOT NULL,
    "type" "QrCodeType" NOT NULL,
    "label" TEXT,
    "resource_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "scan_count" BIGINT NOT NULL DEFAULT 0,
    "last_scanned_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "category" "IntegrationCategory" NOT NULL,
    "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "display_name" TEXT,
    "config_json" JSONB,
    "secret_reference" TEXT,
    "capabilities" JSONB,
    "last_health_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_requests" (
    "id" UUID NOT NULL,
    "marketplace_order_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "integration_connection_id" UUID,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'DRAFT',
    "provider_reference" TEXT,
    "tracking_url" TEXT,
    "rider_name" TEXT,
    "rider_phone" TEXT,
    "currency" CHAR(3),
    "quoted_fee_minor" INTEGER,
    "final_fee_minor" INTEGER,
    "destination_json" JSONB NOT NULL,
    "pickup_snapshot_json" JSONB NOT NULL,
    "requested_at" TIMESTAMPTZ(6),
    "assigned_at" TIMESTAMPTZ(6),
    "picked_up_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delivery_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_events" (
    "id" UUID NOT NULL,
    "delivery_request_id" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "source" "DeliveryEventSource" NOT NULL,
    "provider_event_id" TEXT,
    "payload_json" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_qr_codes_code_key" ON "business_qr_codes"("code");

-- CreateIndex
CREATE INDEX "business_qr_codes_organization_id_type_is_active_idx" ON "business_qr_codes"("organization_id", "type", "is_active");

-- CreateIndex
CREATE INDEX "business_qr_codes_organization_id_branch_id_idx" ON "business_qr_codes"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_qr_codes_organization_id_code_key" ON "business_qr_codes"("organization_id", "code");

-- CreateIndex
CREATE INDEX "integration_connections_organization_id_category_status_idx" ON "integration_connections"("organization_id", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_organization_id_provider_key_key" ON "integration_connections"("organization_id", "provider_key");

-- CreateIndex
CREATE INDEX "delivery_requests_organization_id_status_idx" ON "delivery_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "delivery_requests_integration_connection_id_status_idx" ON "delivery_requests"("integration_connection_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_requests_marketplace_order_id_key" ON "delivery_requests"("marketplace_order_id");

-- CreateIndex
CREATE INDEX "delivery_events_delivery_request_id_occurred_at_idx" ON "delivery_events"("delivery_request_id", "occurred_at");

-- CreateIndex
CREATE INDEX "delivery_events_provider_event_id_idx" ON "delivery_events"("provider_event_id");

-- AddForeignKey
ALTER TABLE "business_qr_codes" ADD CONSTRAINT "business_qr_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_qr_codes" ADD CONSTRAINT "business_qr_codes_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_requests" ADD CONSTRAINT "delivery_requests_marketplace_order_id_fkey" FOREIGN KEY ("marketplace_order_id") REFERENCES "marketplace_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_requests" ADD CONSTRAINT "delivery_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_requests" ADD CONSTRAINT "delivery_requests_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_requests" ADD CONSTRAINT "delivery_requests_integration_connection_id_fkey" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_delivery_request_id_fkey" FOREIGN KEY ("delivery_request_id") REFERENCES "delivery_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

