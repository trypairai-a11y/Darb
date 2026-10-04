-- Revision 21 (client notes, 2026-09-17).
--
-- The diff against prod also proposed dropping ChatMessage.contentTsv and its
-- index. That column is a tsvector maintained outside Prisma; the drops were
-- removed by hand, as every migration in this repo has to.

-- #3 Driver training: practice orders keep coming until the window closes.
ALTER TABLE "DriverTrainingSession" ADD COLUMN "autoIssue" BOOLEAN NOT NULL DEFAULT true;

-- #5 Finance › Payments: feedback beside an approval or a rejection.
ALTER TABLE "FleetCashDeposit" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "VendorTopUp" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "VendorTopUp" ADD COLUMN "reviewedById" TEXT;
