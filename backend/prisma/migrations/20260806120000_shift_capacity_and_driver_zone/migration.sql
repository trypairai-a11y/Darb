-- The two ChatMessage steps the diff proposes here were deleted by hand, as
-- every diff against prod requires: contentTsv is a Postgres tsvector kept
-- outside Prisma, the datamodel cannot describe it, and dropping it takes chat
-- search with it. See CLAUDE.md, Migrations.

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "assignedZoneId" TEXT;

-- CreateTable
CREATE TABLE "ShiftCapacity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "maxDrivers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftCapacity_tenantId_idx" ON "ShiftCapacity"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftCapacity_tenantId_zoneId_startTime_key" ON "ShiftCapacity"("tenantId", "zoneId", "startTime");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_assignedZoneId_fkey" FOREIGN KEY ("assignedZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCapacity" ADD CONSTRAINT "ShiftCapacity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCapacity" ADD CONSTRAINT "ShiftCapacity_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

