/**
 * eventOutbox — FIFO, idempotency, never-give-up, and 409-drop semantics.
 *
 * Mirrors the GPS outbox contract with one deliberate difference: business
 * events (ORDER_STATUS / POD / INCIDENT) retry FOREVER until 2xx or 409.
 */

import * as eventOutbox from "../src/services/eventOutbox";
import { __mockApi as mockApi, ApiError } from "./mocks/api-client";
import { useDriverStore } from "../src/store/driverStore";

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await eventOutbox._resetForTests();
  useDriverStore.getState().reset();
});

describe("idempotency", () => {
  test("INSERT OR IGNORE: same idempotency key twice → single row", async () => {
    await eventOutbox.enqueueOrderStatus("ord1", "ARRIVED_AT_PICKUP");
    await eventOutbox.enqueueOrderStatus("ord1", "ARRIVED_AT_PICKUP");
    const rows = await eventOutbox._allRowsForTests();
    expect(rows).toHaveLength(1);
    expect(rows[0].idempotencyKey).toBe("ord1:ARRIVED_AT_PICKUP");
  });

  test("pendingEventCount in the store tracks the table size", async () => {
    await eventOutbox.enqueueOrderStatus("ord1", "ARRIVED_AT_PICKUP");
    await eventOutbox.enqueueOrderStatus("ord1", "PICKED_UP");
    expect(useDriverStore.getState().pendingEventCount).toBe(2);
  });
});

describe("FIFO flush", () => {
  test("delivers rows in enqueue order and deletes them on 2xx", async () => {
    await eventOutbox.enqueueOrderStatus("ord1", "ARRIVED_AT_PICKUP");
    await eventOutbox.enqueueOrderStatus("ord1", "PICKED_UP");
    mockApi.postOrderStatus.mockResolvedValue({ ok: true });

    const res = await eventOutbox.flushEventOutbox();

    expect(res.flushed).toBe(2);
    expect(await eventOutbox._allRowsForTests()).toHaveLength(0);
    const statuses = mockApi.postOrderStatus.mock.calls.map((c: any[]) => c[1].status);
    expect(statuses).toEqual(["ARRIVED_AT_PICKUP", "PICKED_UP"]);
    expect(useDriverStore.getState().pendingEventCount).toBe(0);
  });

  test("a failing head row STOPS the flush — later events never overtake", async () => {
    await eventOutbox.enqueueOrderStatus("ord1", "ARRIVED_AT_PICKUP");
    await eventOutbox.enqueueOrderStatus("ord1", "PICKED_UP");
    mockApi.postOrderStatus.mockRejectedValueOnce(new Error("network down"));

    const res = await eventOutbox.flushEventOutbox();

    expect(res.flushed).toBe(0);
    expect(mockApi.postOrderStatus).toHaveBeenCalledTimes(1); // stopped at head
    const rows = await eventOutbox._allRowsForTests();
    expect(rows).toHaveLength(2);
    expect(rows[0].attempts).toBe(1);
    expect(rows[1].attempts).toBe(0); // untouched — order preserved
  });
});

describe("never give up (unlike the GPS outbox's attempts<5 filter)", () => {
  test("a row still flushes after many failed attempts", async () => {
    await eventOutbox.enqueueOrderStatus("ord1", "PICKED_UP");

    for (let i = 0; i < 6; i++) {
      mockApi.postOrderStatus.mockRejectedValueOnce(new Error("offline"));
      await eventOutbox.flushEventOutbox();
    }
    let rows = await eventOutbox._allRowsForTests();
    expect(rows).toHaveLength(1);
    expect(rows[0].attempts).toBe(6); // >5 and STILL in the queue

    mockApi.postOrderStatus.mockResolvedValueOnce({ ok: true });
    const res = await eventOutbox.flushEventOutbox();
    expect(res.flushed).toBe(1);
    expect(await eventOutbox._allRowsForTests()).toHaveLength(0);
  });
});

describe("409 conflict → drop row + re-hydrate", () => {
  test("409 deletes the row, continues the queue, and triggers a state hydrate", async () => {
    await eventOutbox.enqueueOrderStatus("ord1", "ARRIVED_AT_PICKUP");
    await eventOutbox.enqueueOrderStatus("ord1", "PICKED_UP");
    mockApi.postOrderStatus
      .mockRejectedValueOnce(new ApiError(409, { error: "ORDER_STATE_CONFLICT", code: "ORDER_STATE_CONFLICT" }))
      .mockResolvedValueOnce({ ok: true });
    mockApi.getState.mockResolvedValue({ availability: "ONLINE", serverTime: new Date().toISOString() });

    const res = await eventOutbox.flushEventOutbox();
    await flushMicrotasks(); // hydrateNow is fire-and-forget in the finally block

    expect(res.flushed).toBe(1); // the second row still delivered
    expect(await eventOutbox._allRowsForTests()).toHaveLength(0); // 409 row dropped
    expect(mockApi.getState).toHaveBeenCalled(); // server truth re-adopted
  });
});

describe("POD rows", () => {
  test("flush posts /pod with the stored idempotency key and updates the wallet", async () => {
    useDriverStore.setState({
      activeOrder: { id: "ord9", status: "PICKED_UP", stage: "ARRIVED_AT_DROPOFF" } as any,
    });
    await eventOutbox.enqueueEvent("POD", "pod:ord9", {
      orderId: "ord9",
      method: "PHOTO",
      photoKey: "tenA/ord9/dev1/1.jpg",
      codCollectedKwd: 3.5,
      lat: 29.3,
      lng: 47.9,
    });
    mockApi.postPod.mockResolvedValueOnce({
      order: { id: "ord9", status: "DELIVERED" },
      wallet: { cashOnHandKwd: 3.5, ceilingKwd: 100, todayCollectedKwd: 3.5 },
    });

    const res = await eventOutbox.flushEventOutbox();

    expect(res.flushed).toBe(1);
    expect(mockApi.postPod).toHaveBeenCalledWith(
      "ord9",
      expect.objectContaining({ idempotencyKey: "pod:ord9", photoKey: "tenA/ord9/dev1/1.jpg" }),
    );
    const s = useDriverStore.getState();
    expect(s.wallet?.cashOnHandKwd).toBe(3.5);
    expect(s.activeOrder).toBeNull(); // completed locally once the POD landed
  });
});
