// Darb 2.0 — per-driver divIcon markers, memoized so only the drivers whose
// position object actually changed re-render (the position store replaces
// objects on update, so reference equality is the change signal).
"use client";
import { memo, useMemo } from "react";
import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { driverMapStatus, type DriverPosition } from "@/types/darb";
// Colours live in a Leaflet-free module so the ops panel can share them
// without dragging react-leaflet (and `window`) into the server bundle.
import { DRIVER_STATUS_COLORS } from "./driverStatus";

function buildIcon(d: DriverPosition, selected: boolean): L.DivIcon {
  const color = DRIVER_STATUS_COLORS[driverMapStatus(d)];
  const heading = typeof d.heading === "number" && Number.isFinite(d.heading) ? d.heading : null;
  const ring = selected
    ? `<div style="position:absolute;inset:0;border-radius:9999px;border:2px solid ${color};opacity:.5;"></div>`
    : "";
  const chevron =
    heading != null
      ? `<div style="position:absolute;inset:0;transform:rotate(${Math.round(heading)}deg);display:flex;justify-content:center;">
           <svg width="10" height="8" viewBox="0 0 10 8" style="margin-top:-1px;"><path d="M5 0L10 8H0z" fill="${color}" stroke="white" stroke-width="1"/></svg>
         </div>`
      : "";
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="position:relative;width:30px;height:30px;${d.stale ? "opacity:.55;" : ""}">
      ${ring}
      ${chevron}
      <div style="position:absolute;top:8px;left:8px;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>
    </div>`,
  });
}

interface DriverMarkerProps {
  driver: DriverPosition;
  selected: boolean;
  onClick?: (driverId: string) => void;
}

const DriverMarker = memo(
  function DriverMarker({ driver, selected, onClick }: DriverMarkerProps) {
    const icon = useMemo(() => buildIcon(driver, selected), [driver, selected]);
    const handlers = useMemo(
      () => (onClick ? { click: () => onClick(driver.driverId) } : undefined),
      [onClick, driver.driverId]
    );
    return (
      <Marker position={[driver.lat, driver.lng]} icon={icon} eventHandlers={handlers}>
        <Tooltip direction="top" offset={[0, -12]}>
          <span dir="auto">{driver.name ?? driver.driverId}</span>
        </Tooltip>
      </Marker>
    );
  },
  (prev, next) =>
    prev.driver === next.driver && prev.selected === next.selected && prev.onClick === next.onClick
);

export default function DriverMarkersLayer({
  drivers,
  selectedDriverId,
  onDriverClick,
}: {
  drivers: DriverPosition[];
  selectedDriverId?: string | null;
  onDriverClick?: (driverId: string) => void;
}) {
  return (
    <>
      {drivers.map((d) => (
        <DriverMarker
          key={d.driverId}
          driver={d}
          selected={d.driverId === selectedDriverId}
          onClick={onDriverClick}
        />
      ))}
    </>
  );
}
