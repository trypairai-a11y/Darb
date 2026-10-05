/**
 * Delivery pricing service — Darb 2.0 (§A4), revision 4 (#7), revision 5 (#6/#7).
 *
 * A delivery is priced by a DeliveryPlan: the branch's own if it has one, else
 * the vendor's. A plan is either by zone or by kilometre, never both, because a
 * price list a person cannot read off a screen is a price list nobody trusts.
 *
 *   by zone → the plan's own intra-zone flat fee within a zone, else the
 *             plan's origin→destination rate cell
 *   by km   → the plan's base fee plus its rate for each kilometre travelled
 *             (revision 14 #1), or, on a plan never moved onto that formula,
 *             the first tier whose maxKm covers the routing distance
 *
 * A by-zone plan holding no rates at all has never been configured, and falls
 * back to the tenant-wide pricing below rather than refusing every order that
 * merchant sends. A blank cell inside a filled grid still means unserviceable.
 *
 * Vendors with no plan keep the original tenant-wide pricing:
 *   Quote = FulfillmentSettings.intraZoneFeeKwd
 *         + (same zone ? 0 : ZoneSurcharge[origin→dest].surchargeKwd).
 *
 * That fallback is what lets plans ship dark and vendors move onto them one at
 * a time instead of all at once behind a flag day.
 *
 * A drop pinned outside every zone is priced, never sent to review: a by-km
 * plan measures it like any other, and every zone-keyed path prices it as a
 * drop in the zone whose edge is nearest (client note, 2026-07-28).
 *
 * A missing rate means the pair or the band is unserviceable by design
 * (absence of a row = UNSERVICEABLE_PAIR). All money math uses Prisma.Decimal
 * — never JS floats.
 */
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { ResolvedZone, nearestZone, resolveZone } from "./zoneService";

/** How far past the nearest zone's edge a drop is still priced rather than reviewed. */
export const MAX_OUT_OF_ZONE_KM = 10;
import { DistanceSource, drivingDistanceKm } from "./distanceService";

// ─── Contract types ─────────────────────────────────────────────────────────

export type QuoteRejection =
  | "OUT_OF_ZONE_DROPOFF"
  | "UNSERVICEABLE_PAIR"
  | "NO_COORDINATES"
  | "BRANCH_UNZONED";

export type QuoteResult =
  | {
      ok: true;
      pickupZoneId: string;
      /**
       * Null when the pin fell outside every zone polygon and was priced
       * anyway (by distance on a by-km plan, as the nearest zone otherwise).
       */
      dropoffZoneId: string | null;
      feeKwd: Prisma.Decimal;
      pickupZone: ResolvedZone;
      dropoffZone: ResolvedZone | null;
      /** True when the drop is outside every zone but was still priced. */
      outOfZone?: boolean;
      /**
       * The zone an out-of-zone drop was priced as: the one whose edge is
       * nearest the pin. Set only on zone-keyed pricing (by-zone plans and the
       * tenant-wide card); a by-km plan never needs a zone to price.
       */
      pricedAsZone?: ResolvedZone;
      /** How far outside that zone's edge the pin sits, in km. */
      outOfZoneKm?: number;
      /**
       * Branch-to-drop routing distance. Set on every quote that has two pins
       * to measure between, not only on by-kilometre plans (revision 14 #3):
       * the fleet payout is per kilometre now, so an order priced by zone still
       * has to record how far it went. Undefined when the dropoff was given as
       * a zone id with no coordinates, which nothing can measure.
       */
      distanceKm?: number;
      distanceSource?: DistanceSource;
      planId?: string;
    }
  | { ok: false; reason: QuoteRejection };

export interface QuoteInput {
  branchId?: string;
  pickupZoneId?: string;
  dropoff: { lat?: number; lng?: number; zoneId?: string };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toResolvedZone(z: { id: string; code: string; name: string; nameAr: string | null }): ResolvedZone {
  return { id: z.id, code: z.code, name: z.name, nameAr: z.nameAr ?? null };
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The plan a delivery is priced on. Null means "no plan assigned" and the
 * caller falls back to FulfillmentSettings.
 *
 * Revision 5 (#6): the branch's own plan wins, then the vendor's. The client
 * asked for plan assignment to live with the branches rather than as its own
 * tab, and a chain whose airport branch prices differently from its city ones
 * is the reason that is worth having. A branch with no plan of its own keeps
 * inheriting the vendor's, which is what every branch does today — this reads
 * one extra column, it does not reprice anybody.
 */
async function resolvePlan(tenantId: string, branchId?: string) {
  if (!branchId) return null;
  const branch = await prisma.vendorBranch.findFirst({
    where: { id: branchId, tenantId },
    select: { deliveryPlanId: true, vendor: { select: { deliveryPlanId: true } } },
  });
  const planId = branch?.deliveryPlanId ?? branch?.vendor?.deliveryPlanId;
  if (!planId) return null;

  const plan = await prisma.deliveryPlan.findFirst({
    where: { id: planId, tenantId, isActive: true },
    include: { kmTiers: { orderBy: { sortOrder: "asc" } } },
  });
  return plan ?? null;
}

/**
 * Fee for a by-kilometre plan. Tiers are ordered ascending and the last one may
 * carry maxKm = NULL, meaning "and above" — that is what makes "14+ km" a row
 * rather than a special case here. A tier with a NULL fee is the client's blank
 * cell: that band is not served.
 */
function feeForDistance(
  tiers: Array<{ maxKm: Prisma.Decimal | null; feeKwd: Prisma.Decimal | null }>,
  km: number,
): Prisma.Decimal | null {
  for (const tier of tiers) {
    const max = tier.maxKm == null ? null : Number(tier.maxKm);
    if (max == null || km <= max) {
      return tier.feeKwd == null
        ? null
        : new Prisma.Decimal(tier.feeKwd as unknown as Prisma.Decimal.Value);
    }
  }
  // Past every band and none of them was open-ended: not served.
  return null;
}

/**
 * Fee for a by-kilometre plan — revision 14 (#1).
 *
 * The client's rule: base fee plus a rate for each kilometre travelled.
 *
 *   fee = baseFeeKwd + perKmFeeKwd × km,  rounded to the fils
 *
 * Beyond `maxDistanceKm` the plan does not deliver, which is the only reason
 * that column exists: a formula on its own quotes a price for any distance,
 * and the ladder it replaces could say "we stop here" by leaving the top band
 * blank. Losing that would have turned an unserviceable drop into a very large
 * quote nobody meant to offer.
 *
 * A plan with neither number set has never been moved onto the formula, so its
 * band ladder still answers. That is what lets this ship without repricing a
 * single live plan on the deploy.
 */
function kmPlanFee(
  plan: {
    baseFeeKwd: Prisma.Decimal | null;
    perKmFeeKwd: Prisma.Decimal | null;
    maxDistanceKm: Prisma.Decimal | null;
    kmTiers: Array<{ maxKm: Prisma.Decimal | null; feeKwd: Prisma.Decimal | null }>;
  },
  km: number,
): Prisma.Decimal | null {
  if (plan.baseFeeKwd == null && plan.perKmFeeKwd == null) {
    return feeForDistance(plan.kmTiers, km);
  }

  const maxKm = plan.maxDistanceKm == null ? null : Number(plan.maxDistanceKm);
  if (maxKm != null && km > maxKm) return null;

  const base = new Prisma.Decimal((plan.baseFeeKwd ?? 0) as unknown as Prisma.Decimal.Value);
  const perKm = new Prisma.Decimal((plan.perKmFeeKwd ?? 0) as unknown as Prisma.Decimal.Value);
  return base.plus(perKm.mul(new Prisma.Decimal(km))).toDecimalPlaces(3);
}

// ─── Quote ──────────────────────────────────────────────────────────────────

/**
 * Price a delivery for a tenant.
 *
 * Pickup zone: `branchId` → VendorBranch.zoneId (BRANCH_UNZONED when the
 * branch is missing/unzoned), or an explicit `pickupZoneId`. Dropoff zone:
 * `dropoff.zoneId` directly, or lat/lng resolved point-in-polygon (no
 * coordinates AND no zoneId → NO_COORDINATES).
 *
 * A pin that resolves to no zone is still priced, and returns `outOfZone: true`
 * with a null dropoffZoneId. A by-kilometre plan prices it from the distance;
 * the zone-keyed paths price it as a drop in the nearest zone and say which in
 * `pricedAsZone`. OUT_OF_ZONE_DROPOFF is left for a dropoff zone id that names
 * no zone, and for a tenant with no zone geometry to measure against.
 *
 * Throws when a plan-less vendor has no FulfillmentSettings for the tenant —
 * that is a configuration error, not a quotable rejection (routes map it to
 * 500).
 */
export async function quoteDelivery(
  tenantId: string,
  input: QuoteInput,
): Promise<QuoteResult> {
  // ── 1. Pickup zone ────────────────────────────────────────────────────────
  let pickupZoneId: string | null = null;

  if (input.branchId) {
    const branch = await prisma.vendorBranch.findFirst({
      where: { id: input.branchId, tenantId },
      select: { zoneId: true },
    });
    if (!branch || !branch.zoneId) return { ok: false, reason: "BRANCH_UNZONED" };
    pickupZoneId = branch.zoneId;
  } else if (input.pickupZoneId) {
    pickupZoneId = input.pickupZoneId;
  } else {
    // No way to determine the pickup side.
    return { ok: false, reason: "BRANCH_UNZONED" };
  }

  const pickupZoneRow = await prisma.deliveryZone.findFirst({
    where: { id: pickupZoneId, tenantId },
    select: { id: true, code: true, name: true, nameAr: true },
  });
  if (!pickupZoneRow) return { ok: false, reason: "BRANCH_UNZONED" };
  const pickupZone = toResolvedZone(pickupZoneRow);

  // ── 2. Dropoff zone ───────────────────────────────────────────────────────
  //
  // A pin that lands outside every polygon is NOT a rejection here any more.
  // Only a by-zone plan needs a zone to read a price off; a by-kilometre plan
  // measures the trip and never looks the zone up. Rejecting both alike meant
  // a km-priced merchant was refused an order it had a perfectly good price
  // for, purely because the map has gaps. So the miss is carried down as
  // `dropoffZone = null` and resolved at 3b, where a zone is actually needed
  // (as the nearest zone, since the client note of 2026-07-28).
  const dropoff = input.dropoff ?? {};
  let dropoffZone: ResolvedZone | null = null;

  if (dropoff.zoneId) {
    const row = await prisma.deliveryZone.findFirst({
      where: { id: dropoff.zoneId, tenantId, isActive: true },
      select: { id: true, code: true, name: true, nameAr: true },
    });
    // An explicit zone id that resolves to nothing is a bad reference, not a
    // map gap: there is no pin to measure, so nothing downstream can price it.
    if (!row) return { ok: false, reason: "OUT_OF_ZONE_DROPOFF" };
    dropoffZone = toResolvedZone(row);
  } else if (
    typeof dropoff.lat === "number" &&
    typeof dropoff.lng === "number" &&
    Number.isFinite(dropoff.lat) &&
    Number.isFinite(dropoff.lng)
  ) {
    dropoffZone = await resolveZone(tenantId, dropoff.lat, dropoff.lng);
  } else {
    return { ok: false, reason: "NO_COORDINATES" };
  }

  const base = {
    pickupZoneId: pickupZone.id,
    dropoffZoneId: dropoffZone?.id ?? null,
    pickupZone,
    dropoffZone,
    ...(dropoffZone ? {} : { outOfZone: true }),
  };

  // ── 3. Fee (Prisma.Decimal arithmetic only) ──────────────────────────────
  const plan = await resolvePlan(tenantId, input.branchId);

  // ── 3·0. Measure the trip, whatever the plan prices on ───────────────────
  //
  // Revision 14 (#3): this used to run only inside the by-kilometre branch,
  // because the distance was only ever a pricing input. It is a payout input
  // now — Darb pays its delivery companies a base plus a rate per kilometre —
  // and a zone-priced order is carried by a driver over exactly the same road
  // as a km-priced one. Leaving the measurement inside 3a would have paid the
  // base and nothing else on every zone-priced delivery, silently, for a whole
  // month before anyone reconciled it.
  //
  // Google is asked once per rounded coordinate pair and cached for thirty
  // days, and the call cannot throw or reject a quote: it falls back to
  // straight-line and says which it gave. So the cost of measuring every order
  // is a cache hit on the repeat traffic that makes up most of a Kuwait day.
  const branchPin = input.branchId
    ? await prisma.vendorBranch.findFirst({
        where: { id: input.branchId, tenantId },
        select: { lat: true, lng: true },
      })
    : null;
  const originLat = toNum(branchPin?.lat);
  const originLng = toNum(branchPin?.lng);
  const destLat = toNum(dropoff.lat);
  const destLng = toNum(dropoff.lng);
  const hasBothPins =
    originLat != null && originLng != null && destLat != null && destLng != null;

  const distance = hasBothPins
    ? await drivingDistanceKm(
        tenantId,
        { lat: originLat as number, lng: originLng as number },
        { lat: destLat as number, lng: destLng as number },
      )
    : null;
  // Spread onto every ok result below. A dropoff given as a zone id with no
  // coordinates has nothing to measure, and stays absent rather than zero: a
  // zero kilometre order would be paid as if the driver never moved.
  const measured = distance
    ? { distanceKm: Number(distance.km.toFixed(3)), distanceSource: distance.source }
    : {};

  // ── 3a. By-kilometre plan ────────────────────────────────────────────────
  // Zone-independent by construction: the tiers answer for any pin on earth,
  // so an uncovered drop is priced exactly like a covered one.
  if (plan?.type === "KM") {
    // Kilometre pricing needs two pins. A dropoff given only as a zone id has
    // no distance to measure, so it cannot be priced on a km plan.
    if (originLat == null || originLng == null) return { ok: false, reason: "BRANCH_UNZONED" };
    if (destLat == null || destLng == null) return { ok: false, reason: "NO_COORDINATES" };

    const feeKwd = kmPlanFee(plan, (distance as { km: number }).km);
    if (feeKwd == null) return { ok: false, reason: "UNSERVICEABLE_PAIR" };

    return { ok: true, ...base, ...measured, feeKwd, planId: plan.id };
  }

  // ── 3b. By-zone plan ─────────────────────────────────────────────────────
  // From here down the price is keyed on a zone: a cell in a plan's grid, or
  // a row in the tenant-wide surcharge table.
  //
  // A pin in no zone used to stop here with OUT_OF_ZONE_DROPOFF, which landed
  // the order in Needs review for a person to price by hand. The client's note
  // (2026-07-28): "If out of zone drop off the price changes only, no need to
  // review." Only by-km plans did that; every by-zone merchant and every
  // merchant with no plan had each such order parked until somebody noticed.
  //
  // Nothing in a zone grid or the surcharge table holds a figure for "outside
  // the map", and neither carries a rate per kilometre to charge the extra
  // distance with. What the data does hold is the price to every drawn zone,
  // and a driver reaching a pin past a zone's edge drives through that zone to
  // get there. So the drop is priced as a drop in the zone whose edge is
  // nearest, and the quote says which (`pricedAsZone`) and how far out
  // (`outOfZoneKm`), so the price can be read back and argued with. The order
  // itself still records no dropoff zone, because it is in none.
  //
  // A tenant with no zone geometry at all has nothing to measure against, and
  // that one case still goes to review. So does a pin more than
  // MAX_OUT_OF_ZONE_KM past the nearest edge: that is a mistyped address or a
  // pin dropped on the wrong country, and pricing it at a border zone's rate
  // would dispatch a driver to somewhere nobody meant.
  let priceZone: ResolvedZone;
  let snapped: { pricedAsZone: ResolvedZone; outOfZoneKm: number } | null = null;
  if (dropoffZone) {
    priceZone = dropoffZone;
  } else {
    const nearest =
      destLat != null && destLng != null ? await nearestZone(tenantId, destLat, destLng) : null;
    if (!nearest || nearest.km > MAX_OUT_OF_ZONE_KM) return { ok: false, reason: "OUT_OF_ZONE_DROPOFF" };
    priceZone = nearest.zone;
    snapped = { pricedAsZone: nearest.zone, outOfZoneKm: Number(nearest.km.toFixed(3)) };
  }
  const priced = { ...base, ...measured, ...(snapped ?? {}) };

  // A by-zone plan with NOT ONE rate in it has never been configured, and
  // reading it as "every pair unserviceable" refuses that merchant's entire
  // order book. That is not a hypothetical: a plan created and left empty took
  // a live pharmacy off dispatch completely, and the only visible symptom was
  // orders piling up in Needs review.
  //
  // A blank CELL in a filled grid still means unserviceable — that is somebody
  // deciding not to serve a pair. An EMPTY grid is somebody who has not decided
  // anything yet, so the tenant-wide rate card answers until they do. The two
  // are different states and only one of them should stop a delivery.
  const planIsConfigured =
    plan?.type === "ZONE"
      ? (await prisma.deliveryPlanZoneRate.count({ where: { planId: plan.id } })) > 0
      : false;

  if (plan?.type === "ZONE" && planIsConfigured) {
    // Revision 5 (#7): the intra-zone flat fee belongs to the plan. A delivery
    // that starts and ends in the same zone is priced by the plan's own flat
    // fee, not by a single tenant-wide number every plan had to share.
    //
    // A plan written before this column has no fee of its own, so the diagonal
    // of its grid still answers — that is where the value used to be kept, and
    // those plans keep quoting exactly what they quoted yesterday.
    if (pickupZone.id === priceZone.id && plan.intraZoneFeeKwd != null) {
      return {
        ok: true,
        ...priced,
        feeKwd: new Prisma.Decimal(plan.intraZoneFeeKwd as unknown as Prisma.Decimal.Value),
        planId: plan.id,
      };
    }
    const rate = await prisma.deliveryPlanZoneRate.findFirst({
      where: { planId: plan.id, originZoneId: pickupZone.id, destZoneId: priceZone.id },
      select: { feeKwd: true },
    });
    if (!rate) return { ok: false, reason: "UNSERVICEABLE_PAIR" };
    return {
      ok: true,
      ...priced,
      feeKwd: new Prisma.Decimal(rate.feeKwd as unknown as Prisma.Decimal.Value),
      planId: plan.id,
    };
  }

  // ── 3c. No plan, or an empty one: the original tenant-wide pricing ───────
  const settings = await prisma.fulfillmentSettings.findUnique({
    where: { tenantId },
  });
  if (!settings) {
    throw new Error(
      `FulfillmentSettings missing for tenant ${tenantId} — configure it via PUT /api/zones/settings (or run prisma/seed-darb2.ts) before quoting deliveries.`,
    );
  }

  let feeKwd = new Prisma.Decimal(settings.intraZoneFeeKwd as unknown as Prisma.Decimal.Value);

  if (pickupZone.id !== priceZone.id) {
    const surcharge = await prisma.zoneSurcharge.findFirst({
      where: { tenantId, originZoneId: pickupZone.id, destZoneId: priceZone.id },
      select: { surchargeKwd: true },
    });
    if (!surcharge) return { ok: false, reason: "UNSERVICEABLE_PAIR" };
    feeKwd = feeKwd.add(
      new Prisma.Decimal(surcharge.surchargeKwd as unknown as Prisma.Decimal.Value),
    );
  }

  return { ok: true, ...priced, feeKwd };
}
