-- Osama, 2026-10-15: "for the driver equipment must be able to remove it from
-- the driver or replace it with a new one with a log of past equipment".
--
-- Written by hand, additive only: one new enum and one new append-only table.
-- Nothing existing changes on deploy, and re-running is a no-op.

DO $$ BEGIN
  CREATE TYPE "EquipmentEventAction" AS ENUM ('ISSUED', 'RETURNED', 'REPLACED', 'CLEARED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DriverEquipmentEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "action" "EquipmentEventAction" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" TEXT,
    "note" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverEquipmentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DriverEquipmentEvent_tenantId_driverId_createdAt_idx" ON "DriverEquipmentEvent"("tenantId", "driverId", "createdAt");
