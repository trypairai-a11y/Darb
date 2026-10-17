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
import { logger } from "../../config/logger";
import { fleetRateOf, orderPayoutKwd, type FleetRate, type VehicleRate } from "../fleetService";

/**
 * A company paid a base fee and nothing for distance.
 *
 * Client note, 2026-08-16: a SUBSCRIPTION company is never flat-rate here. It
 * is paid the fee the shop was charged for the order, which already prices
 * the distance on a by-kilometre plan, so a cross-zone order costs Darb no
 * margin and fencing the company out would only shrink the pool.
 */
export function isFlatRateFleet(rate: FleetRate, vehicleType?: string | null): boolean {
  if (rate.model === "SUBSCRIPTION") return false;
  // Client note, 2026-10-15: a vehicle type can carry its own per-km rate,
  // which is paid ahead of the company's. A driver whose vehicle has one is
  // paid for distance even when the company-wide rate is blank.
  const perKm = vehicleOf(rate, vehicleType)?.perKmKwd ?? rate.perKmKwd;
  return perKm == null || perKm.isZero();
}

function vehicleOf(rate: FleetRate, vehicleType?: string | null): VehicleRate | null {
  if (!vehicleType || !rate.vehicles) return null;
  return rate.vehicles[vehicleType] ?? null;
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
  shopFeeKwd?: Prisma.Decimal | null,
  /** Client note, 2026-10-15: the driver's vehicle, priced at its own base
   *  fee and per-km rate when the company set them. */
  vehicleType?: string | null,
): number {
  if (!rate) return 0;
  return orderPayoutKwd(rate, distanceKm, shopFeeKwd, vehicleOf(rate, vehicleType)).toNumber();
}

export interface FleetRateRow {
  id: string;
  flatFeePerOrderKwd: Prisma.Decimal;
  perKmFeeKwd: Prisma.Decimal | null;
  commercialModel?: string | null;
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
    select: { id: true, flatFeePerOrderKwd: true, perKmFeeKwd: true, commercialModel: true },
  })) as unknown as FleetRateRow[];
  const rates = new Map(rows.map((r) => [r.id, fleetRateOf(r)]));

  // Client note, 2026-10-15: each company's per-vehicle base fee and per-km
  // rate. Read best-effort: a failure here prices the pool on the company
  // rates, which is what it did before, rather than stopping dispatch.
  try {
    const vehicleRows =
      ((await prisma.fleetVehicleRate.findMany({
        where: { tenantId, fleetPartnerId: { in: ids } },
        select: { fleetPartnerId: true, vehicleType: true, perOrderKwd: true, perKmKwd: true },
      })) as Array<{
        fleetPartnerId: string;
        vehicleType: string;
        perOrderKwd: Prisma.Decimal | null;
        perKmKwd: Prisma.Decimal | null;
      }> | undefined) ?? [];
    for (const v of vehicleRows) {
      const rate = rates.get(v.fleetPartnerId);
      if (!rate || rate.model === "SUBSCRIPTION") continue;
      if (v.perOrderKwd == null && v.perKmKwd == null) continue;
      rate.vehicles = {
        ...(rate.vehicles ?? {}),
        [v.vehicleType]: {
          baseKwd: v.perOrderKwd == null ? null : new Prisma.Decimal(v.perOrderKwd),
          perKmKwd: v.perKmKwd == null ? null : new Prisma.Decimal(v.perKmKwd),
        },
      };
    }
  } catch (err) {
    logger.warn({ err, tenantId }, "loadFleetRates: per-vehicle rates unreadable, using company rates");
  }
  return rates;
}
