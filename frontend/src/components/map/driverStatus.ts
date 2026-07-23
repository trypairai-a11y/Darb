// Darb 2.0 — driver status colours, deliberately free of any Leaflet import.
//
// Same reason zoneGeometry.ts exists: DriverMarkersLayer pulls in react-leaflet,
// which touches `window` at module scope and explodes during SSR. The ops
// control room's courier list and its legend need these colours but must not
// drag Leaflet into the server bundle, so they live here and the marker layer
// imports them too. One source, so a dot in the panel and a dot on the map can
// never disagree.
import type { DriverMapStatus } from "@/types/darb";

export const DRIVER_STATUS_COLORS: Record<DriverMapStatus, string> = {
  busy: "#B45309", // amber — carrying an order
  idle: "#2F8350", // green — online, free
  online: "#2F8350",
  offline: "#9CA3AF",
  stale: "#DC2626", // red — we have lost sight of them
};
