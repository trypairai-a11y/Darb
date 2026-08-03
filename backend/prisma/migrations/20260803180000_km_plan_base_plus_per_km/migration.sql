-- Revision 14 (#1): a by-kilometre delivery plan is a base fee plus a rate for
-- each kilometre travelled, instead of a ladder of distance bands.
--
-- All three columns are nullable and default to NULL, so this applies to a live
-- database without repricing anything: pricingService reads a plan's band
-- ladder whenever baseFeeKwd and perKmFeeKwd are both NULL. A plan moves onto
-- the formula the first time somebody saves the editor, and its bands are
-- cleared in that same transaction.
--
-- Hand-written rather than generated: `prisma migrate diff` against this
-- database proposes dropping ChatMessage.contentTsv every time (a tsvector
-- Prisma cannot describe), and that drop takes chat search with it.

ALTER TABLE "DeliveryPlan" ADD COLUMN IF NOT EXISTS "baseFeeKwd" DECIMAL(10,3);
ALTER TABLE "DeliveryPlan" ADD COLUMN IF NOT EXISTS "perKmFeeKwd" DECIMAL(10,3);
ALTER TABLE "DeliveryPlan" ADD COLUMN IF NOT EXISTS "maxDistanceKm" DECIMAL(6,2);
