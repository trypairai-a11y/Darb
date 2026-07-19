-- CreateEnum
CREATE TYPE "DeliveryOrderStatus" AS ENUM ('CREATED', 'REJECTED', 'DISPATCHING', 'NO_DRIVER', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryOrderSource" AS ENUM ('FOODICS', 'VENDOR_PORTAL', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'PREPAID');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletOwnerType" AS ENUM ('DRIVER_CASH', 'VENDOR_PAYABLE', 'PLATFORM_REVENUE', 'PLATFORM_CLEARING');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('COD_SETTLEMENT', 'PREPAID_SETTLEMENT', 'REMITTANCE', 'ADJUSTMENT', 'VENDOR_PAYOUT');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('SOS', 'ACCIDENT', 'VEHICLE_BREAKDOWN', 'CUSTOMER_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FoodicsConnStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'VENDOR';

-- AlterTable
ALTER TABLE "CourierOnlineSession" ADD COLUMN     "availability" TEXT NOT NULL DEFAULT 'OFFLINE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vendorId" TEXT;

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "requiresCarOnly" BOOLEAN NOT NULL DEFAULT false,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBranch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "zoneId" TEXT,
    "foodicsBranchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "polygon" JSONB NOT NULL,
    "bbox" JSONB NOT NULL,
    "centroidLat" DECIMAL(10,7),
    "centroidLng" DECIMAL(10,7),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneSurcharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "originZoneId" TEXT NOT NULL,
    "destZoneId" TEXT NOT NULL,
    "surchargeKwd" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoneSurcharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "intraZoneFeeKwd" DECIMAL(10,3) NOT NULL DEFAULT 1.250,
    "driverCashCeilingKwd" DECIMAL(10,3) NOT NULL DEFAULT 100.000,
    "offerWindowSec" INTEGER NOT NULL DEFAULT 15,
    "maxOfferRounds" INTEGER NOT NULL DEFAULT 8,
    "searchRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "gpsStaleAfterSec" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "source" "DeliveryOrderSource" NOT NULL,
    "foodicsOrderId" TEXT,
    "vendorId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "DeliveryOrderStatus" NOT NULL DEFAULT 'CREATED',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'COD',
    "orderTotalKwd" DECIMAL(10,3) NOT NULL,
    "deliveryFeeKwd" DECIMAL(10,3),
    "customerName" TEXT,
    "customerPhone" TEXT,
    "dropoffAddress" TEXT,
    "dropoffLat" DECIMAL(10,7),
    "dropoffLng" DECIMAL(10,7),
    "pickupZoneId" TEXT,
    "dropoffZoneId" TEXT,
    "driverId" TEXT,
    "offerRound" INTEGER NOT NULL DEFAULT 0,
    "requiresCarOnly" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT,
    "cancelReason" TEXT,
    "failureReason" TEXT,
    "proofPhotoUrl" TEXT,
    "podPin" TEXT,
    "codCollectedKwd" DECIMAL(10,3),
    "slaDeadline" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "status" "OfferStatus" NOT NULL DEFAULT 'OFFERED',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerType" "WalletOwnerType" NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "balanceKwd" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "orderId" TEXT,
    "remittanceId" TEXT,
    "memo" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountKwd" DECIMAL(10,3) NOT NULL,
    "runningBalanceKwd" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remittance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amountKwd" DECIMAL(10,3) NOT NULL,
    "method" "DepositMethod" NOT NULL,
    "receiptUrl" TEXT,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletReconciliationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "driverId" TEXT NOT NULL,
    "orderId" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "description" TEXT,
    "reportedVia" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodicsConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "orderTagId" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "status" "FoodicsConnStatus" NOT NULL DEFAULT 'PENDING',
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodicsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_tenantId_isActive_idx" ON "Vendor"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_tenantId_code_key" ON "Vendor"("tenantId", "code");

-- CreateIndex
CREATE INDEX "VendorBranch_tenantId_idx" ON "VendorBranch"("tenantId");

-- CreateIndex
CREATE INDEX "VendorBranch_vendorId_idx" ON "VendorBranch"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBranch_tenantId_foodicsBranchId_key" ON "VendorBranch"("tenantId", "foodicsBranchId");

-- CreateIndex
CREATE INDEX "DeliveryZone_tenantId_isActive_idx" ON "DeliveryZone"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_tenantId_code_key" ON "DeliveryZone"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ZoneSurcharge_tenantId_idx" ON "ZoneSurcharge"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoneSurcharge_tenantId_originZoneId_destZoneId_key" ON "ZoneSurcharge"("tenantId", "originZoneId", "destZoneId");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentSettings_tenantId_key" ON "FulfillmentSettings"("tenantId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_status_idx" ON "DeliveryOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_createdAt_idx" ON "DeliveryOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_vendorId_createdAt_idx" ON "DeliveryOrder"("tenantId", "vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryOrder_driverId_status_idx" ON "DeliveryOrder"("driverId", "status");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_slaDeadline_idx" ON "DeliveryOrder"("tenantId", "slaDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_tenantId_orderNumber_key" ON "DeliveryOrder"("tenantId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_tenantId_foodicsOrderId_key" ON "DeliveryOrder"("tenantId", "foodicsOrderId");

-- CreateIndex
CREATE INDEX "DispatchOffer_tenantId_status_idx" ON "DispatchOffer"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DispatchOffer_driverId_status_idx" ON "DispatchOffer"("driverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchOffer_orderId_driverId_round_key" ON "DispatchOffer"("orderId", "driverId", "round");

-- CreateIndex
CREATE INDEX "WalletAccount_tenantId_ownerType_idx" ON "WalletAccount"("tenantId", "ownerType");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_tenantId_ownerKey_key" ON "WalletAccount"("tenantId", "ownerKey");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key" ON "WalletTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletTransaction_tenantId_createdAt_idx" ON "WalletTransaction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_orderId_idx" ON "WalletTransaction"("orderId");

-- CreateIndex
CREATE INDEX "WalletEntry_tenantId_idx" ON "WalletEntry"("tenantId");

-- CreateIndex
CREATE INDEX "WalletEntry_transactionId_idx" ON "WalletEntry"("transactionId");

-- CreateIndex
CREATE INDEX "WalletEntry_accountId_createdAt_idx" ON "WalletEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "Remittance_tenantId_createdAt_idx" ON "Remittance"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Remittance_driverId_createdAt_idx" ON "Remittance"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletReconciliationRun_tenantId_status_idx" ON "WalletReconciliationRun"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WalletReconciliationRun_tenantId_runDate_key" ON "WalletReconciliationRun"("tenantId", "runDate");

-- CreateIndex
CREATE INDEX "Incident_tenantId_status_idx" ON "Incident"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Incident_driverId_createdAt_idx" ON "Incident"("driverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FoodicsConnection_vendorId_key" ON "FoodicsConnection"("vendorId");

-- CreateIndex
CREATE INDEX "FoodicsConnection_tenantId_idx" ON "FoodicsConnection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventKey_key" ON "WebhookEvent"("eventKey");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_createdAt_idx" ON "WebhookEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CourierOnlineSession_tenantId_availability_idx" ON "CourierOnlineSession"("tenantId", "availability");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBranch" ADD CONSTRAINT "VendorBranch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBranch" ADD CONSTRAINT "VendorBranch_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBranch" ADD CONSTRAINT "VendorBranch_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneSurcharge" ADD CONSTRAINT "ZoneSurcharge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneSurcharge" ADD CONSTRAINT "ZoneSurcharge_originZoneId_fkey" FOREIGN KEY ("originZoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneSurcharge" ADD CONSTRAINT "ZoneSurcharge_destZoneId_fkey" FOREIGN KEY ("destZoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentSettings" ADD CONSTRAINT "FulfillmentSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "VendorBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_pickupZoneId_fkey" FOREIGN KEY ("pickupZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_dropoffZoneId_fkey" FOREIGN KEY ("dropoffZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOffer" ADD CONSTRAINT "DispatchOffer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOffer" ADD CONSTRAINT "DispatchOffer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOffer" ADD CONSTRAINT "DispatchOffer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "WalletTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletReconciliationRun" ADD CONSTRAINT "WalletReconciliationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodicsConnection" ADD CONSTRAINT "FoodicsConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodicsConnection" ADD CONSTRAINT "FoodicsConnection_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

