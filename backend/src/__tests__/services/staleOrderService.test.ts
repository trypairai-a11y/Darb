// Revision 24 (#18): orders stuck "Arrived at shop" for 76 days.
//
// The sweep closes what never left the shop and only flags what might have
// the customer's goods or cash in somebody's hands, so the tests care most
// about that split and about writing nothing on a dry run.

import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
for (const fn of ["findMany", "updateMany"]) {
  prisma.deliveryOrder[fn] = prisma.deliveryOrder[fn] ?? jest.fn();
}
prisma.user = prisma.user ?? {};
prisma.user.findMany = prisma.user.findMany ?? jest.fn();
prisma.notification = prisma.notification ?? {};
prisma.notification.createMany = prisma.notification.createMany ?? jest.fn();

jest.mock("../../services/orderService", () => ({
  cancelOrder: jest.fn().mockResolvedValue({ id: "x", status: "CANCELLED" }),
}));

const { cancelOrder } = require("../../services/orderService");
const { OrderStateConflictError } = require("../../services/orderStateMachine");
const {
  sweepStaleOrders,
  STALE_CANCEL_REASON,
} = require("../../services/staleOrderService");

const NOW = new Date("2026-10-14T03:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function row(id: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tenantId: "t-1",
    orderNumber: `DRB-SEEF-${id}`,
    status,
    updatedAt: daysAgo(76),
    driverId: "drv-1",
    scheduledAt: null,
    metadata: null,
    ...extra,
  };
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  (cancelOrder as jest.Mock).mockResolvedValue({ status: "CANCELLED" });
  prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
  prisma.user.findMany.mockResolvedValue([{ id: "u-ops" }]);
  prisma.notification.createMany.mockResolvedValue({ count: 1 });
});

describe("sweepStaleOrders", () => {
  test("only orders untouched for 24 hours are read", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([]);
    await sweepStaleOrders({ now: NOW });
    const where = prisma.deliveryOrder.findMany.mock.calls[0][0].where;
    expect(where.updatedAt).toEqual({ lt: new Date(NOW.getTime() - 24 * 3_600_000) });
    expect(where.status.in).toEqual(
      expect.arrayContaining(["ARRIVED", "ASSIGNED", "PICKED_UP", "FAILED", "DISPATCHING", "NO_DRIVER"]),
    );
  });

  test("ARRIVED and ASSIGNED are closed through cancelOrder: driver released, no WhatsApp", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([row("a1", "ARRIVED"), row("a2", "ASSIGNED")]);

    const result = await sweepStaleOrders({ now: NOW });

    expect(result.closed).toBe(2);
    expect(cancelOrder).toHaveBeenCalledTimes(2);
    expect(cancelOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "a1",
        tenantId: "t-1",
        reason: STALE_CANCEL_REASON,
        allowFrom: ["ASSIGNED", "ARRIVED"],
        notifyCustomer: false,
        actor: expect.objectContaining({ type: "SYSTEM" }),
      }),
    );
  });

  test("PICKED_UP is flagged, never moved: the goods or the cash may be with the driver", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([row("p1", "PICKED_UP")]);

    const result = await sweepStaleOrders({ now: NOW });

    expect(cancelOrder).not.toHaveBeenCalled();
    expect(result.flagged).toBe(1);
    const write = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(write.where).toEqual({ id: "p1", tenantId: "t-1", status: "PICKED_UP" });
    expect(write.data).toEqual({ metadata: { staleFlaggedAt: NOW.toISOString() } });
    expect(Object.keys(write.data)).not.toContain("status");
    // One summary per tenant, to the ops roles.
    const rows = prisma.notification.createMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({ type: "ORDERS_STALE", category: "OPS_TODO" });
    expect(rows[0].message).toContain("DRB-SEEF-p1");
  });

  test("an order on its way back to the shop is flagged, not cancelled", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([
      row("r1", "ASSIGNED", { metadata: { returnStartedAt: "2026-08-01T10:00:00Z" } }),
    ]);

    const result = await sweepStaleOrders({ now: NOW });

    expect(cancelOrder).not.toHaveBeenCalled();
    expect(result.flagged).toBe(1);
  });

  test("an order still waiting for a driver is flagged, never cancelled (revision 24 #5)", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([row("n1", "NO_DRIVER", { driverId: null })]);

    const result = await sweepStaleOrders({ now: NOW });

    expect(cancelOrder).not.toHaveBeenCalled();
    expect(result.flagged).toBe(1);
  });

  test("an order flagged on an earlier run is not flagged or announced again", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([
      row("p1", "PICKED_UP", { metadata: { staleFlaggedAt: "2026-10-13T03:00:00Z" } }),
    ]);

    const result = await sweepStaleOrders({ now: NOW });

    expect(result).toMatchObject({ flagged: 0, skipped: 1 });
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  test("a CREATED order scheduled for later is waiting on purpose and left alone", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([
      row("s1", "CREATED", { scheduledAt: new Date(NOW.getTime() + 3_600_000) }),
    ]);

    const result = await sweepStaleOrders({ now: NOW });

    expect(result.orders).toHaveLength(0);
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
  });

  test("dry run reports what it would do and writes nothing", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([row("a1", "ARRIVED"), row("p1", "PICKED_UP")]);

    const result = await sweepStaleOrders({ now: NOW, dryRun: true });

    expect(result).toMatchObject({ dryRun: true, closed: 1, flagged: 1 });
    expect(result.orders.map((o: any) => o.action)).toEqual(["CLOSE", "FLAG"]);
    expect(cancelOrder).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  test("an order that moved under the sweep is skipped, not an error", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([row("a1", "ARRIVED")]);
    (cancelOrder as jest.Mock).mockRejectedValue(new OrderStateConflictError("a1", "ARRIVED", "CANCELLED"));

    const result = await sweepStaleOrders({ now: NOW });

    expect(result).toMatchObject({ closed: 0, skipped: 1 });
  });

  test("tenantId narrows the read to one tenant", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([]);
    await sweepStaleOrders({ now: NOW, tenantId: "t-9" });
    expect(prisma.deliveryOrder.findMany.mock.calls[0][0].where.tenantId).toBe("t-9");
  });
});
