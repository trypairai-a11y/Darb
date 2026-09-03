/**
 * Darb 2.0 — driver session availability flips (contract reconciliation #2:
 * availability = ONLINE | BUSY | OFFLINE on CourierOnlineSession).
 *
 * The dispatch engine only OFFERS to ONLINE couriers; these helpers keep the
 * flag truthful across the order lifecycle so the ops map / positions
 * snapshot shows BUSY while a driver carries an order:
 *
 *   assign (offer accept OR manual)        → BUSY
 *   DELIVERED / FAILED / CANCELLED (with a driver) → back to ONLINE
 *
 * Both run INSIDE the order transaction so the flag can never disagree with
 * the order row. The release guards on availability=BUSY so it never
 * resurrects a session the presence sweeper (or the driver) turned OFFLINE.
 */
import { Prisma } from "../../generated/prisma";

type Tx = Prisma.TransactionClient;

/** Driver picked up an assignment — open session goes BUSY. */
export async function markDriverBusy(
  tx: Tx,
  tenantId: string,
  driverId: string
): Promise<void> {
  await tx.courierOnlineSession.updateMany({
    where: { tenantId, driverId, isOnline: true },
    data: { availability: "BUSY" },
  });
}

/**
 * Order reached a terminal state — a still-open BUSY session goes ONLINE.
 *
 * PRD §8 batching guard: a batched driver still carrying ANOTHER
 * ASSIGNED/PICKED_UP order must stay BUSY, or he re-enters the candidate
 * pool mid-second-drop. Callers run this inside the same tx as the terminal
 * transition, so the just-finished order no longer matches the count.
 */
/**
 * Close the driver's open session outright (emergency handling). Unlike
 * releaseDriverToOnline this ignores BUSY: a driver whose order was just
 * pulled off them mid-emergency must not re-enter the candidate pool and be
 * offered the same order back seconds later. Mirrors the staff kill switch in
 * routes/drivers.ts (same fields), so presence, the map and dispatch agree.
 */
export async function forceDriverOffline(
  tx: Tx,
  tenantId: string,
  driverId: string
): Promise<boolean> {
  const existing = await tx.courierOnlineSession.findFirst({
    where: { tenantId, driverId, isOnline: true },
    orderBy: { startTime: "desc" },
    select: { id: true },
  });
  if (!existing) return false;
  await tx.courierOnlineSession.update({
    where: { id: existing.id },
    data: { availability: "OFFLINE", isOnline: false, endTime: new Date() },
  });
  return true;
}

export async function releaseDriverToOnline(
  tx: Tx,
  tenantId: string,
  driverId: string
): Promise<void> {
  const stillActive = await tx.deliveryOrder.count({
    where: { tenantId, driverId, status: { in: ["ASSIGNED", "PICKED_UP"] } },
  });
  if (stillActive > 0) return;
  await tx.courierOnlineSession.updateMany({
    where: { tenantId, driverId, isOnline: true, availability: "BUSY" },
    data: { availability: "ONLINE" },
  });
}
