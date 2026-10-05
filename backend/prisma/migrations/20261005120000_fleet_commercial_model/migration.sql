-- Client note, 2026-08-16 (Osama, Darb ops head): "for the target price remove
-- it. We have two models with the delivery companies: either a monthly
-- subscription fee, or we take the difference from what is offered from the
-- delivery company and what is accepted by the shop."
--
-- Written by hand, additive only. Both string columns default to MARGIN, so
-- every existing company and every statement already cut reads as today's
-- behaviour and nothing reprices on the deploy.

-- The company's commercial model and, on SUBSCRIPTION, its monthly fee.
ALTER TABLE "FleetPartner" ADD COLUMN "commercialModel" TEXT NOT NULL DEFAULT 'MARGIN';
ALTER TABLE "FleetPartner" ADD COLUMN "subscriptionFeeKwd" DECIMAL(10,3);

-- Snapshot on the statement, like the rate, so a later switch of model cannot
-- redraw the order lines of a month already cut.
ALTER TABLE "FleetPayoutStatement" ADD COLUMN "commercialModel" TEXT NOT NULL DEFAULT 'MARGIN';
