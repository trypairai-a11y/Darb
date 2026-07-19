// Darb 2.0 — pure zone geometry helpers (wave 2). Deliberately Leaflet-free:
// pages import these directly (outside the LiveMap dynamic boundary), so this
// module must never touch `window` or leaflet at import time.
import type { DeliveryZone } from "@/types/darb";

/** Zone centroid as [lat, lng] — persisted centroid first, ring average else. */
export function zoneCentroid(zone: DeliveryZone): [number, number] | null {
  if (zone.centroidLat != null && zone.centroidLng != null) {
    return [Number(zone.centroidLat), Number(zone.centroidLng)];
  }
  const ring = zone.polygon?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let latSum = 0;
  let lngSum = 0;
  let n = 0;
  for (const p of ring) {
    if (Array.isArray(p) && p.length >= 2) {
      lngSum += p[0];
      latSum += p[1];
      n++;
    }
  }
  if (n === 0) return null;
  return [latSum / n, lngSum / n];
}

/** Ray-casting point-in-polygon against the zone's outer ring ([lng, lat]). */
export function pointInZone(lat: number, lng: number, zone: DeliveryZone): boolean {
  const ring = zone.polygon?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
