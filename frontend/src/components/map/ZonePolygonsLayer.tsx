// Darb 2.0 — delivery-zone polygons from GeoJSON with localized tooltips.
"use client";
import { memo } from "react";
import { Polygon, Tooltip } from "react-leaflet";
import { useI18n } from "@/i18n/I18nProvider";
import type { DeliveryZone } from "@/types/darb";
import { ZONE_BOUNDARY_COLOR, zoneColor, zoneRingLatLngs } from "./zoneGeometry";

// Re-exported for callers already importing them from here. Pages that need
// only the geometry should import "./zoneGeometry" directly — this module
// drags react-leaflet in, which cannot be server-rendered.
export { zoneColor, zoneRingLatLngs };

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
        // Revision #1: a thin neutral hairline for every boundary, with the
        // zone's own colour carried in the fill. Selection is the only state
        // that borrows the zone colour for the stroke, so the selected zone
        // still stands out without every zone competing for attention.
        color: selected ? color : ZONE_BOUNDARY_COLOR,
        weight: selected ? 2.5 : 1.25,
        fillColor: color,
        fillOpacity: selected ? Math.min(fillOpacity + 0.12, 0.45) : fillOpacity,
        opacity: zone.isActive === false ? 0.35 : selected ? 1 : 0.7,
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
