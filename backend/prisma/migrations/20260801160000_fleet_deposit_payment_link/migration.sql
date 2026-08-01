-- Revision 14b — the client asked for fleet deposits to be paid by link only,
-- the same rail a merchant tops up on. No new enum values here, so this is one
-- migration rather than the usual two.

ALTER TABLE "FleetCashDeposit" ADD COLUMN "token" TEXT;
ALTER TABLE "FleetCashDeposit" ADD COLUMN "paymentUrl" TEXT;
ALTER TABLE "FleetCashDeposit" ADD COLUMN "providerRef" TEXT;
ALTER TABLE "FleetCashDeposit" ADD COLUMN "provider" TEXT;

-- Unique so a token on the public /api/pay surface resolves to exactly one
-- deposit. Nullable: rows created before links existed carry none, and a NULL
-- does not collide in a Postgres unique index.
CREATE UNIQUE INDEX "FleetCashDeposit_token_key" ON "FleetCashDeposit"("token");

-- A deposit is now settled through a payment rail, not an envelope handed over
-- a counter, so the default that a new row inherits changes with it.
ALTER TABLE "FleetCashDeposit" ALTER COLUMN "method" SET DEFAULT 'BANK_TRANSFER';
