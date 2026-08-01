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

import { publishEvent, subscribe, DarbEvent } from "../../services/eventBus";
import { eventVisibleTo } from "../../routes/events";

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

// ─── Darb 2.0 §A7 — vendor SSE scoping ──────────────────────────────────────
// VENDOR connections share the tenant channel with staff, so channel keying
// alone is not enough: routes/events.ts filters per-connection with
// eventVisibleTo. Vendors must see ONLY order.* events for their own
// vendorId; staff behavior is unchanged (full tenant firehose).

describe("Darb 2.0 §A7: vendor SSE event scoping (eventVisibleTo)", () => {
  const t = new Date().toISOString();
  const mkEvent = (type: DarbEvent["type"], payload: Record<string, unknown>): DarbEvent => ({
    type,
    tenantId: "tenA",
    payload,
    timestamp: t,
  });

  const vendorUser = { role: "VENDOR", vendorId: "vend-1" };
  const staffUser = { role: "SUPERVISOR", vendorId: undefined };

  test("vendor sees order.* events carrying its own vendorId", () => {
    expect(eventVisibleTo(vendorUser, mkEvent("order.created", { vendorId: "vend-1", orderId: "o1" }))).toBe(true);
    expect(eventVisibleTo(vendorUser, mkEvent("order.delivered", { vendorId: "vend-1", orderId: "o1" }))).toBe(true);
  });

  test("vendor does NOT see another vendor's order events", () => {
    expect(eventVisibleTo(vendorUser, mkEvent("order.created", { vendorId: "vend-2", orderId: "o2" }))).toBe(false);
  });

  test("vendor does NOT see order events with no vendorId in the payload", () => {
    expect(eventVisibleTo(vendorUser, mkEvent("order.created", { orderId: "o3" }))).toBe(false);
  });

  test("vendor does NOT see non-order events (driver GPS, offers, wallet, SOS)", () => {
    expect(eventVisibleTo(vendorUser, mkEvent("driver.location", { driverId: "d1", vendorId: "vend-1" }))).toBe(false);
    expect(eventVisibleTo(vendorUser, mkEvent("offer.sent", { vendorId: "vend-1" }))).toBe(false);
    expect(eventVisibleTo(vendorUser, mkEvent("wallet.reconciliation_failed", { vendorId: "vend-1" }))).toBe(false);
    expect(eventVisibleTo(vendorUser, mkEvent("sos.raised", { driverId: "d1" }))).toBe(false);
  });

  test("vendor token without vendorId fails closed (sees nothing)", () => {
    const malformed = { role: "VENDOR", vendorId: undefined };
    expect(eventVisibleTo(malformed, mkEvent("order.created", { vendorId: "vend-1" }))).toBe(false);
  });

  test("staff roles receive the full tenant firehose, unchanged", () => {
    for (const role of ["ADMIN", "OPS_MANAGER", "SUPERVISOR", "ACCOUNTANT", "VIEWER"]) {
      const user = { role, vendorId: undefined };
      expect(eventVisibleTo(user, mkEvent("order.created", { vendorId: "vend-1" }))).toBe(true);
      expect(eventVisibleTo(user, mkEvent("driver.location", { driverId: "d1" }))).toBe(true);
      expect(eventVisibleTo(user, mkEvent("sos.raised", { driverId: "d1" }))).toBe(true);
    }
    expect(eventVisibleTo(staffUser, mkEvent("offer.expired", {}))).toBe(true);
  });

  // ─── Fleet and cash-desk scoping ─────────────────────────────────────────
  //
  // These roles used to fall through `role !== "VENDOR" → true` and receive the
  // entire tenant firehose. For a delivery company that meant every merchant's
  // orders and fees, the money events, and driver.location for the drivers of
  // the fleets it competes with.

  const fleetUser = { role: "FLEET", vendorId: undefined };
  const ownDrivers = { driverIds: new Set(["d-mine-1", "d-mine-2"]) };

  test("a fleet sees its own drivers and nobody else's", () => {
    expect(
      eventVisibleTo(fleetUser, mkEvent("driver.location", { driverId: "d-mine-1" }), ownDrivers),
    ).toBe(true);
    expect(
      eventVisibleTo(fleetUser, mkEvent("driver.location", { driverId: "d-rival" }), ownDrivers),
    ).toBe(false);
  });

  test("a fleet sees an order only through its own driver, never the merchant's", () => {
    expect(
      eventVisibleTo(fleetUser, mkEvent("order.delivered", { driverId: "d-mine-2", vendorId: "vend-1" }), ownDrivers),
    ).toBe(true);
    // The same order before it is assigned carries no driver of theirs.
    expect(
      eventVisibleTo(fleetUser, mkEvent("order.created", { vendorId: "vend-1" }), ownDrivers),
    ).toBe(false);
  });

  test("a fleet never sees money, incidents or SOS", () => {
    const noisy = ["remittance.recorded", "wallet.reconciliation_failed", "incident.updated", "sos.raised"] as const;
    for (const type of noisy) {
      expect(eventVisibleTo(fleetUser, mkEvent(type, { driverId: "d-mine-1" }), ownDrivers)).toBe(false);
    }
  });

  test("a fleet connection with no resolved drivers sees nothing", () => {
    expect(
      eventVisibleTo(fleetUser, mkEvent("driver.location", { driverId: "d-mine-1" })),
    ).toBe(false);
  });

  test("the cash desk sees hand-ins and nothing else", () => {
    const collector = { role: "CASH_COLLECTOR", vendorId: undefined };
    expect(eventVisibleTo(collector, mkEvent("remittance.recorded", { driverId: "d1" }))).toBe(true);
    expect(eventVisibleTo(collector, mkEvent("driver.location", { driverId: "d1" }))).toBe(false);
    expect(eventVisibleTo(collector, mkEvent("order.created", { vendorId: "vend-1" }))).toBe(false);
  });

  test("a role this function does not know sees nothing", () => {
    expect(
      eventVisibleTo({ role: "SOMETHING_NEW" as any, vendorId: undefined }, mkEvent("order.created", {})),
    ).toBe(false);
  });
});
