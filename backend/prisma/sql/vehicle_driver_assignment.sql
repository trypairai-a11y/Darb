-- Additive, idempotent: creates only the VehicleDriverAssignment table.
-- Safe to run against production; touches no other tables.

CREATE TABLE IF NOT EXISTS "VehicleDriverAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unassignedAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleDriverAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VehicleDriverAssignment_tenantId_idx"
  ON "VehicleDriverAssignment" ("tenantId");
CREATE INDEX IF NOT EXISTS "VehicleDriverAssignment_vehicleId_active_idx"
  ON "VehicleDriverAssignment" ("vehicleId", "active");
CREATE INDEX IF NOT EXISTS "VehicleDriverAssignment_driverId_active_idx"
  ON "VehicleDriverAssignment" ("driverId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleDriverAssignment_vehicleId_driverId_key"
  ON "VehicleDriverAssignment" ("vehicleId", "driverId");

DO $$ BEGIN
  ALTER TABLE "VehicleDriverAssignment"
    ADD CONSTRAINT "VehicleDriverAssignment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "VehicleDriverAssignment"
    ADD CONSTRAINT "VehicleDriverAssignment_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "VehicleDriverAssignment"
    ADD CONSTRAINT "VehicleDriverAssignment_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
