-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "returnedAt" TIMESTAMP(3),
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "tipKwd" DECIMAL(10,3),
ADD COLUMN     "trackingToken" TEXT;

-- AlterTable
ALTER TABLE "DispatchOffer" ADD COLUMN     "batchId" TEXT;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "fleetPartnerId" TEXT,
ADD COLUMN     "throttledUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FulfillmentSettings" ADD COLUMN     "batchMaxDropKm" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
ADD COLUMN     "batchMaxOrders" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "batchingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxSearchRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 15,
ADD COLUMN     "radiusWidenAfterRounds" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "radiusWidenFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.5;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fleetPartnerId" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "creditCapKwd" DECIMAL(10,3);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRating" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingBalanceKwd" DECIMAL(10,3) NOT NULL,
    "codNetKwd" DECIMAL(10,3) NOT NULL,
    "prepaidFeesKwd" DECIMAL(10,3) NOT NULL,
    "refundsKwd" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "closingBalanceKwd" DECIMAL(10,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FINAL',
    "payoutTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amountKwd" DECIMAL(10,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "processedById" TEXT,
    "walletTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetPartner" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "flatFeePerOrderKwd" DECIMAL(10,3) NOT NULL DEFAULT 1.100,
    "minOnlineHoursPerDay" DOUBLE PRECISION,
    "minDriversOnline" JSONB,
    "disciplineStatus" TEXT NOT NULL DEFAULT 'OK',
    "disciplineNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetPayoutStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fleetPartnerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "deliveredOrders" INTEGER NOT NULL,
    "feePerOrderKwd" DECIMAL(10,3) NOT NULL,
    "totalKwd" DECIMAL(10,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FINAL',
    "payoutTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetPayoutStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_tenantId_vendorId_idx" ON "ApiKey"("tenantId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRating_orderId_key" ON "OrderRating"("orderId");

-- CreateIndex
CREATE INDEX "OrderRating_tenantId_driverId_createdAt_idx" ON "OrderRating"("tenantId", "driverId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorStatement_tenantId_periodStart_idx" ON "VendorStatement"("tenantId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "VendorStatement_tenantId_vendorId_periodStart_key" ON "VendorStatement"("tenantId", "vendorId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_orderId_key" ON "Refund"("orderId");

-- CreateIndex
CREATE INDEX "Refund_tenantId_status_idx" ON "Refund"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FleetPartner_tenantId_isActive_idx" ON "FleetPartner"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "FleetPayoutStatement_tenantId_periodStart_idx" ON "FleetPayoutStatement"("tenantId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "FleetPayoutStatement_tenantId_fleetPartnerId_periodStart_key" ON "FleetPayoutStatement"("tenantId", "fleetPartnerId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_trackingToken_key" ON "DeliveryOrder"("trackingToken");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_status_scheduledAt_idx" ON "DeliveryOrder"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_batchId_idx" ON "DeliveryOrder"("tenantId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_tenantId_vendorId_externalRef_key" ON "DeliveryOrder"("tenantId", "vendorId", "externalRef");

-- CreateIndex
CREATE INDEX "DispatchOffer_batchId_idx" ON "DispatchOffer"("batchId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRating" ADD CONSTRAINT "OrderRating_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRating" ADD CONSTRAINT "OrderRating_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRating" ADD CONSTRAINT "OrderRating_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStatement" ADD CONSTRAINT "VendorStatement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStatement" ADD CONSTRAINT "VendorStatement_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetPartner" ADD CONSTRAINT "FleetPartner_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetPayoutStatement" ADD CONSTRAINT "FleetPayoutStatement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetPayoutStatement" ADD CONSTRAINT "FleetPayoutStatement_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

