// Darb 2.0 revision 15 (#3) — what a delivery company costs, and what that is
// allowed to do to who gets offered the order.
//
// One client rule lives here, about what Darb pays the company behind a
// driver:
//
//   #3 A company on a base fee with no kilometre rate has no way to be paid for
//      distance, so it may only take orders picked up and dropped off in the
//      same zone. This is a hard filter, not a ranking: a cross-zone order given
//      to a flat-rate company is money Darb loses on every single one, and the
//      order is not stranded by it (NO_DRIVER is a pause with a retry ladder
//      behind it, not a terminus).
//
// The rule does nothing until somebody configures a per-km fleet rate.
//
// Revision 17 (Edit #4) removed the target-price half of this file
// (resolveTargetPriceKwd, branchAverageCostKwd, shouldPrioritiseCost): the
// targetPriceKwd columns are dropped, and under the client's two real pricing
// models (subscription / margin) cost never steers dispatch.

import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { fleetRateOf, orderPayoutKwd, type FleetRate } from "../fleetService";

/** A company paid a base fee and nothing for distance. */
export function isFlatRateFleet(rate: FleetRate): boolean {
  return rate.perKmKwd == null || rate.perKmKwd.isZero();
}

/**
 * What this order would cost Darb if this driver's company delivered it.
 *
 * Deliberately the same function the payout statement is built from, so the
 * figure dispatch chooses on and the figure the company is later paid cannot
 * drift apart. A driver with no company behind them costs Darb no fleet fee,
 * which is 0 and ranks first: that is true, and it is the answer that would
 * have to be given anyway.
 */
export function estimatedOrderCostKwd(
  rate: FleetRate | null,
  distanceKm: Prisma.Decimal | null,
): number {
  if (!rate) return 0;
  return orderPayoutKwd(rate, distanceKm).toNumber();
}

export interface FleetRateRow {
  id: string;
  flatFeePerOrderKwd: Prisma.Decimal;
  perKmFeeKwd: Prisma.Decimal | null;
}

/** Rates for the companies behind a set of drivers, keyed by fleet id. */
export async function loadFleetRates(
  tenantId: string,
  fleetPartnerIds: string[],
): Promise<Map<string, FleetRate>> {
  const ids = [...new Set(fleetPartnerIds)];
  if (ids.length === 0) return new Map();
  const rows = (await prisma.fleetPartner.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, flatFeePerOrderKwd: true, perKmFeeKwd: true },
  })) as unknown as FleetRateRow[];
  return new Map(rows.map((r) => [r.id, fleetRateOf(r)]));
}
