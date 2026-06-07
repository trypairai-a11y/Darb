DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Language') THEN
    CREATE TYPE "Language" AS ENUM ('EN', 'AR', 'AUTO');
  END IF;
END $$;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "defaultLanguage" "Language" NOT NULL DEFAULT 'AR',
  ADD COLUMN IF NOT EXISTS "outboundChannels" JSONB NOT NULL DEFAULT '{"inApp":true,"whatsapp":false,"sms":false}',
  ADD COLUMN IF NOT EXISTS "whatsappBusinessAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappPhoneNumberId" TEXT,
  ADD COLUMN IF NOT EXISTS "outboundDailyKdLimit" DECIMAL(10,3);

ALTER TABLE "Driver"
  ADD COLUMN IF NOT EXISTS "preferredLanguage" "Language" NOT NULL DEFAULT 'AUTO',
  ADD COLUMN IF NOT EXISTS "outboundOptIn" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "smsOptOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "expoPushToken" TEXT;
