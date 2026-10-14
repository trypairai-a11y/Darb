-- Revision 24 (#3), client note: "Shifts must be either 2, 3, or 4-hour slots,
-- and the driver duty is 12 hours, so the driver must book more than one
-- shift, not 12 hours straight."
--
-- Written by hand, additive only. Both columns default to 180, so every
-- capacity row and plan entry written before this reads as the three-hour
-- window it always was, and nothing the driver app books against changes on
-- the deploy. The unique keys are untouched: a zone still has at most one
-- slot starting at a given time on a given weekday.

ALTER TABLE "ShiftCapacity" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "ShiftPlanEntry" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 180;
