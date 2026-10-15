-- Revision 24b: private shifts reach the money flow.
-- Additive only.

-- An order carried on a private shift for its own shop and branch.
ALTER TABLE "DeliveryOrder" ADD COLUMN IF NOT EXISTS "privateShiftId" TEXT;
CREATE INDEX IF NOT EXISTS "DeliveryOrder_tenantId_privateShiftId_idx" ON "DeliveryOrder"("tenantId", "privateShiftId");

-- The shop charge posting and the company statement that paid the shift.
ALTER TABLE "PrivateShift" ADD COLUMN IF NOT EXISTS "chargeTxId" TEXT;
ALTER TABLE "PrivateShift" ADD COLUMN IF NOT EXISTS "chargedAt" TIMESTAMP(3);
ALTER TABLE "PrivateShift" ADD COLUMN IF NOT EXISTS "fleetStatementId" TEXT;
CREATE INDEX IF NOT EXISTS "PrivateShift_tenantId_fleetStatementId_idx" ON "PrivateShift"("tenantId", "fleetStatementId");
CREATE INDEX IF NOT EXISTS "PrivateShift_chargeTxId_idx" ON "PrivateShift"("chargeTxId");

-- The shop statement's private-shift component.
ALTER TABLE "VendorStatement" ADD COLUMN IF NOT EXISTS "privateShiftsKwd" DECIMAL(10,3) NOT NULL DEFAULT 0;

-- The company statement's private-shift lines and per-vehicle rates.
ALTER TABLE "FleetPayoutStatement" ADD COLUMN IF NOT EXISTS "ordersKwd" DECIMAL(10,3);
ALTER TABLE "FleetPayoutStatement" ADD COLUMN IF NOT EXISTS "privateShiftCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FleetPayoutStatement" ADD COLUMN IF NOT EXISTS "privateShiftMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FleetPayoutStatement" ADD COLUMN IF NOT EXISTS "privateShiftPayKwd" DECIMAL(10,3) NOT NULL DEFAULT 0.000;
ALTER TABLE "FleetPayoutStatement" ADD COLUMN IF NOT EXISTS "vehicleRates" JSONB;
