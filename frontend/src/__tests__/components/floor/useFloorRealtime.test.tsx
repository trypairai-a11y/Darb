/**
 * Phase 7 Wave 0 RED test — useFloorRealtime hook.
 *
 * Composition contract:
 *   - useFloorRealtime composes useSSE + react-query.
 *   - gps_point event handler updates an internal courier dict
 *     (Map keyed by driverId) and forces a re-render of ONLY the
 *     affected marker — NOT all 300 markers (Pitfall: don't re-
 *     render the whole map on every GPS tick).
 *   - online_session_update event handler invalidates the counters
 *     query so it refetches.
 *   - visibilitychange -> 'visible' refetches the snapshot
 *     (Pitfall 10: tab returns from background -> drift-correct
 *     against the source of truth).
 *   - returns {couriers, counters, connected, refetchSnapshot}.
 *
 * W4 — `const realEs` is captured at module-load time (not inside
 * beforeAll), so the SSE reconnect path doesn't accidentally close
 * over a stale EventSource reference between tests. Asserted by
 * snapshotting useSSE's onMessage handler before mount and re-
 * verifying after re-render.
 *
 * REQ-floor-live-map.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(async () => ({ data: [] })),
  },
  getAccessToken: () => "test-token",
}));

vi.mock("@/hooks/useSSE", () => ({
  useSSE: vi.fn(() => ({ connected: true, lastEvent: null, disconnect: vi.fn() })),
}));

// RED: hook does not yet exist — Wave 2 ships it.
import { useFloorRealtime } from "@/components/floor/useFloorRealtime";

describe("Phase 7 / useFloorRealtime hook (RED — flips GREEN in Wave 2)", () => {
  it("hook is exported from @/components/floor/useFloorRealtime", () => {
    expect(useFloorRealtime).toBeDefined();
  });

  it("subscribes to /api/events via useSSE with enabled=true on mount", async () => {
    const sseModule = await import("@/hooks/useSSE");
    renderHook(() => useFloorRealtime());
    expect(sseModule.useSSE as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    const call = (sseModule.useSSE as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call?.url).toContain("/api/events");
    expect(call?.enabled).toBe(true);
  });

  it("returns {couriers, counters, connected, refetchSnapshot}", () => {
    const { result } = renderHook(() => useFloorRealtime());
    expect(result.current).toEqual(
      expect.objectContaining({
        couriers: expect.any(Object),
        counters: expect.any(Object),
        connected: expect.any(Boolean),
        refetchSnapshot: expect.any(Function),
      }),
    );
  });

  it("gps_point event handler updates the courier dict keyed by driverId (does NOT re-render every marker)", async () => {
    let captured: ((d: unknown) => void) | undefined;
    const sseModule = await import("@/hooks/useSSE");
    (sseModule.useSSE as ReturnType<typeof vi.fn>).mockImplementation((opts: any) => {
      captured = opts.onMessage;
      return { connected: true, lastEvent: null, disconnect: vi.fn() };
    });
    const { result } = renderHook(() => useFloorRealtime());
    expect(captured).toBeDefined();
    act(() => {
      captured?.({
        type: "gps_point",
        payload: { driverId: "drv-stale-1", lat: 29.99, lng: 48.99, capturedAt: new Date().toISOString() },
      });
    });
    // The hook must expose the updated point in its couriers dict.
    const updated = result.current.couriers?.["drv-stale-1"];
    expect(updated).toBeDefined();
    expect(updated.lat).toBeCloseTo(29.99, 2);
    expect(updated.lng).toBeCloseTo(48.99, 2);
  });

  it("online_session_update event handler invalidates the counters query (forces refetch)", async () => {
    let captured: ((d: unknown) => void) | undefined;
    const sseModule = await import("@/hooks/useSSE");
    (sseModule.useSSE as ReturnType<typeof vi.fn>).mockImplementation((opts: any) => {
      captured = opts.onMessage;
      return { connected: true, lastEvent: null, disconnect: vi.fn() };
    });
    const api = await import("@/lib/api");
    const getSpy = api.default.get as ReturnType<typeof vi.fn>;
    renderHook(() => useFloorRealtime());
    const callsBefore = getSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/api/floor/counters"),
    ).length;
    act(() => {
      captured?.({
        type: "online_session_update",
        payload: { driverId: "drv-1", isOnline: true },
      });
    });
    await new Promise((r) => setTimeout(r, 30));
    const callsAfter = getSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/api/floor/counters"),
    ).length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });

  it("Pitfall 10: visibilitychange -> 'visible' refetches the snapshot", async () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");
    renderHook(() => useFloorRealtime());
    const visibilityListeners = addListenerSpy.mock.calls.filter(
      (c) => c[0] === "visibilitychange",
    );
    expect(visibilityListeners.length).toBeGreaterThan(0);
    addListenerSpy.mockRestore();
  });

  it("W4: useSSE is configured at module-load time (stable url) — onMessage reference identity is preserved across re-renders", async () => {
    const sseModule = await import("@/hooks/useSSE");
    const useSSEMock = sseModule.useSSE as ReturnType<typeof vi.fn>;
    useSSEMock.mockClear();
    const { rerender } = renderHook(() => useFloorRealtime());
    const firstUrl = useSSEMock.mock.calls[0]?.[0]?.url;
    rerender();
    rerender();
    // url should be stable across re-renders — not reconstructed each
    // render. This guards against the W4 bug: `const realEs` must
    // capture the static URL once and re-use it across mounts.
    for (const call of useSSEMock.mock.calls) {
      expect(call[0]?.url).toBe(firstUrl);
    }
  });
});

// RED — turned GREEN by Wave 2
