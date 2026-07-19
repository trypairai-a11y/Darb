// foodicsWorker.processFoodicsIngest — eligibility tag filter, created/updated
// flows, duplicate collapse (plan §A6). Redis-less in tests (mock env
// REDIS_URL "") so no BullMQ connections are opened.

import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
prisma.webhookEvent = prisma.webhookEvent ?? {};
for (const fn of ["findUnique", "create", "update"]) {
  prisma.webhookEvent[fn] = prisma.webhookEvent[fn] ?? jest.fn();
}
prisma.foodicsConnection = prisma.foodicsConnection ?? {};
for (const fn of ["findFirst", "updateMany"]) {
  prisma.foodicsConnection[fn] = prisma.foodicsConnection[fn] ?? jest.fn();
}
prisma.vendorBranch = prisma.vendorBranch ?? {};
prisma.vendorBranch.findMany = prisma.vendorBranch.findMany ?? jest.fn();
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
prisma.deliveryOrder.findFirst = prisma.deliveryOrder.findFirst ?? jest.fn();
prisma.user = prisma.user ?? {};
prisma.user.findMany = prisma.user.findMany ?? jest.fn();
prisma.notification = prisma.notification ?? {};
prisma.notification.createMany = prisma.notification.createMany ?? jest.fn();

jest.mock("../../services/orderService", () => ({
  createDeliveryOrder: jest.fn(),
  cancelOrder: jest.fn(),
}));
jest.mock("../../services/foodics/statusWriteback", () => ({
  writeBackMilestone: jest.fn(),
  recordWritebackFailure: jest.fn().mockResolvedValue(undefined),
}));

import { processFoodicsIngest, processFoodicsWriteback } from "../../queues/foodicsWorker";
import codFixture from "../fixtures/foodics/order.delivery.created.cod.json";

const { createDeliveryOrder, cancelOrder } = require("../../services/orderService");
const { writeBackMilestone } = require("../../services/foodics/statusWriteback");

const DARB_TAG = "7a9d0000-1111-4222-8333-444455556666"; // tag id in fixtures
const FOODICS_BRANCH_ID = "b7a11111-2222-4333-8444-555566667777";

const CONNECTION = {
  id: "conn-1",
  tenantId: "t-1",
  vendorId: "v-1",
  status: "CONNECTED",
  orderTagId: null as string | null,
  accessTokenEnc: "iv:tag:ct",
};

function storedEvent(body: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: "we-1",
    provider: "foodics",
    status: "RECEIVED",
    payload: {
      connectionId: "conn-1",
      tenantId: "t-1",
      vendorId: "v-1",
      body,
    },
    ...overrides,
  };
}

function primeBranches() {
  prisma.vendorBranch.findMany.mockResolvedValue([
    { id: "branch-local-1", foodicsBranchId: FOODICS_BRANCH_ID },
  ]);
}

describe("processFoodicsIngest — order.delivery.created", () => {
  beforeEach(() => {
    resetAllMocks();
    createDeliveryOrder.mockReset();
    cancelOrder.mockReset();
    prisma.webhookEvent.update.mockResolvedValue({});
  });

  test("happy path: maps + creates the order, marks PROCESSED", async () => {
    prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent(codFixture));
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
    primeBranches();
    createDeliveryOrder.mockResolvedValue({ id: "ord-1", status: "DISPATCHING" });

    const result = await processFoodicsIngest("we-1");
    expect(result).toEqual({ outcome: "processed", orderId: "ord-1" });

    expect(createDeliveryOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        vendorId: "v-1",
        source: "FOODICS",
        branchId: "branch-local-1",
        paymentMethod: "COD",
        foodicsOrderId: "f00d1c50-aaaa-4bbb-8ccc-000000000001",
      }),
    );
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "we-1" },
        data: expect.objectContaining({ status: "PROCESSED", error: null }),
      }),
    );
  });

  test("eligibility: orderTagId set + untagged order → SKIPPED, no create", async () => {
    const untagged = JSON.parse(JSON.stringify(codFixture));
    untagged.payload.tags = [];
    prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent(untagged));
    prisma.foodicsConnection.findFirst.mockResolvedValue({
      ...CONNECTION,
      orderTagId: DARB_TAG,
    });

    const result = await processFoodicsIngest("we-1");
    expect(result.outcome).toBe("skipped");
    expect(createDeliveryOrder).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PROCESSED",
          error: expect.stringContaining("SKIPPED"),
        }),
      }),
    );
  });

  test("eligibility: orderTagId set + tagged order → ingested", async () => {
    prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent(codFixture));
    prisma.foodicsConnection.findFirst.mockResolvedValue({
      ...CONNECTION,
      orderTagId: DARB_TAG,
    });
    primeBranches();
    createDeliveryOrder.mockResolvedValue({ id: "ord-2" });

    const result = await processFoodicsIngest("we-1");
    expect(result).toEqual({ outcome: "processed", orderId: "ord-2" });
  });

  test("eligibility: orderTagId null → pass-through (everything ingested)", async () => {
    const untagged = JSON.parse(JSON.stringify(codFixture));
    untagged.payload.tags = [];
    prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent(untagged));
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION); // orderTagId null
    primeBranches();
    createDeliveryOrder.mockResolvedValue({ id: "ord-3" });

    const result = await processFoodicsIngest("we-1");
    expect(result.outcome).toBe("processed");
  });

  test("duplicate foodicsOrderId (P2002 from createDeliveryOrder) → duplicate outcome", async () => {
    prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent(codFixture));
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
    primeBranches();
    createDeliveryOrder.mockRejectedValue({ code: "P2002" });

    const result = await processFoodicsIngest("we-1");
    expect(result).toEqual({ outcome: "duplicate" });
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PROCESSED",
          error: expect.stringContaining("duplicate"),
        }),
      }),
    );
  });

  test("unmapped branch → SKIPPED with the mapper's reason", async () => {
    prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent(codFixture));
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
    prisma.vendorBranch.findMany.mockResolvedValue([]); // nothing mapped

    const result = await processFoodicsIngest("we-1");
    expect(result.outcome).toBe("skipped");
    expect(result.note).toContain("UNKNOWN_BRANCH");
  });

  test("already-PROCESSED event is not reprocessed", async () => {
    prisma.webhookEvent.findUnique.mockResolvedValue(
      storedEvent(codFixture, { status: "PROCESSED" }),
    );
    const result = await processFoodicsIngest("we-1");
    expect(result.outcome).toBe("skipped");
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("infrastructure error marks FAILED and rethrows (BullMQ retry)", async () => {
    prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent(codFixture));
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
    primeBranches();
    createDeliveryOrder.mockRejectedValue(new Error("db exploded"));

    await expect(processFoodicsIngest("we-1")).rejects.toThrow("db exploded");
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", error: "db exploded" }),
      }),
    );
  });
});

describe("processFoodicsIngest — order.delivery.updated", () => {
  function cancelledUpdate() {
    const body = JSON.parse(JSON.stringify(codFixture));
    body.event = "order.delivery.updated";
    body.payload.status = 4; // void on the POS side (re-verify code vs sandbox)
    return body;
  }

  beforeEach(() => {
    resetAllMocks();
    createDeliveryOrder.mockReset();
    cancelOrder.mockReset();
    prisma.webhookEvent.update.mockResolvedValue({});
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
  });

  test("POS cancel + our order pre-PICKED_UP → cancelOrder", async () => {
    prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent(cancelledUpdate()));
    prisma.deliveryOrder.findFirst.mockResolvedValue({
      id: "ord-1", status: "DISPATCHING", orderNumber: "DRB-BRGB-0001",
    });
    cancelOrder.mockResolvedValue({ id: "ord-1", status: "CANCELLED" });

    const result = await processFoodicsIngest("we-1");
    expect(result).toEqual({ outcome: "processed", orderId: "ord-1" });
    expect(cancelOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        orderId: "ord-1",
        reason: "FOODICS_POS_CANCELLED",
      }),
    );
  });

  test("POS cancel after PICKED_UP → supervisor notification, no cancel", async () => {
    prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent(cancelledUpdate()));
    prisma.deliveryOrder.findFirst.mockResolvedValue({
      id: "ord-1", status: "PICKED_UP", orderNumber: "DRB-BRGB-0001",
    });
    prisma.user.findMany.mockResolvedValue([{ id: "u-1" }]);
    prisma.notification.createMany.mockResolvedValue({ count: 1 });

    const result = await processFoodicsIngest("we-1");
    expect(result.outcome).toBe("processed");
    expect(cancelOrder).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).toHaveBeenCalled();
  });

  test("update that is not a cancellation → SKIPPED", async () => {
    const body = JSON.parse(JSON.stringify(codFixture));
    body.event = "order.delivery.updated"; // status stays active
    prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent(body));

    const result = await processFoodicsIngest("we-1");
    expect(result.outcome).toBe("skipped");
    expect(cancelOrder).not.toHaveBeenCalled();
  });
});

describe("processFoodicsWriteback", () => {
  beforeEach(() => {
    writeBackMilestone.mockReset();
  });

  test("delegates to writeBackMilestone", async () => {
    writeBackMilestone.mockResolvedValue({ ok: true, body: {} });
    await processFoodicsWriteback({ orderId: "ord-1", milestone: "DELIVERED" });
    expect(writeBackMilestone).toHaveBeenCalledWith("ord-1", "DELIVERED");
  });

  test("API failure propagates for BullMQ retry", async () => {
    writeBackMilestone.mockRejectedValue(new Error("HTTP 500"));
    await expect(
      processFoodicsWriteback({ orderId: "ord-1", milestone: "ASSIGNED" }),
    ).rejects.toThrow("HTTP 500");
  });
});
