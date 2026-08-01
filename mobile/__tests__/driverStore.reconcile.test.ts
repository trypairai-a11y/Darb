/**
 * driverStore — server-truth hydrate reconciliation + optimistic availability
 * with rollback.
 *
 * Contract (plan §Slice C):
 *   - hydrate adopts server state (server-ahead order stages ADOPT)
 *   - locally-optimistic stage advances are PRESERVED when ahead of the server
 *     (their outbox event may not have landed yet)
 *   - setAvailability is optimistic; a 409 rolls back and surfaces the reason
 */

import { useDriverStore, stageIndex, nextStage, STAGE_ORDER } from "../src/store/driverStore";
import { __mockApi as mockApi, ApiError } from "./mocks/api-client";

const NOW_ISO = () => new Date().toISOString();

beforeEach(() => {
  useDriverStore.getState().reset();
});

describe("hydrate — basic adoption", () => {
  test("adopts availability, wallet, supervisor phone, and computes clock skew", () => {
    const serverTime = new Date(Date.now() + 5_000).toISOString(); // server 5s ahead
    useDriverStore.getState().hydrate({
      driver: { id: "drv1", name: "Qadir" },
      availability: "ONLINE",
      wallet: { cashOnHandKwd: "12.500", ceilingKwd: "100.000", todayCollectedKwd: "12.500" },
      supervisorPhone: "+96550000000",
      serverTime,
    });

    const s = useDriverStore.getState();
    expect(s.availability).toBe("ONLINE");
    expect(s.driver?.name).toBe("Qadir");
    expect(s.supervisorPhone).toBe("+96550000000");
    expect(s.wallet?.cashOnHandKwd).toBe("12.500");
    expect(s.clockSkewMs).toBeGreaterThan(4_000);
    expect(s.clockSkewMs).toBeLessThan(6_000);
    expect(s.hydrated).toBe(true);
  });

  test("lockout normalizes from wallet.blocked when no explicit lockout object", () => {
    useDriverStore.getState().hydrate({
      availability: "ONLINE",
      wallet: { cashOnHandKwd: 120, ceilingKwd: 100, blocked: true },
      serverTime: NOW_ISO(),
    });
    expect(useDriverStore.getState().lockout).toEqual({
      active: true,
      reason: "CASH_CEILING_LOCKOUT",
    });
  });
});

describe("hydrate — order stage reconciliation", () => {
  test("server-ahead stage is ADOPTED", () => {
    useDriverStore.setState({
      activeOrder: { id: "ord1", status: "ASSIGNED", stage: "HEADING_TO_PICKUP" } as any,
    });
    useDriverStore.getState().hydrate({
      availability: "BUSY",
      activeOrder: { id: "ord1", status: "PICKED_UP", stage: "HEADING_TO_DROPOFF" },
      serverTime: NOW_ISO(),
    });
    // Four steps now: the server's HEADING_TO_DROPOFF folds into PICKED_UP,
    // which is the milestone the server's own FSM turns on.
    expect(useDriverStore.getState().activeOrder?.stage).toBe("PICKED_UP");
  });

  test("locally-optimistic stage AHEAD of the server is PRESERVED", () => {
    useDriverStore.setState({
      activeOrder: { id: "ord1", status: "PICKED_UP", stage: "ARRIVED_AT_DROPOFF" } as any,
      pendingEventCount: 1, // milestone event still in the outbox
    });
    useDriverStore.getState().hydrate({
      availability: "BUSY",
      // Server has only seen PICKED_UP → maps to HEADING_TO_DROPOFF
      activeOrder: { id: "ord1", status: "PICKED_UP" },
      serverTime: NOW_ISO(),
    });
    expect(useDriverStore.getState().activeOrder?.stage).toBe("ARRIVED_AT_DROPOFF");
  });

  test("coarse-only server status maps: ASSIGNED → HEADING_TO_PICKUP", () => {
    useDriverStore.getState().hydrate({
      availability: "BUSY",
      activeOrder: { id: "ord2", status: "ASSIGNED" },
      serverTime: NOW_ISO(),
    });
    expect(useDriverStore.getState().activeOrder?.stage).toBe("HEADING_TO_PICKUP");
  });

  test("server order-gone clears the local order when nothing is pending", () => {
    useDriverStore.setState({
      activeOrder: { id: "ord1", status: "ASSIGNED", stage: "HEADING_TO_PICKUP" } as any,
      pendingEventCount: 0,
    });
    useDriverStore.getState().hydrate({ availability: "ONLINE", serverTime: NOW_ISO() });
    expect(useDriverStore.getState().activeOrder).toBeNull();
  });

  test("server order-gone KEEPS the local order while outbox events are pending", () => {
    useDriverStore.setState({
      activeOrder: { id: "ord1", status: "PICKED_UP", stage: "ARRIVED_AT_DROPOFF" } as any,
      pendingEventCount: 2,
    });
    useDriverStore.getState().hydrate({ availability: "ONLINE", serverTime: NOW_ISO() });
    expect(useDriverStore.getState().activeOrder?.id).toBe("ord1");
  });

  test("advanceOrder never regresses", () => {
    useDriverStore.setState({
      activeOrder: { id: "ord1", status: "PICKED_UP", stage: "HEADING_TO_DROPOFF" } as any,
    });
    // A stage this build dropped must still rank as PICKED_UP, or the guard
    // reads it as -1 and lets the order walk backwards on a driver who was
    // mid-delivery when the app updated.
    useDriverStore.getState().advanceOrder("ARRIVED_AT_PICKUP"); // earlier stage
    expect(useDriverStore.getState().activeOrder?.stage).toBe("HEADING_TO_DROPOFF");
    useDriverStore.getState().advanceOrder("ARRIVED_AT_DROPOFF"); // later stage
    expect(useDriverStore.getState().activeOrder?.stage).toBe("ARRIVED_AT_DROPOFF");
  });
});

describe("the removed stage (client request, 2026-08-01)", () => {
  test("a driver mid-delivery on the old build does not walk backwards", () => {
    // HEADING_TO_DROPOFF left STAGE_ORDER but survives in a persisted store.
    // If it resolved to -1 the monotonic guard would treat EVERY stage as
    // progress, and the step list would show the driver back at the restaurant.
    useDriverStore.setState({
      activeOrder: { id: "ord1", status: "PICKED_UP", stage: "HEADING_TO_DROPOFF" } as any,
    });
    useDriverStore.getState().advanceOrder("HEADING_TO_PICKUP");
    expect(useDriverStore.getState().activeOrder?.stage).toBe("HEADING_TO_DROPOFF");
  });

  test("the server echoing the removed stage lands on a step that exists", () => {
    useDriverStore.setState({
      activeOrder: { id: "ord1", status: "ASSIGNED", stage: "HEADING_TO_PICKUP" } as any,
    });
    useDriverStore.getState().hydrate({
      availability: "BUSY",
      activeOrder: { id: "ord1", status: "PICKED_UP", stage: "HEADING_TO_DROPOFF" },
      serverTime: NOW_ISO(),
    });
    const stage = useDriverStore.getState().activeOrder?.stage;
    expect(stage).toBe("PICKED_UP");
    expect(STAGE_ORDER).toContain(stage);
  });
});

describe("hydrate — offers", () => {
  test("offerReceived is idempotent by offerId (object identity preserved)", () => {
    const offer = { id: "off1", restaurantName: "Shawarma House", feeKwd: 1.25, expiresAt: NOW_ISO() };
    useDriverStore.getState().offerReceived(offer as any);
    const first = useDriverStore.getState().activeOffer;
    useDriverStore.getState().offerReceived({ ...offer } as any); // same id, new object
    expect(useDriverStore.getState().activeOffer).toBe(first);
  });

  test("an active order supersedes any incoming offer", () => {
    useDriverStore.setState({
      activeOrder: { id: "ord1", status: "ASSIGNED", stage: "HEADING_TO_PICKUP" } as any,
    });
    useDriverStore.getState().hydrate({
      availability: "BUSY",
      activeOrder: { id: "ord1", status: "ASSIGNED" },
      activeOffer: { id: "off9", restaurantName: "X", feeKwd: 1, expiresAt: NOW_ISO() },
      serverTime: NOW_ISO(),
    });
    expect(useDriverStore.getState().activeOffer).toBeNull();
  });
});

describe("setAvailability — optimistic with rollback", () => {
  test("success: flips optimistically and stays", async () => {
    mockApi.postAvailability.mockResolvedValueOnce({ availability: "ONLINE" });
    const res = await useDriverStore.getState().setAvailability("ONLINE");
    expect(res.ok).toBe(true);
    expect(useDriverStore.getState().availability).toBe("ONLINE");
    expect(useDriverStore.getState().availabilitySync).toBe("idle");
  });

  test("409 CASH_CEILING_LOCKOUT: rolls back, surfaces reason, sets lockout, re-hydrates", async () => {
    mockApi.postAvailability.mockRejectedValueOnce(
      new ApiError(409, { error: "Cash over ceiling", code: "CASH_CEILING_LOCKOUT" }),
    );
    mockApi.getState.mockResolvedValueOnce({
      availability: "OFFLINE",
      lockout: { active: true, reason: "CASH_CEILING_LOCKOUT" },
      serverTime: NOW_ISO(),
    });

    const res = await useDriverStore.getState().setAvailability("ONLINE");

    expect(res).toEqual({ ok: false, reason: "CASH_CEILING_LOCKOUT" });
    const s = useDriverStore.getState();
    expect(s.availability).toBe("OFFLINE"); // rolled back
    expect(s.availabilitySync).toBe("error");
    expect(s.lastAvailabilityError).toBe("CASH_CEILING_LOCKOUT");
    expect(s.lockout.active).toBe(true);
    expect(mockApi.getState).toHaveBeenCalled(); // server truth after 409
  });

  test("network failure: rolls back and marks the connectivity heuristic offline", async () => {
    mockApi.postAvailability.mockRejectedValueOnce(new Error("fetch failed"));
    const res = await useDriverStore.getState().setAvailability("ONLINE");
    expect(res.ok).toBe(false);
    expect(useDriverStore.getState().availability).toBe("OFFLINE");
    expect(useDriverStore.getState().online).toBe(false);
  });

  test("in-flight local flip is not clobbered by a concurrent hydrate", async () => {
    let resolvePost!: () => void;
    mockApi.postAvailability.mockImplementationOnce(
      () => new Promise<any>((resolve) => { resolvePost = () => resolve({}); }),
    );
    const p = useDriverStore.getState().setAvailability("ONLINE");
    // A stale poll lands mid-flight claiming OFFLINE:
    useDriverStore.getState().hydrate({ availability: "OFFLINE", serverTime: NOW_ISO() });
    expect(useDriverStore.getState().availability).toBe("ONLINE"); // preserved
    resolvePost();
    await p;
    expect(useDriverStore.getState().availability).toBe("ONLINE");
  });
});

describe("stage helpers", () => {
  test("stageIndex + nextStage walk the canonical order", () => {
    expect(stageIndex("HEADING_TO_PICKUP")).toBe(0);
    expect(nextStage("HEADING_TO_PICKUP")).toBe("ARRIVED_AT_PICKUP");
    expect(nextStage("ARRIVED_AT_DROPOFF")).toBeNull();
    expect(stageIndex(null)).toBe(-1);
  });
});
