-- Revision 8 (#3): when the driver reached the shop.
--
-- `prisma migrate diff` also proposed dropping ChatMessage.contentTsv and its
-- GIN index, exactly as 20260723070931 warned it would. That column is created
-- by raw SQL in 20260513120000 and is deliberately not modelled in
-- schema.prisma. Those two statements were removed by hand; do not paste them
-- back in. They were executed once against prod by mistake and restored.

-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN "arrivedAt" TIMESTAMP(3);
