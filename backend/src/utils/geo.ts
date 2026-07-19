/**
 * Shared geo helpers for zones, dispatch distance scoring, and violation
 * detection. Extracted from the previously duplicated implementations in
 * routes/keetaMonitor.ts and services/violationEngine.ts.
 */

/** Great-circle distance between two points in metres (Haversine formula). */
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Bounding box as [minLng, minLat, maxLng, maxLat] — GeoJSON axis order. */
export type Bbox = [number, number, number, number];

/**
 * GeoJSON Polygon geometry (subset). Coordinates are rings of [lng, lat]
 * positions; only the outer ring (index 0) is considered for the bbox.
 */
export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

/**
 * Compute the bounding box of a GeoJSON Polygon (all rings considered).
 * Returns [minLng, minLat, maxLng, maxLat].
 */
export function bboxOfPolygon(geojson: GeoJsonPolygon): Bbox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const ring of geojson.coordinates) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** Cheap bbox prefilter before the exact point-in-polygon test. */
export function pointInBbox(lat: number, lng: number, bbox: Bbox): boolean {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}
