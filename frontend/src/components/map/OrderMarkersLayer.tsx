// Darb 2.0 — pickup/dropoff order markers with an optional connecting line.
"use client";
import { memo, useMemo } from "react";
import { Marker, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";

export interface OrderMarker {
  id: string;
  pickup?: { lat: number; lng: number; label?: string } | null;
  dropoff?: { lat: number; lng: number; label?: string } | null;
  /** Draw a line between pickup and dropoff. */
  showLine?: boolean;
  color?: string;
}

const PICKUP_COLOR = "#d97706";
const DROPOFF_COLOR = "#2563eb";

function pickupIcon(color: string) {
  // Store/merchant glyph in a rounded square.
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="width:24px;height:24px;border-radius:7px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg>
    </div>`,
  });
}

function dropoffIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [24, 32],
    iconAnchor: [12, 30],
    html: `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1C6 1 1 5.9 1 11.9 1 20 12 31 12 31s11-11 11-19.1C23 5.9 18 1 12 1z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="12" cy="11.6" r="4" fill="white"/>
    </svg>`,
  });
}

const OrderMarkerItem = memo(function OrderMarkerItem({ order }: { order: OrderMarker }) {
  const pColor = order.color ?? PICKUP_COLOR;
  const dColor = order.color ?? DROPOFF_COLOR;
  const pIcon = useMemo(() => pickupIcon(pColor), [pColor]);
  const dIcon = useMemo(() => dropoffIcon(dColor), [dColor]);
  return (
    <>
      {order.pickup && (
        <Marker position={[order.pickup.lat, order.pickup.lng]} icon={pIcon}>
          {order.pickup.label && (
            <Tooltip direction="top" offset={[0, -12]}>
              <span dir="auto">{order.pickup.label}</span>
            </Tooltip>
          )}
        </Marker>
      )}
      {order.dropoff && (
        <Marker position={[order.dropoff.lat, order.dropoff.lng]} icon={dIcon}>
          {order.dropoff.label && (
            <Tooltip direction="top" offset={[0, -28]}>
              <span dir="auto">{order.dropoff.label}</span>
            </Tooltip>
          )}
        </Marker>
      )}
      {order.showLine && order.pickup && order.dropoff && (
        <Polyline
          positions={[
            [order.pickup.lat, order.pickup.lng],
            [order.dropoff.lat, order.dropoff.lng],
          ]}
          pathOptions={{ color: order.color ?? "#64748b", weight: 2, dashArray: "6 6", opacity: 0.7 }}
        />
      )}
    </>
  );
});

export default function OrderMarkersLayer({ orders }: { orders: OrderMarker[] }) {
  return (
    <>
      {orders.map((o) => (
        <OrderMarkerItem key={o.id} order={o} />
      ))}
    </>
  );
}
