/**
 * Revision 24b — which private shift an order is carried on.
 *
 * Client note (#9): a shop on a private shift pays by the hour. An order of
 * that shop delivered by the driver it is paying for must not ALSO carry the
 * per-order delivery fee, and the company must not ALSO be paid per order for
 * it. The driver is only known at assignment, so that is where the order is
 * stamped (`DeliveryOrder.privateShiftId`), and completeDelivery reads the
 * stamp rather than re-deciding at the door.
 *
 * Only a shift that has STARTED (IN_PROGRESS) for this order's own vendor AND
 * branch counts: a BOOKED driver who has not pressed Start, or one ops gave
 * another branch's order by hand, is doing per-order work and is paid for it
 * per order.
 */
import type { Prisma } from "../../generated/prisma";

type Db = Pick<Prisma.TransactionClient, "privateShift">;

export async function privateShiftIdForAssignment(
  db: Db,
  args: { tenantId: string; driverId: string; vendorId: string; branchId: string | null; at: Date },
): Promise<string | null> {
  if (!args.branchId) return null;
  const shift = await db.privateShift.findFirst({
    where: {
      tenantId: args.tenantId,
      driverId: args.driverId,
      vendorId: args.vendorId,
      branchId: args.branchId,
      status: "IN_PROGRESS",
      startedAt: { lte: args.at },
      endAt: { gt: args.at },
    },
    select: { id: true },
  });
  return shift?.id ?? null;
}
