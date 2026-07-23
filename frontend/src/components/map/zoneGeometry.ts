// Darb 2.0 — zone geometry helpers, deliberately free of any Leaflet import.
// ZonePolygonsLayer pulls in react-leaflet, which touches `window` at module
// scope and explodes during SSR. Pages that only need the maths (e.g. /zones,
// which computes fitBounds) import from here instead.
import type { DeliveryZone } from "@/types/darb";

/**
 * Fallback palette cycled when a zone has no explicit color.
 *
 * Muted and low-chroma on purpose (client revision #1): the previous set was
 * fully saturated purple/blue/teal/orange/magenta/green, which read as clashing
 * against a street map. These sit close to the desaturated tones a Google Maps
 * or Waze overlay uses, so eight zones on screen at once still stay legible
 * without shouting.
 */
export const ZONE_PALETTE = [
  "#2F5D8C", // brand navy
  "#8A6A45", // clay brown
  "#4F7A75", // deep teal
  "#6B5B7B", // dusty violet
  "#8A5A63", // muted rose
  "#55744A", // moss
  "#7A6B4A", // olive
  "#5A6478", // steel
];

/**
 * Shared boundary stroke for every zone polygon. Thin and near-neutral so the
 * street map stays readable underneath; the zone's own colour carries in the
 * fill instead of a bright outline.
 */
export const ZONE_BOUNDARY_COLOR = "#3C4043";

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
