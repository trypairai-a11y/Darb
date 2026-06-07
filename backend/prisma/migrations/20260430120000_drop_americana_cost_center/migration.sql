-- Drop the CC (cost center) column completely from Americana fleet tables.
ALTER TABLE "AmericanaDailyOrders" DROP COLUMN IF EXISTS "costCenter";
ALTER TABLE "AmericanaStore" DROP COLUMN IF EXISTS "costCenter";
