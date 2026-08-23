-- Revision 16 (#2, #3).
--
-- Hand-edited from `prisma migrate diff`. Two things the generated script got
-- wrong for this database, both deliberate:
--
--   1. The diff proposed DROP INDEX "ChatMessage_contentTsv_idx" and
--      ALTER TABLE "ChatMessage" DROP COLUMN "contentTsv". That column is a
--      tsvector maintained outside Prisma, so the datamodel cannot describe it
--      and every diff reads it as drift. Dropping it takes chat search with it.
--      Removed.
--   2. The diff proposed ADD COLUMN "dayOfWeek" INTEGER NOT NULL with no
--      default, which Postgres refuses on a table that already has rows. The
--      column is added with a temporary default, the existing rows are expanded
--      across the week, and the default is dropped again so the column matches
--      the datamodel.

-- AlterTable: the three driver documents that had no column pair. Without these
-- the type is storable and invisible: the roster tally, the driver profile and
-- the expiry sweep all read the Driver columns, not FleetDocument.
ALTER TABLE "Driver" ADD COLUMN     "policeClearanceExpiry" TIMESTAMP(3),
ADD COLUMN     "policeClearanceStatus" TEXT,
ADD COLUMN     "passportExpiry" TIMESTAMP(3),
ADD COLUMN     "passportStatus" TEXT,
ADD COLUMN     "driverSelfieExpiry" TIMESTAMP(3),
ADD COLUMN     "driverSelfieStatus" TEXT;

-- DropIndex: the old key cannot survive the expansion below, which deliberately
-- creates seven rows per (tenant, zone, window).
DROP INDEX "ShiftCapacity_tenantId_zoneId_startTime_key";

-- AlterTable: per-day capacity. 0 = Sunday .. 6 = Saturday, matching getDay().
ALTER TABLE "ShiftCapacity" ADD COLUMN     "dayOfWeek" INTEGER NOT NULL DEFAULT 0;

-- Every cap that exists today is one number that was applied to all seven days,
-- so it is expanded into seven rows rather than being left on Sunday alone.
-- Anything else would silently close six days of the week the moment this ships.
-- INSERT .. SELECT reads the statement-start snapshot, so the rows written here
-- are not re-read by this same statement.
INSERT INTO "ShiftCapacity" ("id", "tenantId", "zoneId", "startTime", "dayOfWeek", "maxDrivers", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."tenantId", c."zoneId", c."startTime", d.day, c."maxDrivers", c."createdAt", c."updatedAt"
FROM "ShiftCapacity" c
CROSS JOIN generate_series(1, 6) AS d(day)
WHERE c."dayOfWeek" = 0;

ALTER TABLE "ShiftCapacity" ALTER COLUMN "dayOfWeek" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "ShiftCapacity_tenantId_zoneId_dayOfWeek_startTime_key" ON "ShiftCapacity"("tenantId", "zoneId", "dayOfWeek", "startTime");
