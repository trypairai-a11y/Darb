-- Revision 13 (#6, #8) — the fleet portal's own team, and a payout the
-- delivery company has to confirm before Darb processes it.
--
-- Every column is nullable. NULL fleetRole reads as OWNER and NULL fleetTabs
-- inherits the role default, so every fleet login that already exists keeps
-- opening exactly what it opened before and nothing needs backfilling.
--
-- The generated diff also proposed dropping "ChatMessage"."contentTsv" and its
-- index. Deleted by hand, as always: that column is a Postgres tsvector
-- maintained outside Prisma, so the datamodel cannot describe it and the diff
-- reads it as drift. Dropping it takes chat search with it.

-- AlterTable
ALTER TABLE "FleetPayoutStatement" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "disputeReason" TEXT,
ADD COLUMN     "disputeTicketId" TEXT,
ADD COLUMN     "disputedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fleetPartnerIds" JSONB,
ADD COLUMN     "fleetRole" TEXT,
ADD COLUMN     "fleetTabs" JSONB;
