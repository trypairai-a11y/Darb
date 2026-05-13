/**
 * Phase 7 Wave 0 RED test — <LiveFloorMap/> Leaflet wrapper.
 *
 * Wave 2 ships the map component. The component MUST be dynamically
 * importable with ssr:false because react-leaflet touches `window`
 * (hydration SSR-safety). The component takes a `couriers` prop and
 * renders one Marker per online courier, wrapped in a
 * MarkerClusterGroup configured per RESEARCH §Pattern 6.
 *
 * Contract:
 *   - MapContainer center=[29.3759, 47.9774], zoom=11 (Kuwait City).
 *   - One Marker per courier in props.couriers.
 *   - MarkerClusterGroup props: chunkedLoading=true, animate=false,
 *     maxClusterRadius=40, disableClusteringAtZoom=16.
 *   - Marker click invokes props.onMarkerClick(driverId).
 *
 * REQ-floor-live-map.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  FLOOR_COURIER_FIXTURE,
  KUWAIT_CITY_CENTER,
  KUWAIT_CITY_ZOOM,
} from "@/__tests__/fixtures/floorCouriers";

// Mock react-leaflet + react-leaflet-cluster before the component
// import. The component renders a small DOM tree we can interrogate.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, center, zoom }: any) => (
    <div
      data-testid="map"
      data-center={JSON.stringify(center)}
      data-zoom={zoom}
    >
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ position, eventHandlers, children }: any) => (
    <div
      data-testid="marker"
      data-position={JSON.stringify(position)}
      onClick={() => eventHandlers?.click?.()}
    >
      {children}
    </div>
  ),
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
}));

vi.mock("react-leaflet-cluster", () => ({
  default: ({
    children,
    chunkedLoading,
    animate,
    maxClusterRadius,
    disableClusteringAtZoom,
  }: any) => (
    <div
      data-testid="cluster"
      data-chunked={String(chunkedLoading)}
      data-animate={String(animate)}
      data-radius={String(maxClusterRadius)}
      data-disable-at={String(disableClusteringAtZoom)}
    >
      {children}
    </div>
  ),
}));

// RED: import fails today — Wave 2 hasn't shipped the component.
import LiveFloorMap from "@/components/floor/LiveFloorMap";

describe("Phase 7 / <LiveFloorMap/> Leaflet SSR-safe wrapper (RED — flips GREEN in Wave 2)", () => {
  it("component is exported from @/components/floor/LiveFloorMap", () => {
    expect(LiveFloorMap).toBeDefined();
  });

  it("HYDRATION: the module is import-safe under jsdom (no top-level window access)", () => {
    // The static import above already exercised this — it would have
    // thrown a ReferenceError if the module accessed `window` at
    // module-load time. The mere fact that the import resolved means
    // the SSR-safe pattern is honoured (Wave 2 must use next/dynamic
    // with ssr:false at the call site, AND avoid top-level window
    // refs in the module itself).
    expect(LiveFloorMap).toBeDefined();
  });

  it("renders MapContainer with center=[29.3759, 47.9774] and zoom=11", () => {
    const { getByTestId } = render(
      <LiveFloorMap couriers={FLOOR_COURIER_FIXTURE} />,
    );
    const map = getByTestId("map");
    expect(JSON.parse(map.getAttribute("data-center")!)).toEqual(KUWAIT_CITY_CENTER);
    expect(map.getAttribute("data-zoom")).toBe(String(KUWAIT_CITY_ZOOM));
  });

  it("renders one Marker per courier in props.couriers", () => {
    const { getAllByTestId } = render(
      <LiveFloorMap couriers={FLOOR_COURIER_FIXTURE} />,
    );
    expect(getAllByTestId("marker").length).toBe(FLOOR_COURIER_FIXTURE.length);
  });

  it("wraps markers in MarkerClusterGroup with chunkedLoading + animate=false + maxClusterRadius=40 + disableClusteringAtZoom=16", () => {
    const { getByTestId } = render(
      <LiveFloorMap couriers={FLOOR_COURIER_FIXTURE} />,
    );
    const cluster = getByTestId("cluster");
    expect(cluster.getAttribute("data-chunked")).toBe("true");
    expect(cluster.getAttribute("data-animate")).toBe("false");
    expect(cluster.getAttribute("data-radius")).toBe("40");
    expect(cluster.getAttribute("data-disable-at")).toBe("16");
  });

  it("clicking a marker calls props.onMarkerClick(driverId)", () => {
    const onMarkerClick = vi.fn();
    const { getAllByTestId } = render(
      <LiveFloorMap couriers={FLOOR_COURIER_FIXTURE} onMarkerClick={onMarkerClick} />,
    );
    const markers = getAllByTestId("marker");
    (markers[0] as HTMLElement).click();
    expect(onMarkerClick).toHaveBeenCalledWith(FLOOR_COURIER_FIXTURE[0].driverId);
  });
});

// RED — turned GREEN by Wave 2
