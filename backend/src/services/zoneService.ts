/**
 * Zone resolution service — Darb 2.0 (§A4).
 *
 * Maintains a per-tenant in-memory cache (60s TTL) of active DeliveryZones
 * with their parsed GeoJSON polygons + bbox prefilters, and resolves a
 * lat/lng point to the zone that contains it (bbox prefilter first, then
 * exact @turf/boolean-point-in-polygon test — GeoJSON [lng, lat] order,
 * closed rings as stored by the seed and the zones route).
 *
 * The cache is a module-level Map rather than utils/cache.ts (Redis):
 * `invalidateZoneCache` must be synchronous per the cross-track contract,
 * and the parsed-polygon working set is tiny (~10 zones/tenant).
 */
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { prisma } from "../config";
import { Bbox, GeoJsonPolygon, pointInBbox } from "../utils/geo";

// ─── Contract types ─────────────────────────────────────────────────────────

export interface ResolvedZone {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
}

// ─── Per-tenant zone cache ──────────────────────────────────────────────────

interface CachedZone extends ResolvedZone {
  polygon: GeoJsonPolygon;
  bbox: Bbox;
}

interface CacheEntry {
  zones: CachedZone[];
  expiresAt: number;
}

const ZONE_CACHE_TTL_MS = 60_000;

const zoneCache = new Map<string, CacheEntry>();

/** Drop the cached zone set for a tenant (call after any zone mutation). */
export function invalidateZoneCache(tenantId: string): void {
  zoneCache.delete(tenantId);
}

/** Load (or reuse ≤60s-old) active zones for a tenant with parsed geometry. */
async function getActiveZones(tenantId: string): Promise<CachedZone[]> {
  const hit = zoneCache.get(tenantId);
  if (hit && hit.expiresAt > Date.now()) return hit.zones;

  const rows = await prisma.deliveryZone.findMany({
    where: { tenantId, isActive: true },
    orderBy: { code: "asc" },
  });

  const zones: CachedZone[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    nameAr: r.nameAr ?? null,
    polygon: r.polygon as unknown as GeoJsonPolygon,
    bbox: r.bbox as unknown as Bbox,
  }));

  zoneCache.set(tenantId, { zones, expiresAt: Date.now() + ZONE_CACHE_TTL_MS });
  return zones;
}

// ─── Resolution ─────────────────────────────────────────────────────────────

/**
 * Resolve a point to the active zone containing it, or null when the point
 * falls outside every zone polygon (or the coordinates are not finite).
 */
export async function resolveZone(
  tenantId: string,
  lat: number,
  lng: number,
): Promise<ResolvedZone | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const zones = await getActiveZones(tenantId);
  const pt = point([lng, lat]); // GeoJSON position order: [lng, lat]

  for (const zone of zones) {
    if (!zone.bbox || !pointInBbox(lat, lng, zone.bbox)) continue;
    if (booleanPointInPolygon(pt, zone.polygon as any)) {
      return { id: zone.id, code: zone.code, name: zone.name, nameAr: zone.nameAr };
    }
  }
  return null;
}

// ─── Branch re-zoning ───────────────────────────────────────────────────────

/**
 * Re-resolve every VendorBranch.zoneId for a tenant against the current
 * zone polygons (call after zone create/update/delete). Branches without
 * coordinates — or outside every zone — get zoneId = null. Returns the
 * number of branches whose zoneId actually changed.
 */
export async function rezoneBranches(tenantId: string): Promise<number> {
  // Always work from fresh polygons — the caller just mutated a zone.
  invalidateZoneCache(tenantId);

  const branches = await prisma.vendorBranch.findMany({
    where: { tenantId },
    select: { id: true, lat: true, lng: true, zoneId: true },
  });

  let updated = 0;
  for (const branch of branches) {
    let nextZoneId: string | null = null;
    if (branch.lat != null && branch.lng != null) {
      const zone = await resolveZone(tenantId, Number(branch.lat), Number(branch.lng));
      nextZoneId = zone?.id ?? null;
    }
    if (nextZoneId !== branch.zoneId) {
      await prisma.vendorBranch.updateMany({
        where: { id: branch.id, tenantId },
        data: { zoneId: nextZoneId },
      });
      updated++;
    }
  }
  return updated;
}
