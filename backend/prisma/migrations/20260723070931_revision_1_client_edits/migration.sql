-- Revision 1 — client revision notes (29 edits).
--
-- NOTE: `prisma migrate diff` also proposes dropping ChatMessage.contentTsv and
-- its GIN index. That column is created by raw SQL in
-- 20260513120000_chat_pinned_views_scheduled_briefings for chat full-text
-- search and is deliberately not modelled in schema.prisma. Those two
-- statements were removed by hand; do not paste them back in.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "accountManagerId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'FLEET',
ADD COLUMN     "ownerGroupId" TEXT;

-- AlterTable
ALTER TABLE "DeliveryZone" ADD COLUMN     "color" TEXT;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "driverCode" TEXT;

-- AlterTable
ALTER TABLE "FleetPartner" ADD COLUMN     "ownerGroupId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "ownerGroupId" TEXT,
ADD COLUMN     "vendorRole" TEXT;

-- CreateTable
CREATE TABLE "OwnerGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerGroup_tenantId_idx" ON "OwnerGroup"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerGroup_tenantId_name_key" ON "OwnerGroup"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Company_tenantId_ownerGroupId_idx" ON "Company"("tenantId", "ownerGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_tenantId_driverCode_key" ON "Driver"("tenantId", "driverCode");

-- CreateIndex
CREATE INDEX "FleetPartner_tenantId_ownerGroupId_idx" ON "FleetPartner"("tenantId", "ownerGroupId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "OwnerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerGroup" ADD CONSTRAINT "OwnerGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "OwnerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "VendorBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetPartner" ADD CONSTRAINT "FleetPartner_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "OwnerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

