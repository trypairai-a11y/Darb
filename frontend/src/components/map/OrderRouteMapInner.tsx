// Revision 24 #13 — client-only Leaflet map for one order's route. Loaded
// exclusively through next/dynamic from OrderRouteMap.tsx (Leaflet touches
// `window` at import time), the same split LiveMap/LiveMapInner use.
"use client";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { OrderRoute } from "@/types/darb";
import { ROUTE_COLORS } from "./routeColors";

const KUWAIT_CENTER: [number, number] = [29.3759, 47.9774];

function pinIcon(color: string, glyph: string) {
  return L.divIcon({
    className: "",
    iconSize: [26, 34],
    iconAnchor: [13, 32],
    html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 1C6.4 1 1 6.3 1 12.8 1 21.6 13 33 13 33s12-11.4 12-20.2C25 6.3 19.6 1 13 1z" fill="${color}" stroke="white" stroke-width="2"/>
      <text x="13" y="16.5" text-anchor="middle" font-size="10" font-family="system-ui, sans-serif" font-weight="700" fill="white">${glyph}</text>
    </svg>`,
  });
}

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    // The map often mounts inside a sliding panel whose final size is not
    // known yet; without this the tiles stop short and the fit is off.
    const resize = window.setTimeout(() => map.invalidateSize(), 300);
    return () => window.clearTimeout(resize);
  }, [map]);
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0]!, 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export interface OrderRouteMapInnerProps {
  route: OrderRoute;
  pickupLabel: string;
  dropoffLabel: string;
  /** The driver's live fix, when the screen has a fresher one than the path. */
  live?: { lat: number; lng: number } | null;
}

export default function OrderRouteMapInner({ route, pickupLabel, dropoffLabel, live }: OrderRouteMapInnerProps) {
  const toPickup = useMemo<[number, number][]>(
    () => route.path.filter((p) => p.leg === "TO_PICKUP").map((p) => [p.lat, p.lng]),
    [route.path],
  );
  const toDropoff = useMemo<[number, number][]>(() => {
    const leg = route.path.filter((p) => p.leg === "TO_DROPOFF").map((p) => [p.lat, p.lng] as [number, number]);
    // Join the two legs so the line does not break at the pickup.
    const lastBefore = toPickup[toPickup.length - 1];
    return lastBefore && leg.length ? [lastBefore, ...leg] : leg;
  }, [route.path, toPickup]);

  const bounds = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = route.path.map((p) => [p.lat, p.lng]);
    if (route.pickup) pts.push([route.pickup.lat, route.pickup.lng]);
    if (route.dropoff) pts.push([route.dropoff.lat, route.dropoff.lng]);
    // The live dot is left out on purpose: it moves every few seconds, and
    // refitting on each move would yank the map out from under the reader.
    return pts;
  }, [route]);

  const last = live ?? route.path[route.path.length - 1];
  const pickupIcon = useMemo(() => pinIcon(ROUTE_COLORS.pickup, "S"), []);
  const dropoffIcon = useMemo(() => pinIcon(ROUTE_COLORS.dropoff, "C"), []);

  return (
    <MapContainer center={bounds[0] ?? KUWAIT_CENTER} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        className="darb-muted-tiles"
        maxZoom={19}
      />
      {toPickup.length > 1 && (
        <Polyline positions={toPickup} pathOptions={{ color: ROUTE_COLORS.toPickup, weight: 3, dashArray: "6 6" }} />
      )}
      {toDropoff.length > 1 && (
        <Polyline positions={toDropoff} pathOptions={{ color: ROUTE_COLORS.toDropoff, weight: 4 }} />
      )}
      {last && (
        <CircleMarker
          center={[last.lat, last.lng]}
          radius={5}
          pathOptions={{ color: "white", weight: 2, fillColor: ROUTE_COLORS.toDropoff, fillOpacity: 1 }}
        />
      )}
      {route.pickup && (
        <Marker position={[route.pickup.lat, route.pickup.lng]} icon={pickupIcon}>
          <Tooltip direction="top" offset={[0, -30]}>
            {pickupLabel}
            {route.pickup.name ? `: ${route.pickup.name}` : ""}
          </Tooltip>
        </Marker>
      )}
      {route.dropoff && (
        <Marker position={[route.dropoff.lat, route.dropoff.lng]} icon={dropoffIcon}>
          <Tooltip direction="top" offset={[0, -30]}>
            {dropoffLabel}
            {route.dropoff.address ? `: ${route.dropoff.address}` : ""}
          </Tooltip>
        </Marker>
      )}
      <Fit points={bounds} />
    </MapContainer>
  );
}
