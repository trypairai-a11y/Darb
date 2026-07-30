-- Revision 10: per-branch pause (#7), per-user portal tabs (#6), wallet top-ups (#2).
--
-- Generated with `prisma migrate diff --from-url <prod> --to-schema-datamodel`,
-- then edited to REMOVE two destructive steps the diff proposed:
--
--   DROP INDEX "ChatMessage_contentTsv_idx";
--   ALTER TABLE "ChatMessage" DROP COLUMN "contentTsv";
--
-- That column is a Postgres tsvector maintained outside Prisma, so every diff
-- offers to drop it because the datamodel cannot describe it. Dropping it would
-- take chat search with it, and this repo does not ship destructive migrations.

-- CreateEnum
CREATE TYPE "VendorTopUpStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'FAILED');

-- AlterTable: per-user merchant-portal tab access. NULL = inherit whatever the
-- role opens, which is what every existing shop login does, so no backfill.
ALTER TABLE "User" ADD COLUMN     "vendorTabs" JSONB;

-- AlterTable: a branch can stop taking orders without stopping the account.
ALTER TABLE "VendorBranch" ADD COLUMN     "isPaused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VendorTopUp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "requestedById" TEXT,
    "amountKwd" DECIMAL(10,3) NOT NULL,
    "status" "VendorTopUpStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "paymentUrl" TEXT,
    "providerRef" TEXT,
    "provider" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorTopUp_token_key" ON "VendorTopUp"("token");

-- CreateIndex
CREATE INDEX "VendorTopUp_tenantId_vendorId_createdAt_idx" ON "VendorTopUp"("tenantId", "vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorTopUp_tenantId_status_idx" ON "VendorTopUp"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "VendorTopUp" ADD CONSTRAINT "VendorTopUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorTopUp" ADD CONSTRAINT "VendorTopUp_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

