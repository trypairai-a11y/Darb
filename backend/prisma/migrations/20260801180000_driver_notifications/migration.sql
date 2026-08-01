-- Client request 2026-08-01 — the driver app needed a place for notifications.
--
-- Notification could only ever address a User, and a driver is a Driver row, so
-- there was no way to say "this is for Abdul Rahman". One nullable column and
-- an index; no enum values, so this is one migration rather than the usual two.

ALTER TABLE "Notification" ADD COLUMN "driverId" TEXT;

CREATE INDEX "Notification_driverId_createdAt_idx" ON "Notification"("driverId", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
