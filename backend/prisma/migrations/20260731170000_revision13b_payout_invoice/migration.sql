-- Revision 13b (client note) — the company-stamped invoice a delivery company
-- uploads when it confirms a payout statement.
--
-- `fileData` is a bytea because production has no R2 yet: a confirmation gate
-- nobody can pass would be worse than a megabyte in Postgres, and the code
-- prefers `fileKey` the moment storage is configured. One row per statement.
--
-- The generated diff also proposed dropping "ChatMessage"."contentTsv" and its
-- index. Deleted by hand, as always: that column is a tsvector maintained
-- outside Prisma, and dropping it takes chat search with it.

-- CreateTable
CREATE TABLE "FleetPayoutInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fleetPartnerId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileKey" TEXT,
    "fileData" BYTEA,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetPayoutInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FleetPayoutInvoice_statementId_key" ON "FleetPayoutInvoice"("statementId");

-- CreateIndex
CREATE INDEX "FleetPayoutInvoice_tenantId_fleetPartnerId_idx" ON "FleetPayoutInvoice"("tenantId", "fleetPartnerId");

-- AddForeignKey
ALTER TABLE "FleetPayoutInvoice" ADD CONSTRAINT "FleetPayoutInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetPayoutInvoice" ADD CONSTRAINT "FleetPayoutInvoice_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetPayoutInvoice" ADD CONSTRAINT "FleetPayoutInvoice_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "FleetPayoutStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetPayoutInvoice" ADD CONSTRAINT "FleetPayoutInvoice_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

