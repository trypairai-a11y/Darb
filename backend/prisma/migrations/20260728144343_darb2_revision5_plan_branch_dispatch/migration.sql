-- AlterTable
ALTER TABLE "DeliveryPlan" ADD COLUMN     "intraZoneFeeKwd" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "FulfillmentSettings" ADD COLUMN     "finishingSoonMinutes" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "VendorBranch" ADD COLUMN     "deliveryPlanId" TEXT;

-- AddForeignKey
ALTER TABLE "VendorBranch" ADD CONSTRAINT "VendorBranch_deliveryPlanId_fkey" FOREIGN KEY ("deliveryPlanId") REFERENCES "DeliveryPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

