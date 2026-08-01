-- Proof photos that survive an environment with no object storage (2026-08-01).
--
-- Removing the PIN left a photo as the only way to complete a delivery, and the
-- photo path presigns a PUT to R2. Production has no R2 credentials, so that
-- presign throws, the app queues the POD forever and no driver can finish a
-- job. These bytes are the fallback; `fileKey` in R2 stays preferred, so
-- nothing needs migrating the day the credentials are set.

CREATE TABLE "DeliveryPhoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPhoto_pkey" PRIMARY KEY ("id")
);

-- The key is how every other surface already addresses a photo, so it has to
-- resolve to exactly one row whichever store it lives in.
CREATE UNIQUE INDEX "DeliveryPhoto_key_key" ON "DeliveryPhoto"("key");
CREATE INDEX "DeliveryPhoto_tenantId_orderId_idx" ON "DeliveryPhoto"("tenantId", "orderId");

ALTER TABLE "DeliveryPhoto" ADD CONSTRAINT "DeliveryPhoto_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
