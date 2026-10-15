-- Revision 24b: a completed private shift charged to the shop's wallet.
-- Its own migration: Postgres cannot use an enum value in the transaction that adds it.
ALTER TYPE "WalletTxType" ADD VALUE IF NOT EXISTS 'PRIVATE_SHIFT_CHARGE';
