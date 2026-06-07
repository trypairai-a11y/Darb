-- Add FK from AmericanaChainRate.createdBy -> User.id.
-- WARNING: this will fail if any existing AmericanaChainRate row has a
-- createdBy value that is not a valid User.id. Run this audit first:
--
--   SELECT r."id", r."createdBy"
--   FROM "AmericanaChainRate" r
--   LEFT JOIN "User" u ON u."id" = r."createdBy"
--   WHERE u."id" IS NULL;
--
-- Either backfill orphaned rows to a known operator user, or delete them,
-- before running this migration.

CREATE INDEX "AmericanaChainRate_createdBy_idx" ON "AmericanaChainRate"("createdBy");

ALTER TABLE "AmericanaChainRate"
  ADD CONSTRAINT "AmericanaChainRate_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
