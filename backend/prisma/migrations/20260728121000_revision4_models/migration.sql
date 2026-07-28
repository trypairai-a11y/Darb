-- CreateEnum
CREATE TYPE "DeliveryPlanType" AS ENUM ('ZONE', 'KM');

-- CreateEnum
CREATE TYPE "PermissionLevel" AS ENUM ('NONE', 'VIEW', 'EDIT');

-- CreateEnum
CREATE TYPE "AppSurface" AS ENUM ('LIVE', 'ORDERS', 'MONEY', 'SETUP', 'TODAY', 'CASH_DESK', 'PEOPLE');

-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN     "nextRedispatchAt" TIMESTAMP(3),
ADD COLUMN     "redispatchAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "deliveryPlanId" TEXT;

-- CreateTable
CREATE TABLE "DeliveryPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeliveryPlanType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPlanZoneRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "originZoneId" TEXT NOT NULL,
    "destZoneId" TEXT NOT NULL,
    "feeKwd" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPlanZoneRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPlanKmTier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "maxKm" DECIMAL(6,2),
    "feeKwd" DECIMAL(10,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPlanKmTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistanceCache" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "originKey" TEXT NOT NULL,
    "destKey" TEXT NOT NULL,
    "km" DECIMAL(8,3) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistanceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSurfacePermission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surface" "AppSurface" NOT NULL,
    "level" "PermissionLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSurfacePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountManagerVendor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountManagerVendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryPlan_tenantId_isActive_idx" ON "DeliveryPlan"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPlan_tenantId_name_key" ON "DeliveryPlan"("tenantId", "name");

-- CreateIndex
CREATE INDEX "DeliveryPlanZoneRate_tenantId_idx" ON "DeliveryPlanZoneRate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPlanZoneRate_planId_originZoneId_destZoneId_key" ON "DeliveryPlanZoneRate"("planId", "originZoneId", "destZoneId");

-- CreateIndex
CREATE INDEX "DeliveryPlanKmTier_planId_sortOrder_idx" ON "DeliveryPlanKmTier"("planId", "sortOrder");

-- CreateIndex
CREATE INDEX "DeliveryPlanKmTier_tenantId_idx" ON "DeliveryPlanKmTier"("tenantId");

-- CreateIndex
CREATE INDEX "DistanceCache_fetchedAt_idx" ON "DistanceCache"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistanceCache_tenantId_originKey_destKey_key" ON "DistanceCache"("tenantId", "originKey", "destKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_tokenHash_key" ON "UserInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "UserInvite_tenantId_userId_idx" ON "UserInvite"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "UserInvite_expiresAt_idx" ON "UserInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "UserSurfacePermission_tenantId_idx" ON "UserSurfacePermission"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSurfacePermission_userId_surface_key" ON "UserSurfacePermission"("userId", "surface");

-- CreateIndex
CREATE INDEX "AccountManagerVendor_tenantId_vendorId_idx" ON "AccountManagerVendor"("tenantId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountManagerVendor_userId_vendorId_key" ON "AccountManagerVendor"("userId", "vendorId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_status_nextRedispatchAt_idx" ON "DeliveryOrder"("status", "nextRedispatchAt");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_deliveryPlanId_fkey" FOREIGN KEY ("deliveryPlanId") REFERENCES "DeliveryPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlan" ADD CONSTRAINT "DeliveryPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlanZoneRate" ADD CONSTRAINT "DeliveryPlanZoneRate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DeliveryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlanZoneRate" ADD CONSTRAINT "DeliveryPlanZoneRate_originZoneId_fkey" FOREIGN KEY ("originZoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlanZoneRate" ADD CONSTRAINT "DeliveryPlanZoneRate_destZoneId_fkey" FOREIGN KEY ("destZoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlanKmTier" ADD CONSTRAINT "DeliveryPlanKmTier_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DeliveryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistanceCache" ADD CONSTRAINT "DistanceCache_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSurfacePermission" ADD CONSTRAINT "UserSurfacePermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSurfacePermission" ADD CONSTRAINT "UserSurfacePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountManagerVendor" ADD CONSTRAINT "AccountManagerVendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountManagerVendor" ADD CONSTRAINT "AccountManagerVendor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountManagerVendor" ADD CONSTRAINT "AccountManagerVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

