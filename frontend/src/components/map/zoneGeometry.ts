// Darb 2.0 — zone geometry helpers, deliberately free of any Leaflet import.
// ZonePolygonsLayer pulls in react-leaflet, which touches `window` at module
// scope and explodes during SSR. Pages that only need the maths (e.g. /zones,
// which computes fitBounds) import from here instead.
import type { DeliveryZone } from "@/types/darb";

/** Fallback palette cycled when a zone has no explicit color. */
export const ZONE_PALETTE = [
  "#006838",
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#b45309",
  "#4f46e5",
];

/** GeoJSON rings are [lng,lat]; Leaflet wants [lat,lng]. */
export function zoneRingLatLngs(zone: DeliveryZone): [number, number][] {
  const ring = zone.polygon?.coordinates?.[0];
  if (!Array.isArray(ring)) return [];
  return ring
    .filter((p): p is number[] => Array.isArray(p) && p.length >= 2)
    .map((p) => [p[1], p[0]] as [number, number]);
}

export function zoneColor(zone: DeliveryZone, index: number): string {
  return zone.color || ZONE_PALETTE[index % ZONE_PALETTE.length];
}
