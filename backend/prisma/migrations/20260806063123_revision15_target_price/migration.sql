-- Revision 15 (#4) — the target price a delivery should cost Darb.
--
-- Nullable on both, with no backfill and no default: NULL means "no target",
-- which is every shop and every branch until somebody sets one, and dispatch
-- ranks on distance exactly as it did before. A branch's own value overrides
-- the shop's, the same inheritance deliveryPlanId already uses.
--
-- The generated diff also proposed DROP INDEX "ChatMessage_contentTsv_idx" and
-- ALTER TABLE "ChatMessage" DROP COLUMN "contentTsv". Both were deleted by
-- hand: that column is a Postgres tsvector maintained outside Prisma, so the
-- datamodel cannot describe it and every diff reads it as drift. Dropping it
-- takes chat search with it.

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "targetPriceKwd" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "VendorBranch" ADD COLUMN     "targetPriceKwd" DECIMAL(10,3);
