// Darb 2.0 — orderStateMachine unit tests (plan §A2).
//
// The transition table is a pure structure; transitionOrder is exercised
// against a hand-rolled tx double (deliveryOrder.updateMany + orderEvent
// .create) — no HTTP, no real Prisma.

import { Prisma } from "../../generated/prisma";
import {
  ALLOWED,
  OrderStateConflictError,
  SYSTEM_ACTOR,
  flushOrderEvents,
  isTransitionAllowed,
  transitionOrder,
} from "../../services/orderStateMachine";
import { subscribe } from "../../services/eventBus";

type Status = keyof typeof ALLOWED;

const ALL_STATUSES = Object.keys(ALLOWED) as Status[];

function makeTx(updateCount = 1) {
  const tx = {
    deliveryOrder: {
      updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
    },
    orderEvent: {
      create: jest.fn().mockResolvedValue({ id: "evt-1" }),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, raw: tx };
}

describe("ALLOWED transition table (§A2 legality matrix)", () => {
  const LEGAL: Array<[Status, Status]> = [
    ["CREATED", "DISPATCHING"],
    ["CREATED", "REJECTED"],
    ["CREATED", "CANCELLED"],
    ["REJECTED", "CREATED"], // dropoff-fix re-entry
    ["DISPATCHING", "ASSIGNED"],
    ["DISPATCHING", "NO_DRIVER"],
    ["DISPATCHING", "CANCELLED"],
    ["NO_DRIVER", "DISPATCHING"], // redispatch
    ["NO_DRIVER", "ASSIGNED"], // manual assign
    ["NO_DRIVER", "CANCELLED"],
    ["ASSIGNED", "PICKED_UP"],
    ["ASSIGNED", "FAILED"],
    ["ASSIGNED", "CANCELLED"],
    ["PICKED_UP", "DELIVERED"],
    ["PICKED_UP", "FAILED"],
    ["PICKED_UP", "CANCELLED"], // supervisor pre-DELIVERED cancel
  ];

  test.each(LEGAL)("%s → %s is legal", (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(true);
  });

  test("everything not in the legal list is illegal (full matrix sweep)", () => {
    const legalSet = new Set(LEGAL.map(([f, t]) => `${f}>${t}`));
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(isTransitionAllowed(from, to)).toBe(legalSet.has(`${from}>${to}`));
      }
    }
  });

  test("terminal states have no outgoing transitions", () => {
    expect(ALLOWED.DELIVERED).toEqual([]);
    expect(ALLOWED.FAILED).toEqual([]);
    expect(ALLOWED.CANCELLED).toEqual([]);
  });

  test("no state transitions to itself", () => {
    for (const from of ALL_STATUSES) {
      expect(ALLOWED[from]).not.toContain(from);
    }
  });
});

describe("transitionOrder", () => {
  test("happy path: guarded updateMany + OrderEvent append with actor + metadata", async () => {
    const { tx, raw } = makeTx(1);

    await transitionOrder(tx, {
      orderId: "ord-1",
      tenantId: "t-1",
      from: "DISPATCHING",
      to: "ASSIGNED",
      actor: { type: "USER", id: "u-1", name: "sup@darb.com" },
      data: { driverId: "drv-1", assignedAt: new Date("2026-07-19T10:00:00Z") },
      eventMeta: { orderNumber: "DRB-BRGB-0001", vendorId: "v-1", driverId: "drv-1" },
    });

    expect(raw.deliveryOrder.updateMany).toHaveBeenCalledTimes(1);
    const call = raw.deliveryOrder.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "ord-1", tenantId: "t-1", status: "DISPATCHING" });
    expect(call.data).toMatchObject({ status: "ASSIGNED", driverId: "drv-1" });

    expect(raw.orderEvent.create).toHaveBeenCalledTimes(1);
    const event = raw.orderEvent.create.mock.calls[0][0].data;
    expect(event).toMatchObject({
      tenantId: "t-1",
      orderId: "ord-1",
      action: "order.assigned",
      operator: "sup@darb.com",
      operatorId: "u-1",
    });
    expect(event.metadata).toMatchObject({
      from: "DISPATCHING",
      to: "ASSIGNED",
      orderNumber: "DRB-BRGB-0001",
      vendorId: "v-1",
    });
  });

  test("conflict path: updateMany count 0 → OrderStateConflictError, no OrderEvent", async () => {
    const { tx, raw } = makeTx(0);

    await expect(
      transitionOrder(tx, {
        orderId: "ord-1",
        tenantId: "t-1",
        from: "PICKED_UP",
        to: "DELIVERED",
        actor: SYSTEM_ACTOR,
      }),
    ).rejects.toThrow(OrderStateConflictError);

    expect(raw.deliveryOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(raw.orderEvent.create).not.toHaveBeenCalled();
  });

  test("illegal from→to pair throws BEFORE touching the database", async () => {
    const { tx, raw } = makeTx(1);

    await expect(
      transitionOrder(tx, {
        orderId: "ord-1",
        tenantId: "t-1",
        from: "DELIVERED",
        to: "ASSIGNED",
        actor: SYSTEM_ACTOR,
      }),
    ).rejects.toThrow(OrderStateConflictError);

    expect(raw.deliveryOrder.updateMany).not.toHaveBeenCalled();
    expect(raw.orderEvent.create).not.toHaveBeenCalled();
  });

  test("collected SSE event is published only on flushOrderEvents(tx), on the tenant channel", async () => {
    const { tx } = makeTx(1);
    const received: any[] = [];
    const otherTenant: any[] = [];
    const unsubA = subscribe("t-1", (e) => received.push(e));
    const unsubB = subscribe("t-2", (e) => otherTenant.push(e));

    try {
      await transitionOrder(tx, {
        orderId: "ord-1",
        tenantId: "t-1",
        from: "PICKED_UP",
        to: "DELIVERED",
        actor: SYSTEM_ACTOR,
        eventMeta: { orderNumber: "DRB-BRGB-0002", vendorId: "v-1", feeKwd: "1.250" },
      });

      // Not published yet — the surrounding tx hasn't "committed".
      expect(received).toHaveLength(0);

      flushOrderEvents(tx as unknown as object);
      await new Promise((r) => setTimeout(r, 10));

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("order.delivered");
      expect(received[0].payload).toMatchObject({
        orderId: "ord-1",
        orderNumber: "DRB-BRGB-0002",
        vendorId: "v-1",
        status: "DELIVERED",
      });
      expect(otherTenant).toHaveLength(0);

      // Second flush is a no-op (events were consumed).
      flushOrderEvents(tx as unknown as object);
      await new Promise((r) => setTimeout(r, 10));
      expect(received).toHaveLength(1);
    } finally {
      unsubA();
      unsubB();
    }
  });

  test("CREATED→DISPATCHING collects no SSE event (order.created is the service's job)", async () => {
    const { tx } = makeTx(1);
    const received: any[] = [];
    const unsub = subscribe("t-1", (e) => received.push(e));

    try {
      await transitionOrder(tx, {
        orderId: "ord-1",
        tenantId: "t-1",
        from: "CREATED",
        to: "DISPATCHING",
        actor: SYSTEM_ACTOR,
      });
      flushOrderEvents(tx as unknown as object);
      await new Promise((r) => setTimeout(r, 10));
      expect(received).toHaveLength(0);
    } finally {
      unsub();
    }
  });
});
