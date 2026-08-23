-- Revision 14 (#3): pay a delivery company a base fee plus a rate per kilometre.
--
-- Hand-written rather than diffed. Every column here is nullable and additive,
-- so this cannot reprice a live partner on the deploy: a FleetPartner with
-- perKmFeeKwd NULL is on the old flat deal and is paid exactly what it was.
-- (A diff against prod also proposes dropping ChatMessage.contentTsv every
-- time, which would take chat search with it. See CLAUDE.md.)

-- What Darb pays the company: flatFeePerOrderKwd is the base, this is the
-- kilometre half. NULL = flat rate.
ALTER TABLE "FleetPartner" ADD COLUMN "perKmFeeKwd" DECIMAL(10,3);

-- The branch-to-drop routing distance, fixed at quote time. Both the merchant
-- charge and the fleet cost are built on this one number.
ALTER TABLE "DeliveryOrder" ADD COLUMN "distanceKm" DECIMAL(10,3);
ALTER TABLE "DeliveryOrder" ADD COLUMN "distanceSource" TEXT;

-- The rate a closed month was cut on, snapshotted beside the base fee that was
-- already snapshotted. NULL on every statement issued before this.
ALTER TABLE "FleetPayoutStatement" ADD COLUMN "perKmFeeKwd" DECIMAL(10,3);
ALTER TABLE "FleetPayoutStatement" ADD COLUMN "totalKm" DECIMAL(12,3);
