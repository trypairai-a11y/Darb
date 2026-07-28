/**
 * Delivery pricing service — Darb 2.0 (§A4), revision 4 (#7), revision 5 (#6/#7).
 *
 * A delivery is priced by a DeliveryPlan: the branch's own if it has one, else
 * the vendor's. A plan is either by zone or by kilometre, never both, because a
 * price list a person cannot read off a screen is a price list nobody trusts.
 *
 *   by zone → the plan's own intra-zone flat fee within a zone, else the
 *             plan's origin→destination rate cell
 *   by km   → the first tier whose maxKm covers the routing distance
 *
 * Vendors with no plan keep the original tenant-wide pricing:
 *   Quote = FulfillmentSettings.intraZoneFeeKwd
 *         + (same zone ? 0 : ZoneSurcharge[origin→dest].surchargeKwd).
 *
 * That fallback is what lets plans ship dark and vendors move onto them one at
 * a time instead of all at once behind a flag day.
 *
 * A missing rate means the pair or the band is unserviceable by design
 * (absence of a row = UNSERVICEABLE_PAIR). All money math uses Prisma.Decimal
 * — never JS floats.
 */
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { ResolvedZone, resolveZone } from "./zoneService";
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
       * Null when the pin fell outside every zone polygon and the plan priced
       * it anyway (by-kilometre plans, which measure rather than look up).
       */
      dropoffZoneId: string | null;
      feeKwd: Prisma.Decimal;
      pickupZone: ResolvedZone;
      dropoffZone: ResolvedZone | null;
      /** True when the drop is outside every zone but was still priced. */
      outOfZone?: boolean;
      /** Set only for by-kilometre plans. */
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

// ─── Quote ──────────────────────────────────────────────────────────────────

/**
 * Price a delivery for a tenant.
 *
 * Pickup zone: `branchId` → VendorBranch.zoneId (BRANCH_UNZONED when the
 * branch is missing/unzoned), or an explicit `pickupZoneId`. Dropoff zone:
 * `dropoff.zoneId` directly, or lat/lng resolved point-in-polygon (no
 * coordinates AND no zoneId → NO_COORDINATES).
 *
 * A pin that resolves to no zone only rejects on the paths that need a zone to
 * find a price — by-zone plans and the tenant-wide fallback. A by-kilometre
 * plan prices it from the distance and returns `outOfZone: true` with a null
 * dropoffZoneId.
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
  // `dropoffZone = null` and only turned into OUT_OF_ZONE_DROPOFF at 3b, where
  // it actually matters.
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

  // ── 3a. By-kilometre plan ────────────────────────────────────────────────
  // Zone-independent by construction: the tiers answer for any pin on earth,
  // so an uncovered drop is priced exactly like a covered one.
  if (plan?.type === "KM") {
    const branch = await prisma.vendorBranch.findFirst({
      where: { id: input.branchId!, tenantId },
      select: { lat: true, lng: true },
    });
    const originLat = toNum(branch?.lat);
    const originLng = toNum(branch?.lng);
    const destLat = toNum(dropoff.lat);
    const destLng = toNum(dropoff.lng);
    // Kilometre pricing needs two pins. A dropoff given only as a zone id has
    // no distance to measure, so it cannot be priced on a km plan.
    if (originLat == null || originLng == null) return { ok: false, reason: "BRANCH_UNZONED" };
    if (destLat == null || destLng == null) return { ok: false, reason: "NO_COORDINATES" };

    const distance = await drivingDistanceKm(
      tenantId,
      { lat: originLat, lng: originLng },
      { lat: destLat, lng: destLng },
    );
    const feeKwd = feeForDistance(plan.kmTiers, distance.km);
    if (feeKwd == null) return { ok: false, reason: "UNSERVICEABLE_PAIR" };

    return {
      ok: true,
      ...base,
      feeKwd,
      distanceKm: Number(distance.km.toFixed(3)),
      distanceSource: distance.source,
      planId: plan.id,
    };
  }

  // ── 3b. By-zone plan ─────────────────────────────────────────────────────
  // From here down a zone is genuinely required: the price is a cell in a
  // grid, and there is no row to read for a pin that is in no zone. Draw the
  // zone and the plan prices it; until then it is a supervisor's call.
  if (!dropoffZone) return { ok: false, reason: "OUT_OF_ZONE_DROPOFF" };

  if (plan?.type === "ZONE") {
    // Revision 5 (#7): the intra-zone flat fee belongs to the plan. A delivery
    // that starts and ends in the same zone is priced by the plan's own flat
    // fee, not by a single tenant-wide number every plan had to share.
    //
    // A plan written before this column has no fee of its own, so the diagonal
    // of its grid still answers — that is where the value used to be kept, and
    // those plans keep quoting exactly what they quoted yesterday.
    if (pickupZone.id === dropoffZone.id && plan.intraZoneFeeKwd != null) {
      return {
        ok: true,
        ...base,
        feeKwd: new Prisma.Decimal(plan.intraZoneFeeKwd as unknown as Prisma.Decimal.Value),
        planId: plan.id,
      };
    }
    const rate = await prisma.deliveryPlanZoneRate.findFirst({
      where: { planId: plan.id, originZoneId: pickupZone.id, destZoneId: dropoffZone.id },
      select: { feeKwd: true },
    });
    if (!rate) return { ok: false, reason: "UNSERVICEABLE_PAIR" };
    return {
      ok: true,
      ...base,
      feeKwd: new Prisma.Decimal(rate.feeKwd as unknown as Prisma.Decimal.Value),
      planId: plan.id,
    };
  }

  // ── 3c. No plan: the original tenant-wide pricing ────────────────────────
  const settings = await prisma.fulfillmentSettings.findUnique({
    where: { tenantId },
  });
  if (!settings) {
    throw new Error(
      `FulfillmentSettings missing for tenant ${tenantId} — configure it via PUT /api/zones/settings (or run prisma/seed-darb2.ts) before quoting deliveries.`,
    );
  }

  let feeKwd = new Prisma.Decimal(settings.intraZoneFeeKwd as unknown as Prisma.Decimal.Value);

  if (pickupZone.id !== dropoffZone.id) {
    const surcharge = await prisma.zoneSurcharge.findFirst({
      where: { tenantId, originZoneId: pickupZone.id, destZoneId: dropoffZone.id },
      select: { surchargeKwd: true },
    });
    if (!surcharge) return { ok: false, reason: "UNSERVICEABLE_PAIR" };
    feeKwd = feeKwd.add(
      new Prisma.Decimal(surcharge.surchargeKwd as unknown as Prisma.Decimal.Value),
    );
  }

  return { ok: true, ...base, feeKwd };
}
