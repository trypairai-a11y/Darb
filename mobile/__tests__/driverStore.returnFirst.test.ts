/**
 * Client note (2026-10-05), answering 2026-09-21: "the driver must return the
 * order to the vendor, after that he can report that the delivery failed".
 *
 * The server keeps the order in flight while the driver carries it back and
 * says so with status RETURNING on /state. The app must resume the return
 * leg from that (and from FAILED, which older builds left behind), and a
 * relaunched app must land on the milestone the server reports rather than
 * restarting the trip at "heading to pickup".
 */

import { serverStage, useDriverStore } from "../src/store/driverStore";

const NOW_ISO = () => new Date().toISOString();

beforeEach(() => {
  useDriverStore.getState().reset();
});

describe("serverStage", () => {
  test("RETURNING and FAILED both resume the return leg", () => {
    expect(serverStage({ id: "o", status: "RETURNING" })).toBe("RETURNING");
    expect(serverStage({ id: "o", status: "FAILED" })).toBe("RETURNING");
  });

  test("the return leg outranks a remembered delivery milestone", () => {
    expect(serverStage({ id: "o", status: "RETURNING", stage: "ARRIVED_AT_DROPOFF" })).toBe("RETURNING");
  });

  test("granular milestones sent in `status` are kept, not reset to heading to pickup", () => {
    expect(serverStage({ id: "o", status: "ARRIVED_AT_PICKUP" })).toBe("ARRIVED_AT_PICKUP");
    expect(serverStage({ id: "o", status: "ARRIVED_AT_DROPOFF" })).toBe("ARRIVED_AT_DROPOFF");
    expect(serverStage({ id: "o", status: "ARRIVED" })).toBe("ARRIVED_AT_PICKUP");
    expect(serverStage({ id: "o", status: "ASSIGNED" })).toBe("HEADING_TO_PICKUP");
  });
});

describe("hydrate on the return leg", () => {
  test("a relaunched app with an order on its way back opens the return leg", () => {
    useDriverStore.getState().hydrate({
      availability: "BUSY",
      activeOrder: { id: "ord1", status: "RETURNING", failureReported: false },
      serverTime: NOW_ISO(),
    });
    const order = useDriverStore.getState().activeOrder;
    expect(order?.stage).toBe("RETURNING");
    expect(order?.failureReported).toBe(false);
  });

  test("a stale poll still saying PICKED_UP never pulls the driver off the return leg", () => {
    useDriverStore.getState().hydrate({
      availability: "BUSY",
      activeOrder: { id: "ord1", status: "PICKED_UP" },
      serverTime: NOW_ISO(),
    });
    useDriverStore.getState().advanceOrder("RETURNING");
    useDriverStore.getState().hydrate({
      availability: "BUSY",
      activeOrder: { id: "ord1", status: "ARRIVED_AT_DROPOFF" },
      serverTime: NOW_ISO(),
    });
    expect(useDriverStore.getState().activeOrder?.stage).toBe("RETURNING");
  });
});
