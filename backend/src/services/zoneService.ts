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

/**
 * Kilometres from a point to the nearest edge of a polygon (outer ring and
 * holes alike). Projected flat around the point's own latitude, which is
 * accurate to well under a percent at the few-kilometre scale of a Kuwait
 * zone gap and saves pulling in another turf package for one comparison.
 */
function kmToPolygonEdge(lat: number, lng: number, polygon: GeoJsonPolygon): number {
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const ring of polygon.coordinates ?? []) {
    for (let i = 0; i + 1 < ring.length; i++) {
      // Segment endpoints in km, relative to the point at the origin.
      const ax = (ring[i][0] - lng) * kmPerDegLng;
      const ay = (ring[i][1] - lat) * kmPerDegLat;
      const bx = (ring[i + 1][0] - lng) * kmPerDegLng;
      const by = (ring[i + 1][1] - lat) * kmPerDegLat;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * The active zone whose edge is closest to a point that fell outside every
 * polygon, with how far outside it is. Null only when the tenant has no
 * zones with geometry at all.
 *
 * Measured to the polygon edge, not the centroid: a long thin zone running
 * along the coast would otherwise lose a pin a hundred metres past its edge
 * to a compact neighbour whose middle happens to be nearer.
 */
export async function nearestZone(
  tenantId: string,
  lat: number,
  lng: number,
): Promise<{ zone: ResolvedZone; km: number } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const zones = await getActiveZones(tenantId);
  let best: { zone: ResolvedZone; km: number } | null = null;
  for (const zone of zones) {
    if (!zone.polygon?.coordinates) continue;
    const km = kmToPolygonEdge(lat, lng, zone.polygon);
    if (!Number.isFinite(km)) continue;
    if (!best || km < best.km) {
      best = {
        zone: { id: zone.id, code: zone.code, name: zone.name, nameAr: zone.nameAr },
        km,
      };
    }
  }
  return best;
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
