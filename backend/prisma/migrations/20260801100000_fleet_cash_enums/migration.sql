-- Revision 14 — fleet cash deposits, part 1 of 2: the enum values only.
--
-- These are in their own migration because Postgres cannot use a new enum value
-- in the same transaction that adds it. The table and column that reference
-- them land in 20260801100100_fleet_cash_deposits.

-- Money a delivery company has deposited with Darb, awaiting use against its
-- own drivers' cash-on-hand. Liability-like, so CREDIT raises it.
ALTER TYPE "WalletOwnerType" ADD VALUE IF NOT EXISTS 'FLEET_CASH';

-- The posting that credits it, once an accountant confirms the money arrived.
ALTER TYPE "WalletTxType" ADD VALUE IF NOT EXISTS 'FLEET_DEPOSIT';

-- A Remittance settled out of that account rather than by a driver walking
-- cash to the desk.
ALTER TYPE "DepositMethod" ADD VALUE IF NOT EXISTS 'FLEET_ACCOUNT';
