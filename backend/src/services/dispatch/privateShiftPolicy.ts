// Darb 2.0 revision 24 (#9) — private shifts in dispatch.
//
// Client note: "The vendor can open a private shift for himself, which will
// dispatch the driver to this vendor's orders only for the whole shift ... The
// priority of orders will go first to private shift drivers; if none are
// available, the per-order drivers will take the orders."
//
// Two rules, applied to the candidate pool selectCandidates has already built:
//
//   EXCLUSIVE  A driver on a private shift is never offered another shop's
//              order, nor the same shop's order from a different branch. That
//              holds from the shift's start time whether or not the driver
//              has pressed Start yet: they are meant to be standing at that
//              counter, and a stray offer is what would take them away.
//   PRIORITY   A driver whose private shift is IN_PROGRESS at this order's
//              branch ranks above every other candidate. When none is free
//              (all out on deliveries, or none booked) the pool is the
//              ordinary one and the per-order drivers take it.
//
// Kept to one function the candidate query calls, so the dispatch engine
// carries three short lines and this file carries the rule. It FAILS OPEN:
// if the lookup errors the order dispatches exactly as it did before private
// shifts existed, because a broken lookup must never strand a delivery.

import { prisma } from "../../config";
import { logger } from "../../config/logger";

export interface PrivateShiftDuty {
  driverId: string;
  vendorId: string;
  branchId: string;
  status: string;
}

export interface PrivateShiftPolicy {
  /** Drivers who must not be offered this order. */
  exclude: Set<string>;
  /** Drivers who rank first for this order. */
  priority: Set<string>;
}

/** The rule itself, pure: who is fenced out and who goes first. */
export function partitionForOrder(
  order: { vendorId: string; branchId: string },
  duties: PrivateShiftDuty[],
): PrivateShiftPolicy {
  const exclude = new Set<string>();
  const priority = new Set<string>();
  for (const d of duties) {
    const ours = d.vendorId === order.vendorId && d.branchId === order.branchId;
    if (!ours) {
      exclude.add(d.driverId);
      continue;
    }
    if (d.status === "IN_PROGRESS") priority.add(d.driverId);
  }
  // A driver somehow holding one shift here and one elsewhere at once is
  // working here: the order in front of us is the one they are standing at.
  for (const id of priority) exclude.delete(id);
  return { exclude, priority };
}

/** Private shifts that bind these drivers right now. */
export async function loadPrivateShiftDuties(
  tenantId: string,
  driverIds: string[],
  now: Date = new Date(),
): Promise<PrivateShiftDuty[]> {
  if (driverIds.length === 0) return [];
  const rows = await prisma.privateShift.findMany({
    where: {
      tenantId,
      driverId: { in: driverIds },
      OR: [
        { status: "IN_PROGRESS" },
        { status: "BOOKED", startAt: { lte: now }, endAt: { gt: now } },
      ],
    },
    select: { driverId: true, vendorId: true, branchId: true, status: true },
  });
  return rows
    .filter((r): r is typeof r & { driverId: string } => !!r.driverId)
    .map((r) => ({ driverId: r.driverId, vendorId: r.vendorId, branchId: r.branchId, status: r.status }));
}

/** What selectCandidates calls. Never throws. */
export async function privateShiftPolicyFor(
  tenantId: string,
  order: { id?: string; vendorId: string; branchId: string },
  driverIds: string[],
  now: Date = new Date(),
): Promise<PrivateShiftPolicy> {
  try {
    const duties = await loadPrivateShiftDuties(tenantId, driverIds, now);
    return partitionForOrder(order, duties);
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "private shift policy lookup failed, dispatching without it");
    return { exclude: new Set(), priority: new Set() };
  }
}
