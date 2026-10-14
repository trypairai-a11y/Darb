-- Revision 24 (orders stream, #5): cap on live orders per driver once dispatch
-- starts offering to busy drivers. Additive, idempotent.
ALTER TABLE "FulfillmentSettings" ADD COLUMN IF NOT EXISTS "maxActiveOrdersPerDriver" INTEGER NOT NULL DEFAULT 3;
