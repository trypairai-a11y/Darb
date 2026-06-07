-- CreateTable
CREATE TABLE "DriverBatchHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    "note" TEXT,

    CONSTRAINT "DriverBatchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverBatchHistory_tenantId_idx" ON "DriverBatchHistory"("tenantId");

-- CreateIndex
CREATE INDEX "DriverBatchHistory_driverId_changedAt_idx" ON "DriverBatchHistory"("driverId", "changedAt");

-- AddForeignKey
ALTER TABLE "DriverBatchHistory" ADD CONSTRAINT "DriverBatchHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverBatchHistory" ADD CONSTRAINT "DriverBatchHistory_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
