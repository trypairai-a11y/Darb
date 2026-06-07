-- Driver-reported equipment condition (mobile agent app).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EquipmentCondition') THEN
    CREATE TYPE "EquipmentCondition" AS ENUM ('OK', 'DAMAGED', 'CHANGED', 'CHANGE_REQUESTED');
  END IF;
END $$;

ALTER TABLE "DriverInventory"
  ADD COLUMN IF NOT EXISTS "condition" "EquipmentCondition" NOT NULL DEFAULT 'OK',
  ADD COLUMN IF NOT EXISTS "conditionNote" TEXT,
  ADD COLUMN IF NOT EXISTS "conditionReportedAt" TIMESTAMP(3);
