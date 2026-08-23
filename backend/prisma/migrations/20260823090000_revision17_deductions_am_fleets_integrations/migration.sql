-- Revision 17 (#1, #5, #11) — the tables the 20260822 migration left out.
--
-- The vendor pricing migration shipped alone; the schema also gained three
-- models and two statement columns with no DDL behind them, which would have
-- 500'd every endpoint that touches them on the first request. Everything here
-- is guarded (IF NOT EXISTS / IF EXISTS) because this may run against a
-- database a hand session already patched, and re-running must be a no-op.

-- Edit #1 — money Darb withholds from a delivery company's invoice, and the
-- statement columns the payout maths reads. deductionsKwd carries a default so
-- Postgres accepts NOT NULL on populated rows; existing statements read 0.000.
ALTER TABLE "FleetPayoutStatement" ADD COLUMN IF NOT EXISTS "deductionsKwd" DECIMAL(10,3) NOT NULL DEFAULT 0.000;
ALTER TABLE "FleetPayoutStatement" ADD COLUMN IF NOT EXISTS "netPayableKwd" DECIMAL(10,3);

CREATE TABLE IF NOT EXISTS "FleetDeduction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fleetPartnerId" TEXT NOT NULL,
    "statementId" TEXT,
    "amountKwd" DECIMAL(10,3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'OTHER',
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetDeduction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FleetDeduction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FleetDeduction_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FleetDeduction_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "FleetPayoutStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FleetDeduction_tenantId_fleetPartnerId_status_idx" ON "FleetDeduction"("tenantId", "fleetPartnerId", "status");
CREATE INDEX IF NOT EXISTS "FleetDeduction_tenantId_statementId_idx" ON "FleetDeduction"("tenantId", "statementId");

-- Edit #11 — the delivery-company half of AccountManagerVendor, so support
-- routing can scope an account manager to the companies they actually handle.
CREATE TABLE IF NOT EXISTS "AccountManagerFleet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fleetPartnerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountManagerFleet_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountManagerFleet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountManagerFleet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountManagerFleet_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountManagerFleet_userId_fleetPartnerId_key" ON "AccountManagerFleet"("userId", "fleetPartnerId");
CREATE INDEX IF NOT EXISTS "AccountManagerFleet_tenantId_fleetPartnerId_idx" ON "AccountManagerFleet"("tenantId", "fleetPartnerId");

-- Edit #5 — every non-Foodics POS / e-commerce connection. provider is a slug,
-- not an enum, so a new provider never needs a migration.
CREATE TABLE IF NOT EXISTS "VendorIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "credentialEnc" TEXT,
    "config" JSONB,
    "webhookSecret" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorIntegration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VendorIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VendorIntegration_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "VendorIntegration_tenantId_vendorId_provider_key" ON "VendorIntegration"("tenantId", "vendorId", "provider");
CREATE INDEX IF NOT EXISTS "VendorIntegration_tenantId_vendorId_idx" ON "VendorIntegration"("tenantId", "vendorId");
