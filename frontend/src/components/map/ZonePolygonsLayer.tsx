// Darb 2.0 — delivery-zone polygons from GeoJSON with localized tooltips.
"use client";
import { memo } from "react";
import { Polygon, Tooltip } from "react-leaflet";
import { useI18n } from "@/i18n/I18nProvider";
import type { DeliveryZone } from "@/types/darb";

/** Fallback palette cycled when a zone has no explicit color. */
const ZONE_PALETTE = [
  "#006838",
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#b45309",
  "#4f46e5",
];

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

interface ZonePolygonsLayerProps {
  zones: DeliveryZone[];
  fillOpacity?: number;
  /** Per-zone fill opacity override (choropleth). Falls back to fillOpacity. */
  fillOpacityById?: Record<string, number>;
  selectedZoneId?: string | null;
  onZoneClick?: (zoneId: string) => void;
}

const ZoneShape = memo(function ZoneShape({
  zone,
  index,
  fillOpacity,
  selected,
  onZoneClick,
}: {
  zone: DeliveryZone;
  index: number;
  fillOpacity: number;
  selected: boolean;
  onZoneClick?: (zoneId: string) => void;
}) {
  const { locale } = useI18n();
  const positions = zoneRingLatLngs(zone);
  if (positions.length < 3) return null;
  const color = zoneColor(zone, index);
  const label = locale === "ar" && zone.nameAr ? zone.nameAr : zone.name;
  return (
    <Polygon
      positions={positions}
      pathOptions={{
        color,
        weight: selected ? 3 : 2,
        fillColor: color,
        fillOpacity: selected ? Math.min(fillOpacity + 0.15, 0.6) : fillOpacity,
        opacity: zone.isActive === false ? 0.4 : 1,
        dashArray: zone.isActive === false ? "6 6" : undefined,
      }}
      eventHandlers={onZoneClick ? { click: () => onZoneClick(zone.id) } : undefined}
    >
      <Tooltip sticky>
        <span dir="auto">
          {label} ({zone.code})
        </span>
      </Tooltip>
    </Polygon>
  );
});

export default function ZonePolygonsLayer({
  zones,
  fillOpacity = 0.15,
  fillOpacityById,
  selectedZoneId,
  onZoneClick,
}: ZonePolygonsLayerProps) {
  return (
    <>
      {zones.map((zone, i) => (
        <ZoneShape
          key={zone.id}
          zone={zone}
          index={i}
          fillOpacity={fillOpacityById?.[zone.id] ?? fillOpacity}
          selected={zone.id === selectedZoneId}
          onZoneClick={onZoneClick}
        />
      ))}
    </>
  );
}
