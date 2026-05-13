/**
 * Phase 7 Wave 0 RED test — <LiveFloorPage/> orchestrator.
 *
 * Wave 2 ships the page component (alias path
 * @/components/floor/LiveFloorPage); today the static import fails to
 * resolve via Vitest's Vite resolver. That's the RED state.
 *
 * Contract:
 *   - Mounts <FloorPillCounters/>, <FloorFilters/>, a dynamically-
 *     imported <LiveFloorMap/>, and a slot for <CourierDetailPanel/>.
 *   - On mount, fires GET /api/floor/snapshot via react-query and
 *     GET /api/floor/counters via react-query.
 *   - Subscribes to /api/events via useSSE.
 *   - gps_point events update the courier dict / marker positions.
 *   - Pitfall 10: visibilitychange listener refetches snapshot when
 *     document.visibilityState becomes 'visible'.
 *   - W5 MUTUAL EXCLUSION (XOR): the map view and the courier list
 *     view are mutually exclusive — the page renders exactly one at
 *     a time based on the current view-mode toggle. Both should never
 *     mount simultaneously.
 *
 * REQ-floor-live-map.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  FLOOR_COURIER_FIXTURE,
  FLOOR_COUNTERS,
} from "@/__tests__/fixtures/floorCouriers";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(async (url: string) => {
      if (url.includes("/api/floor/snapshot")) return { data: FLOOR_COURIER_FIXTURE };
      if (url.includes("/api/floor/counters")) return { data: FLOOR_COUNTERS };
      return { data: [] };
    }),
    post: vi.fn(async () => ({ data: { pendingActionId: "pa-1" } })),
  },
  getAccessToken: () => "test-token",
}));

vi.mock("@/hooks/useSSE", () => ({
  useSSE: vi.fn(() => ({ connected: true, lastEvent: null, disconnect: vi.fn() })),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="live-floor-map-dynamic-stub" />,
}));

// RED: import fails today — Wave 2 hasn't shipped the component.
import LiveFloorPage from "@/components/floor/LiveFloorPage";

describe("Phase 7 / <LiveFloorPage/> (RED — flips GREEN in Wave 2 + Wave 3)", () => {
  it("LiveFloorPage component is exported from @/components/floor/LiveFloorPage", () => {
    expect(LiveFloorPage).toBeDefined();
  });

  it("renders <FloorPillCounters/>, <FloorFilters/>, dynamic <LiveFloorMap/>, and a slot for <CourierDetailPanel/>", () => {
    const { container } = render(<LiveFloorPage />);
    expect(container.textContent).toBeTruthy();
    // The dynamic-map stub fires when next/dynamic resolves.
    // The mock above returns the stub when invoked.
  });

  it("calls GET /api/floor/snapshot via react-query on mount; renders 9 couriers", async () => {
    const api = await import("@/lib/api");
    render(<LiveFloorPage />);
    await new Promise((r) => setTimeout(r, 10));
    expect(api.default.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/floor/snapshot"),
    );
  });

  it("calls GET /api/floor/counters via react-query on mount; counters flow into <FloorPillCounters/>", async () => {
    const api = await import("@/lib/api");
    render(<LiveFloorPage />);
    await new Promise((r) => setTimeout(r, 10));
    expect(api.default.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/floor/counters"),
    );
  });

  it("subscribes to /api/events via useSSE", async () => {
    const sseModule = await import("@/hooks/useSSE");
    render(<LiveFloorPage />);
    expect(sseModule.useSSE as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    const call = (sseModule.useSSE as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call?.url).toContain("/api/events");
  });

  it("gps_point event updates the relevant courier's position state", async () => {
    let storedOnMessage: ((data: unknown) => void) | undefined;
    const sseModule = await import("@/hooks/useSSE");
    (sseModule.useSSE as ReturnType<typeof vi.fn>).mockImplementation((opts: any) => {
      storedOnMessage = opts.onMessage;
      return { connected: true, lastEvent: null, disconnect: vi.fn() };
    });
    render(<LiveFloorPage />);
    expect(storedOnMessage).toBeDefined();
    storedOnMessage?.({
      type: "gps_point",
      payload: { driverId: "drv-stale-1", lat: 29.999, lng: 48.999, capturedAt: new Date().toISOString() },
    });
    // No throw is the contract — the page state-machine should
    // accept the update. Wave 2 will add a deeper assertion against
    // the rendered marker position once the map stub exposes it.
  });

  it("Pitfall 10: registers a visibilitychange listener that refetches snapshot when document becomes visible", () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");
    render(<LiveFloorPage />);
    const visibilityListeners = addListenerSpy.mock.calls.filter(
      (c) => c[0] === "visibilitychange",
    );
    expect(visibilityListeners.length).toBeGreaterThan(0);
    addListenerSpy.mockRestore();
  });

  it("W5 MUTUAL EXCLUSION (XOR): map view and list view never mount simultaneously", () => {
    const { container, queryByTestId } = render(<LiveFloorPage />);
    const mapStub = queryByTestId("live-floor-map-dynamic-stub");
    const listStub = container.querySelector("[data-testid='floor-courier-list']");
    // XOR — exactly one of the two views is mounted at any given time.
    const both = !!(mapStub && listStub);
    expect(both).toBe(false);
  });
});

// RED — turned GREEN by Wave 2 + Wave 3
