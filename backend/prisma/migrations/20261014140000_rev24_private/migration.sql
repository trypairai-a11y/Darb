-- Revision 24 (#8 to #11): private shifts.
--
-- Written by hand, additive only. New enums are created here (not added to an
-- existing enum), so they can be used in the same transaction. Every new column
-- on an existing table has a default, so nothing existing changes on deploy:
-- no shop has a vehicle type ticked and no driver is eligible until somebody
-- says so.

DO $$ BEGIN
  CREATE TYPE "PrivateShiftStatus" AS ENUM ('PROPOSED', 'OPEN', 'BOOKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PrivateShiftSource" AS ENUM ('ADMIN', 'VENDOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "privateShiftEligible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "suitableVehicleTypes" "VehicleType"[] NOT NULL DEFAULT ARRAY[]::"VehicleType"[];

CREATE TABLE IF NOT EXISTS "VendorVehiclePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "deliveryPlanId" TEXT,
    "perHourKwd" DECIMAL(10,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorVehiclePlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VendorVehiclePlan_vendorId_vehicleType_key" ON "VendorVehiclePlan"("vendorId", "vehicleType");
CREATE INDEX IF NOT EXISTS "VendorVehiclePlan_tenantId_vendorId_idx" ON "VendorVehiclePlan"("tenantId", "vendorId");

CREATE TABLE IF NOT EXISTS "FleetVehicleRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fleetPartnerId" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "perOrderKwd" DECIMAL(10,3),
    "perHourKwd" DECIMAL(10,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FleetVehicleRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FleetVehicleRate_fleetPartnerId_vehicleType_key" ON "FleetVehicleRate"("fleetPartnerId", "vehicleType");
CREATE INDEX IF NOT EXISTS "FleetVehicleRate_tenantId_fleetPartnerId_idx" ON "FleetVehicleRate"("tenantId", "fleetPartnerId");

CREATE TABLE IF NOT EXISTS "PrivateShiftPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "date" TEXT NOT NULL,
    "requestedShifts" INTEGER NOT NULL,
    "shiftHours" INTEGER NOT NULL,
    "source" "PrivateShiftSource" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "basis" JSONB,
    "createdById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrivateShiftPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PrivateShiftPlan_tenantId_vendorId_date_idx" ON "PrivateShiftPlan"("tenantId", "vendorId", "date");
CREATE INDEX IF NOT EXISTS "PrivateShiftPlan_tenantId_date_idx" ON "PrivateShiftPlan"("tenantId", "date");

CREATE TABLE IF NOT EXISTS "PrivateShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT,
    "vendorId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "date" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "PrivateShiftStatus" NOT NULL DEFAULT 'PROPOSED',
    "source" "PrivateShiftSource" NOT NULL,
    "driverId" TEXT,
    "fleetPartnerId" TEXT,
    "bookedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "startLat" DECIMAL(10,7),
    "startLng" DECIMAL(10,7),
    "endedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "scheduledMinutes" INTEGER,
    "lateDeductionMinutes" INTEGER,
    "awayDeductionMinutes" INTEGER,
    "billableMinutes" INTEGER,
    "vendorHourlyKwd" DECIMAL(10,3),
    "fleetHourlyKwd" DECIMAL(10,3),
    "vendorChargeKwd" DECIMAL(10,3),
    "fleetPayKwd" DECIMAL(10,3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrivateShift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PrivateShift_tenantId_date_idx" ON "PrivateShift"("tenantId", "date");
CREATE INDEX IF NOT EXISTS "PrivateShift_tenantId_vendorId_startAt_idx" ON "PrivateShift"("tenantId", "vendorId", "startAt");
CREATE INDEX IF NOT EXISTS "PrivateShift_tenantId_driverId_status_idx" ON "PrivateShift"("tenantId", "driverId", "status");
CREATE INDEX IF NOT EXISTS "PrivateShift_tenantId_status_startAt_idx" ON "PrivateShift"("tenantId", "status", "startAt");

CREATE TABLE IF NOT EXISTS "PrivateShiftDeduction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "orderId" TEXT,
    "fromAt" TIMESTAMP(3),
    "toAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivateShiftDeduction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PrivateShiftDeduction_tenantId_shiftId_idx" ON "PrivateShiftDeduction"("tenantId", "shiftId");

DO $$ BEGIN
  ALTER TABLE "PrivateShift" ADD CONSTRAINT "PrivateShift_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PrivateShiftPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PrivateShiftDeduction" ADD CONSTRAINT "PrivateShiftDeduction_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PrivateShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
