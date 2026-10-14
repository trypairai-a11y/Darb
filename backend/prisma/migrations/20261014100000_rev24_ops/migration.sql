-- Revision 24 (ops stream) #16: a terminated driver is finally terminated
-- only once their issued equipment is cleared. Additive only.
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP(3);
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "terminationClearedAt" TIMESTAMP(3);
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "terminationClearedById" TEXT;
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "terminationClearanceNote" TEXT;
