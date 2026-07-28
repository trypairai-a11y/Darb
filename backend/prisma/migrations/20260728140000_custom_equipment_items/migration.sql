-- Custom equipment items.
--
-- Ops could only ever pick from the 14 values of the InventoryItemType enum,
-- which meant "add equipment" was really "restock one of the fourteen". Both
-- inventory columns become free slugs so a new kind of kit is a row, not a
-- migration. The enum type itself is left in place (no destructive migrations);
-- nothing references it any more.

ALTER TABLE "PlatformInventory"
  ALTER COLUMN "itemType" TYPE TEXT USING "itemType"::TEXT;

-- Display name for slugs the hardcoded label map does not know.
ALTER TABLE "PlatformInventory"
  ADD COLUMN IF NOT EXISTS "label" TEXT;

ALTER TABLE "DriverInventory"
  ALTER COLUMN "itemType" TYPE TEXT USING "itemType"::TEXT;
