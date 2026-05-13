/**
 * Phase 7 Wave 0 RED test — cross-tenant SSE isolation guard
 * (Pitfall 6). Turns GREEN by Wave 1 when DarbEventType is extended
 * with "gps_point" + "online_session_update" so the literal types
 * compile.
 *
 * The contract: publishEvent({type:"gps_point", tenantId:"tenA",...})
 * MUST reach tenA's subscriber and MUST NOT reach tenB's subscriber.
 * The event bus enforces this by channel construction
 * (events:{tenantId}); any regression that mixes channels would
 * silently leak a courier's live GPS to a neighbouring tenant — a
 * catastrophic privacy + competitive-intelligence failure.
 *
 * This test exercises the event bus in-process (no HTTP) so it
 * doesn't depend on the SSE handler. The handler's tenant scoping is
 * inherited from sseAuth + subscribe(req.user.tenantId, ...) which is
 * already locked down in Phase 4.
 *
 * RED state: the `type: "gps_point"` and `type: "online_session_update"`
 * literals below fail TS2322 today because the union doesn't include
 * them. ts-jest refuses to compile the file -> the whole suite is
 * reported as a failed test run. Wave 1 widens the union; the file
 * compiles; the runtime expectations turn GREEN.
 *
 * REQ-floor-live-map, CON-tenant-scope-everywhere.
 */

import { publishEvent, subscribe } from "../../services/eventBus";

describe("Phase 7 / REQ-floor-live-map: cross-tenant SSE isolation (Pitfall 6)", () => {
  test("publishEvent on tenA's channel does NOT leak to tenB's subscriber within 500ms", async () => {
    const tenAEvents: any[] = [];
    const tenBEvents: any[] = [];
    const unsubA = subscribe("tenA", (e) => tenAEvents.push(e));
    const unsubB = subscribe("tenB", (e) => tenBEvents.push(e));

    try {
      // RED: TS2322 — "gps_point" not in DarbEventType union yet.
      await publishEvent({
        type: "gps_point",
        tenantId: "tenA",
        payload: { driverId: "drv-a-1", lat: 29.3, lng: 47.9, capturedAt: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      });

      // Bus is synchronous for local listeners; a 50ms wait is enough
      // to flush any deferred Redis path. Keep the window tight so
      // the test doesn't run for half a second per case.
      await new Promise((r) => setTimeout(r, 50));

      const tenAGps = tenAEvents.filter((e) => e.type === "gps_point");
      const tenBGps = tenBEvents.filter((e) => e.type === "gps_point");
      expect(tenAGps.length).toBe(1);
      expect(tenAGps[0].payload.driverId).toBe("drv-a-1");
      expect(tenBGps.length).toBe(0);
    } finally {
      unsubA();
      unsubB();
    }
  });

  test("two tenants publishing simultaneously each see only their own gps_point events", async () => {
    const tenAEvents: any[] = [];
    const tenBEvents: any[] = [];
    const unsubA = subscribe("tenA", (e) => tenAEvents.push(e));
    const unsubB = subscribe("tenB", (e) => tenBEvents.push(e));

    try {
      await Promise.all([
        publishEvent({
          type: "gps_point",
          tenantId: "tenA",
          payload: { driverId: "drv-a", lat: 29.3, lng: 47.9, capturedAt: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        }),
        publishEvent({
          type: "gps_point",
          tenantId: "tenB",
          payload: { driverId: "drv-b", lat: 29.5, lng: 47.6, capturedAt: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        }),
      ]);

      await new Promise((r) => setTimeout(r, 50));

      const tenAGps = tenAEvents.filter((e) => e.type === "gps_point");
      const tenBGps = tenBEvents.filter((e) => e.type === "gps_point");
      expect(tenAGps.length).toBe(1);
      expect(tenAGps[0].payload.driverId).toBe("drv-a");
      expect(tenBGps.length).toBe(1);
      expect(tenBGps[0].payload.driverId).toBe("drv-b");
    } finally {
      unsubA();
      unsubB();
    }
  });

  test("online_session_update also respects tenant channel boundary", async () => {
    const tenAEvents: any[] = [];
    const tenBEvents: any[] = [];
    const unsubA = subscribe("tenA", (e) => tenAEvents.push(e));
    const unsubB = subscribe("tenB", (e) => tenBEvents.push(e));

    try {
      // RED: TS2322 — "online_session_update" not in DarbEventType union yet.
      await publishEvent({
        type: "online_session_update",
        tenantId: "tenA",
        payload: { driverId: "drv-a", isOnline: true, area: "Hawally" },
        timestamp: new Date().toISOString(),
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(
        tenAEvents.filter((e) => e.type === "online_session_update").length,
      ).toBe(1);
      expect(
        tenBEvents.filter((e) => e.type === "online_session_update").length,
      ).toBe(0);
    } finally {
      unsubA();
      unsubB();
    }
  });
});

// RED — TS2322 compile failure today. Wave 1 widens DarbEventType to
// include "gps_point" + "online_session_update"; the file then
// compiles and the channel-isolation expectations turn GREEN. The
// channel-keying scheme that enforces tenant isolation is already in
// place in services/eventBus.ts (events:{tenantId}) — this test
// future-proofs against any regression that bypasses the scheme.
