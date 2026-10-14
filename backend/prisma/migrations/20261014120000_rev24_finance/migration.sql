-- Revision 24 (finance stream, #7): the Settle accounts record.
-- Additive only: one new table, no relations to existing tables.
CREATE TABLE IF NOT EXISTS "AccountSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "flow" TEXT NOT NULL,
    "amountDueKwd" DECIMAL(10,3) NOT NULL,
    "amountKwd" DECIMAL(10,3) NOT NULL,
    "remainingKwd" DECIMAL(10,3) NOT NULL,
    "status" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "payoutTxId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountSettlement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccountSettlement_tenantId_partyType_statementId_idx" ON "AccountSettlement"("tenantId", "partyType", "statementId");
CREATE INDEX IF NOT EXISTS "AccountSettlement_tenantId_createdAt_idx" ON "AccountSettlement"("tenantId", "createdAt");
