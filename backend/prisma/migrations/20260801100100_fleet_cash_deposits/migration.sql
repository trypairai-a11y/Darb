-- Revision 14 — fleet cash deposits, part 2 of 2: the table and the column.
--
-- The enum VALUES this depends on were added in 20260801100000_fleet_cash_enums.
-- FleetCashDepositStatus is a brand new type, so it may be created and used in
-- the same transaction; only ADD VALUE on an existing type cannot be.

CREATE TYPE "FleetCashDepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

CREATE TABLE "FleetCashDeposit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fleetPartnerId" TEXT NOT NULL,
    "requestedById" TEXT,
    "amountKwd" DECIMAL(10,3) NOT NULL,
    "method" "DepositMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "receiptUrl" TEXT,
    "status" "FleetCashDepositStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetCashDeposit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FleetCashDeposit_tenantId_fleetPartnerId_createdAt_idx" ON "FleetCashDeposit"("tenantId", "fleetPartnerId", "createdAt");
CREATE INDEX "FleetCashDeposit_tenantId_status_idx" ON "FleetCashDeposit"("tenantId", "status");

ALTER TABLE "FleetCashDeposit" ADD CONSTRAINT "FleetCashDeposit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FleetCashDeposit" ADD CONSTRAINT "FleetCashDeposit_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Which company settled this hand-in out of its deposit account. NULL is the
-- original case: a driver carried notes to the cash desk. One table on purpose,
-- so a driver's cash history stays one list whoever cleared it.
ALTER TABLE "Remittance" ADD COLUMN "fleetPartnerId" TEXT;

CREATE INDEX "Remittance_tenantId_fleetPartnerId_createdAt_idx" ON "Remittance"("tenantId", "fleetPartnerId", "createdAt");

ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
