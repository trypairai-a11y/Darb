-- AlterEnum
ALTER TYPE "DeliveryOrderSource" ADD VALUE 'PARTNER_API';

-- AlterEnum
ALTER TYPE "DeliveryOrderStatus" ADD VALUE 'RETURNED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'FLEET';

-- AlterEnum
ALTER TYPE "ViolationType" ADD VALUE 'LOW_CUSTOMER_RATING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WalletTxType" ADD VALUE 'REFUND';
ALTER TYPE "WalletTxType" ADD VALUE 'TIP';
ALTER TYPE "WalletTxType" ADD VALUE 'FLEET_PAYOUT';

