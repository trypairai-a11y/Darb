-- Revision 10 enum values, alone in their own migration.
--
-- Postgres cannot use a new enum value in the same transaction that adds it, so
-- these have to land before the migration that references them. See CLAUDE.md.

-- Revision 10 (#5): the shop withdrew a support request itself.
ALTER TYPE "SupportTicketStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Revision 10 (#2): a merchant paying money into their own wallet.
ALTER TYPE "WalletTxType" ADD VALUE IF NOT EXISTS 'TOP_UP';
