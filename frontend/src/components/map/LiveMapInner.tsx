// Darb 2.0 — client-only Leaflet composition. Loaded exclusively via
// next/dynamic from LiveMap.tsx; never import this module directly from a
// page (it touches `window` through Leaflet at import time).
"use client";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DeliveryZone, DriverPosition } from "@/types/darb";
import DriverMarkersLayer from "./DriverMarkersLayer";
import OrderMarkersLayer, { type OrderMarker } from "./OrderMarkersLayer";
import ZonePolygonsLayer from "./ZonePolygonsLayer";
import ZonePolygonEditor from "./ZonePolygonEditor";

export type { OrderMarker };

const KUWAIT_CENTER: [number, number] = [29.3759, 47.9774];

export interface SingleMarker {
  lat: number;
  lng: number;
  color?: string;
  label?: string;
}

export interface EditorConfig {
  /** Existing polygon to edit, as [lat, lng] pairs (unclosed). */
  initialRing?: [number, number][] | null;
  color?: string;
  /** Receives a closed GeoJSON ring: [lng, lat] pairs, first === last. */
  onComplete: (ring: number[][]) => void;
  onCancel: () => void;
}

export interface LiveMapProps {
  center?: [number, number];
  zoom?: number;
  drivers?: DriverPosition[];
  selectedDriverId?: string | null;
  onDriverClick?: (driverId: string) => void;
  orders?: OrderMarker[];
  zones?: DeliveryZone[];
  zoneFillOpacity?: number;
  /** Per-zone fill opacity override (choropleth) — keyed by zone id. */
  zoneFillOpacityById?: Record<string, number>;
  selectedZoneId?: string | null;
  onZoneClick?: (zoneId: string) => void;
  marker?: SingleMarker | null;
  onMapClick?: (lat: number, lng: number) => void;
  /** When set, the click-to-add-vertex polygon editor is active. */
  editor?: EditorConfig | null;
  /** [lat, lng] points the map should fit once on mount/update. */
  fitBounds?: [number, number][] | null;
}

function ClickCapture({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 13));
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [32, 32] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [26, 34],
    iconAnchor: [13, 32],
    html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 1C6.4 1 1 6.3 1 12.8 1 21.6 13 33 13 33s12-11.4 12-20.2C25 6.3 19.6 1 13 1z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="13" cy="12.5" r="4.5" fill="white"/>
    </svg>`,
  });
}

export default function LiveMapInner({
  center,
  zoom = 12,
  drivers,
  selectedDriverId,
  onDriverClick,
  orders,
  zones,
  zoneFillOpacity,
  zoneFillOpacityById,
  selectedZoneId,
  onZoneClick,
  marker,
  onMapClick,
  editor,
  fitBounds,
}: LiveMapProps) {
  const resolvedCenter = useMemo<[number, number]>(() => {
    if (center) return center;
    if (marker) return [marker.lat, marker.lng];
    return KUWAIT_CENTER;
  }, [center, marker]);

  const singleIcon = useMemo(() => pinIcon(marker?.color ?? "#006838"), [marker?.color]);

  return (
    <MapContainer
      center={resolvedCenter}
      zoom={zoom}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {zones && zones.length > 0 && (
        <ZonePolygonsLayer
          zones={zones}
          fillOpacity={zoneFillOpacity}
          fillOpacityById={zoneFillOpacityById}
          selectedZoneId={selectedZoneId}
          onZoneClick={onZoneClick}
        />
      )}

      {orders && orders.length > 0 && <OrderMarkersLayer orders={orders} />}

      {drivers && drivers.length > 0 && (
        <DriverMarkersLayer
          drivers={drivers}
          selectedDriverId={selectedDriverId}
          onDriverClick={onDriverClick}
        />
      )}

      {marker && (
        <Marker position={[marker.lat, marker.lng]} icon={singleIcon}>
          {marker.label && (
            <Tooltip direction="top" offset={[0, -30]}>
              {marker.label}
            </Tooltip>
          )}
        </Marker>
      )}

      {/* The editor owns map clicks while active. */}
      {editor ? (
        <ZonePolygonEditor
          initialRing={editor.initialRing ?? null}
          color={editor.color}
          onComplete={editor.onComplete}
          onCancel={editor.onCancel}
        />
      ) : (
        onMapClick && <ClickCapture onMapClick={onMapClick} />
      )}

      {fitBounds && fitBounds.length > 0 && <FitBounds points={fitBounds} />}
    </MapContainer>
  );
}
