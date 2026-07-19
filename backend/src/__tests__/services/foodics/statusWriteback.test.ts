// Foodics status write-back — milestone table shape + writeBackMilestone
// behaviour (plan §A6). The numeric delivery_status codes are the documented
// assumption; the table test pins them so a sandbox-driven change is a
// conscious, reviewed edit.

import { getMockPrisma, resetAllMocks } from "../../setup";

const prisma = getMockPrisma();
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
for (const fn of ["findFirst", "findMany", "updateMany"]) {
  prisma.deliveryOrder[fn] = prisma.deliveryOrder[fn] ?? jest.fn();
}
prisma.foodicsConnection = prisma.foodicsConnection ?? {};
for (const fn of ["findFirst", "updateMany", "upsert"]) {
  prisma.foodicsConnection[fn] = prisma.foodicsConnection[fn] ?? jest.fn();
}
prisma.orderEvent = prisma.orderEvent ?? {};
prisma.orderEvent.create = prisma.orderEvent.create ?? jest.fn();
prisma.user = prisma.user ?? {};
prisma.user.findMany = prisma.user.findMany ?? jest.fn();
prisma.notification = prisma.notification ?? {};
prisma.notification.createMany = prisma.notification.createMany ?? jest.fn();

jest.mock("../../../services/foodics/client", () => ({
  foodicsPut: jest.fn(),
}));

import {
  MILESTONE_WRITEBACK,
  buildWritebackBody,
  recordWritebackFailure,
  writeBackMilestone,
} from "../../../services/foodics/statusWriteback";

const { foodicsPut } = require("../../../services/foodics/client");

const ORDER = {
  id: "ord-1",
  tenantId: "t-1",
  vendorId: "v-1",
  source: "FOODICS",
  foodicsOrderId: "foodics-ord-9",
  orderNumber: "DRB-BRGB-0001",
  assignedAt: new Date("2026-07-19T10:00:00.000Z"),
  pickedUpAt: new Date("2026-07-19T10:12:00.000Z"),
  deliveredAt: new Date("2026-07-19T10:31:00.000Z"),
};

const CONNECTION = {
  id: "conn-1",
  tenantId: "t-1",
  vendorId: "v-1",
  status: "CONNECTED",
  accessTokenEnc: "iv:tag:ct",
};

describe("MILESTONE_WRITEBACK table", () => {
  test("delivery_status codes 3/4/5/6 (re-verify against sandbox)", () => {
    expect(MILESTONE_WRITEBACK.ASSIGNED.delivery_status).toBe(3);
    expect(MILESTONE_WRITEBACK.PICKED_UP.delivery_status).toBe(4);
    expect(MILESTONE_WRITEBACK.DELIVERED.delivery_status).toBe(5);
    expect(MILESTONE_WRITEBACK.CANCELLED.delivery_status).toBe(6);
  });

  test("timestamp field wiring matches the plan", () => {
    expect(MILESTONE_WRITEBACK.ASSIGNED.timestampFields).toEqual({
      driver_assigned_at: "assignedAt",
    });
    expect(MILESTONE_WRITEBACK.PICKED_UP.timestampFields).toEqual({
      driver_collected_at: "pickedUpAt",
      dispatched_at: "pickedUpAt",
    });
    expect(MILESTONE_WRITEBACK.DELIVERED.timestampFields).toEqual({
      delivered_at: "deliveredAt",
    });
    expect(MILESTONE_WRITEBACK.CANCELLED.timestampFields).toEqual({});
  });
});

describe("buildWritebackBody", () => {
  test("ASSIGNED body carries ISO assignedAt + delivery_status 3", () => {
    expect(buildWritebackBody("ASSIGNED", ORDER)).toEqual({
      delivery_status: 3,
      driver_assigned_at: "2026-07-19T10:00:00.000Z",
    });
  });

  test("PICKED_UP body carries both collected + dispatched timestamps", () => {
    expect(buildWritebackBody("PICKED_UP", ORDER)).toEqual({
      delivery_status: 4,
      driver_collected_at: "2026-07-19T10:12:00.000Z",
      dispatched_at: "2026-07-19T10:12:00.000Z",
    });
  });

  test("DELIVERED body carries delivered_at", () => {
    expect(buildWritebackBody("DELIVERED", ORDER)).toEqual({
      delivery_status: 5,
      delivered_at: "2026-07-19T10:31:00.000Z",
    });
  });

  test("CANCELLED body is delivery_status only", () => {
    expect(buildWritebackBody("CANCELLED", ORDER)).toEqual({ delivery_status: 6 });
  });

  test("null timestamp column falls back to now (still a valid ISO string)", () => {
    const body = buildWritebackBody("DELIVERED", { ...ORDER, deliveredAt: null });
    expect(typeof body.delivered_at).toBe("string");
    expect(new Date(body.delivered_at as string).getTime()).not.toBeNaN();
  });
});

describe("writeBackMilestone", () => {
  beforeEach(() => {
    resetAllMocks();
    foodicsPut.mockReset();
  });

  test("PUTs /orders/{foodicsOrderId} with the milestone body", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(ORDER);
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
    foodicsPut.mockResolvedValue({});

    const result = await writeBackMilestone("ord-1", "DELIVERED");
    expect(result).toEqual({
      ok: true,
      body: { delivery_status: 5, delivered_at: "2026-07-19T10:31:00.000Z" },
    });
    expect(foodicsPut).toHaveBeenCalledWith(
      CONNECTION,
      "/orders/foodics-ord-9",
      { delivery_status: 5, delivered_at: "2026-07-19T10:31:00.000Z" },
    );
  });

  test("skips non-Foodics orders without touching the API", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...ORDER, source: "VENDOR_PORTAL" });
    const result = await writeBackMilestone("ord-1", "ASSIGNED");
    expect(result).toEqual({ skipped: "NOT_A_FOODICS_ORDER" });
    expect(foodicsPut).not.toHaveBeenCalled();
  });

  test("skips when there is no CONNECTED connection", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(ORDER);
    prisma.foodicsConnection.findFirst.mockResolvedValue({ ...CONNECTION, status: "ERROR" });
    const result = await writeBackMilestone("ord-1", "ASSIGNED");
    expect(result).toEqual({ skipped: "CONNECTION_ERROR" });
    expect(foodicsPut).not.toHaveBeenCalled();
  });

  test("skips when the order no longer exists", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(null);
    expect(await writeBackMilestone("gone", "ASSIGNED")).toEqual({ skipped: "ORDER_NOT_FOUND" });
  });

  test("API failure propagates (BullMQ retries on it)", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(ORDER);
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
    foodicsPut.mockRejectedValue(new Error("Foodics API error 500"));
    await expect(writeBackMilestone("ord-1", "PICKED_UP")).rejects.toThrow("Foodics API error 500");
  });
});

describe("recordWritebackFailure", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  test("appends OrderEvent + notifies supervisors", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(ORDER);
    prisma.user.findMany.mockResolvedValue([{ id: "u-1" }, { id: "u-2" }]);
    prisma.orderEvent.create.mockResolvedValue({});
    prisma.notification.createMany.mockResolvedValue({ count: 2 });

    await recordWritebackFailure("ord-1", "DELIVERED", "HTTP 500 after 5 attempts");

    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t-1",
          orderId: "ord-1",
          action: "foodics.writeback_failed",
        }),
      }),
    );
    const createManyArg = prisma.notification.createMany.mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(2);
    expect(createManyArg.data[0]).toMatchObject({
      tenantId: "t-1",
      type: "FOODICS_WRITEBACK_FAILED",
      severity: "HIGH",
      sourceId: "ord-1",
    });
    // Supervisors = ADMIN/OPS_MANAGER/SUPERVISOR active users.
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t-1",
          role: { in: ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] },
          isActive: true,
        }),
      }),
    );
  });

  test("never throws — even when everything fails", async () => {
    prisma.deliveryOrder.findFirst.mockRejectedValue(new Error("db down"));
    await expect(
      recordWritebackFailure("ord-1", "ASSIGNED", "boom"),
    ).resolves.toBeUndefined();
  });
});
