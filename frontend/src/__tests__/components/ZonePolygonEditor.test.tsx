/**
 * Revision 4 (#6 follow-up) — the zone drawing tool must keep taking points
 * until the operator closes the shape.
 *
 * The first cut treated "3 or more vertices" as "this is a polygon now": at the
 * third click the preview flipped to a filled, closed triangle, the rubber band
 * to the cursor stopped, and a midpoint handle appeared on the closing edge
 * (clicking near it inserted-and-dragged instead of appending). Operators read
 * all of that as "it only gives me three pinpoints".
 *
 * Contract: the ring stays OPEN while drawing, whatever the vertex count. It
 * only closes when the operator says so (Close polygon, or clicking vertex #1),
 * or when an existing zone is opened for editing.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

type Handlers = Record<string, (e: any) => void>;
const captured: { handlers: Handlers } = { handlers: {} };

const fakeMap = {
  dragging: { enable: vi.fn(), disable: vi.fn() },
  doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
  getContainer: () => document.createElement("div"),
};

vi.mock("react-leaflet", () => ({
  useMapEvents: (handlers: Handlers) => {
    captured.handlers = handlers;
    return fakeMap;
  },
  Polygon: ({ positions }: any) => (
    <div data-testid="polygon" data-count={positions.length} />
  ),
  Polyline: ({ positions, pathOptions }: any) => (
    <div
      data-testid={pathOptions?.dashArray === "3 6" ? "rubber-band" : "polyline"}
      data-count={positions.length}
    />
  ),
  CircleMarker: ({ center, radius, eventHandlers }: any) => (
    <div
      data-testid={radius === 4 ? "midpoint" : "vertex"}
      data-center={JSON.stringify(center)}
      onClick={() => eventHandlers?.click?.({ originalEvent: new MouseEvent("click") })}
    />
  ),
}));

vi.mock("leaflet", () => ({
  default: {
    DomEvent: {
      stopPropagation: vi.fn(),
      disableClickPropagation: vi.fn(),
      disableScrollPropagation: vi.fn(),
    },
  },
}));

vi.mock("@/i18n/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import ZonePolygonEditor from "@/components/map/ZonePolygonEditor";

/** Click the map at a point, the way Leaflet delivers it. */
function clickMap(lat: number, lng: number) {
  act(() => {
    captured.handlers.click({
      latlng: { lat, lng },
      originalEvent: { target: document.createElement("div") },
    });
  });
}

function moveCursor(lat: number, lng: number) {
  act(() => {
    captured.handlers.mousemove({ latlng: { lat, lng } });
  });
}

describe("ZonePolygonEditor", () => {
  beforeEach(() => {
    captured.handlers = {};
    vi.clearAllMocks();
  });

  it("keeps the ring open past three points until the operator closes it", () => {
    const onComplete = vi.fn();
    render(<ZonePolygonEditor onComplete={onComplete} onCancel={vi.fn()} />);

    clickMap(29.3, 47.9);
    clickMap(29.31, 47.92);
    clickMap(29.32, 47.9);

    // Three points is enough to CLOSE, not proof the operator wants to.
    expect(screen.queryByTestId("polygon")).not.toBeInTheDocument();
    expect(screen.getByTestId("polyline")).toHaveAttribute("data-count", "3");
    expect(screen.getAllByTestId("vertex")).toHaveLength(3);
    // Two real edges, so two midpoint handles. No handle on the closing edge.
    expect(screen.getAllByTestId("midpoint")).toHaveLength(2);

    // And the tool still takes points.
    clickMap(29.33, 47.94);
    clickMap(29.34, 47.9);
    expect(screen.getAllByTestId("vertex")).toHaveLength(5);
    expect(screen.getByTestId("polyline")).toHaveAttribute("data-count", "5");
    expect(screen.getAllByTestId("midpoint")).toHaveLength(4);
  });

  it("keeps the rubber band following the cursor past three points", () => {
    render(<ZonePolygonEditor onComplete={vi.fn()} onCancel={vi.fn()} />);

    clickMap(29.3, 47.9);
    clickMap(29.31, 47.92);
    clickMap(29.32, 47.9);
    moveCursor(29.33, 47.95);

    expect(screen.getByTestId("rubber-band")).toBeInTheDocument();
  });

  it("emits a closed ring when the operator clicks Close polygon", () => {
    const onComplete = vi.fn();
    render(<ZonePolygonEditor onComplete={onComplete} onCancel={vi.fn()} />);

    clickMap(29.3, 47.9);
    clickMap(29.31, 47.92);
    clickMap(29.32, 47.9);
    clickMap(29.33, 47.94);

    fireEvent.click(screen.getByText("zonesPage.closePolygon"));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const ring = onComplete.mock.calls[0][0];
    expect(ring).toHaveLength(5); // 4 vertices + repeated first
    expect(ring[0]).toEqual([47.9, 29.3]); // GeoJSON order
    expect(ring[4]).toEqual(ring[0]);
  });

  it("closes when the operator clicks the first vertex", () => {
    const onComplete = vi.fn();
    render(<ZonePolygonEditor onComplete={onComplete} onCancel={vi.fn()} />);

    clickMap(29.3, 47.9);
    clickMap(29.31, 47.92);
    clickMap(29.32, 47.9);
    clickMap(29.33, 47.94);

    fireEvent.click(screen.getAllByTestId("vertex")[0]);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toHaveLength(5);
  });

  it("renders an existing zone as a closed polygon for editing", () => {
    render(
      <ZonePolygonEditor
        initialRing={[
          [29.3, 47.9],
          [29.31, 47.92],
          [29.32, 47.9],
        ]}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId("polygon")).toHaveAttribute("data-count", "3");
    expect(screen.queryByTestId("polyline")).not.toBeInTheDocument();
    // Closed shape: every edge gets a midpoint handle, including the last one.
    expect(screen.getAllByTestId("midpoint")).toHaveLength(3);
  });
});
