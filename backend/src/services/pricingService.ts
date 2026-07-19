/**
 * Delivery pricing service — Darb 2.0 (§A4).
 *
 * Quote = FulfillmentSettings.intraZoneFeeKwd
 *       + (same zone ? 0 : ZoneSurcharge[origin→dest].surchargeKwd).
 *
 * A missing ZoneSurcharge row for a cross-zone pair means the pair is
 * unserviceable by design (absence of a row = UNSERVICEABLE_PAIR).
 * All money math uses Prisma.Decimal — never JS floats.
 */
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { ResolvedZone, resolveZone } from "./zoneService";

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
      dropoffZoneId: string;
      feeKwd: Prisma.Decimal;
      pickupZone: ResolvedZone;
      dropoffZone: ResolvedZone;
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

// ─── Quote ──────────────────────────────────────────────────────────────────

/**
 * Price a delivery for a tenant.
 *
 * Pickup zone: `branchId` → VendorBranch.zoneId (BRANCH_UNZONED when the
 * branch is missing/unzoned), or an explicit `pickupZoneId`. Dropoff zone:
 * `dropoff.zoneId` directly, or lat/lng resolved point-in-polygon (no
 * coordinates AND no zoneId → NO_COORDINATES; resolved to nothing →
 * OUT_OF_ZONE_DROPOFF).
 *
 * Throws when FulfillmentSettings is missing for the tenant — that is a
 * configuration error, not a quotable rejection (routes map it to 500).
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
  const dropoff = input.dropoff ?? {};
  let dropoffZone: ResolvedZone | null = null;

  if (dropoff.zoneId) {
    const row = await prisma.deliveryZone.findFirst({
      where: { id: dropoff.zoneId, tenantId, isActive: true },
      select: { id: true, code: true, name: true, nameAr: true },
    });
    if (!row) return { ok: false, reason: "OUT_OF_ZONE_DROPOFF" };
    dropoffZone = toResolvedZone(row);
  } else if (
    typeof dropoff.lat === "number" &&
    typeof dropoff.lng === "number" &&
    Number.isFinite(dropoff.lat) &&
    Number.isFinite(dropoff.lng)
  ) {
    dropoffZone = await resolveZone(tenantId, dropoff.lat, dropoff.lng);
    if (!dropoffZone) return { ok: false, reason: "OUT_OF_ZONE_DROPOFF" };
  } else {
    return { ok: false, reason: "NO_COORDINATES" };
  }

  // ── 3. Fee (Prisma.Decimal arithmetic only) ──────────────────────────────
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

  return {
    ok: true,
    pickupZoneId: pickupZone.id,
    dropoffZoneId: dropoffZone.id,
    feeKwd,
    pickupZone,
    dropoffZone,
  };
}
