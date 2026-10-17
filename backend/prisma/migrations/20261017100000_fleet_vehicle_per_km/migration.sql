-- Client note, 2026-10-15 (Osama): a delivery company's motorcycle and car
-- are each paid a base fee plus a rate per kilometre for every order.
-- Additive: NULL keeps today's behaviour (the company-wide per-km rate, or
-- flat when that is blank too).
ALTER TABLE "FleetVehicleRate" ADD COLUMN IF NOT EXISTS "perKmKwd" DECIMAL(10,3);
