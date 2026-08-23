-- Edit #4 (2026-08-22) — Target Price out, the two real delivery-company
-- pricing models in (client note: "either a monthly subscription fee, or we
-- take the difference from what is offered by the delivery company and what is
-- accepted by the shop").
--
-- Every step is guarded: this file may run against a database a hand session
-- already patched (db execute without migrate resolve leaves it pending), and
-- re-running must be a no-op rather than a failed deploy.

DO $$ BEGIN
    CREATE TYPE "PricingModel" AS ENUM ('SUBSCRIPTION', 'MARGIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "pricingModel" "PricingModel";
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "subscriptionKwd" DECIMAL(10,3);

ALTER TABLE "Vendor" DROP COLUMN IF EXISTS "targetPriceKwd";
ALTER TABLE "VendorBranch" DROP COLUMN IF EXISTS "targetPriceKwd";

-- Edit #5 (2026-08-22) — integrations beyond Foodics (uPayments, Salla,
-- Shopify, custom systems). One JSON blob keyed by provider name.
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "integrationSettings" JSONB;
