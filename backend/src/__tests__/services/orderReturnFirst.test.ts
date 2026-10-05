// Client note (2026-10-05), answering 2026-09-21: "if delivery failed for any
// reason the driver must return the order to the vendor, after that he can
// report that the delivery failed". The order is turned around first
// (startReturnToMerchant, no status change) and the failure is recorded at
// the shop (failAndReturnToMerchant, X → FAILED → RETURNED in one tx).
//
// Same harness as orderService.test.ts: the shared prisma stub with the
// Darb 2.0 delegates attached here, collaborators mocked at the boundary, the
// state machine running for real so the guarded updateMany is exercised.

import { getMockPrisma, resetAllMocks } from "../setup";
import { Prisma } from "../../generated/prisma";

const prisma = getMockPrisma();

prisma.deliveryOrder = prisma.deliveryOrder ?? {};
for (const fn of ["findMany", "findFirst", "create", "updateMany", "count"]) {
  prisma.deliveryOrder[fn] = prisma.deliveryOrder[fn] ?? jest.fn();
}
prisma.dispatchOffer = prisma.dispatchOffer ?? {};
for (const fn of ["findMany", "updateMany", "upsert", "create"]) {
  prisma.dispatchOffer[fn] = prisma.dispatchOffer[fn] ?? jest.fn();
}

jest.mock("../../services/pricingService", () => ({ quoteDelivery: jest.fn() }));
jest.mock("../../services/wallet/walletService", () => ({
  postCodSettlement: jest.fn().mockResolvedValue(undefined),
  postPrepaidSettlement: jest.fn().mockResolvedValue(undefined),
  isVendorOverCreditCap: jest.fn().mockResolvedValue(false),
}));
jest.mock("../../queues/dispatchQueue", () => ({
  enqueueDispatchStart: jest.fn().mockResolvedValue(undefined),
  enqueueDispatchNext: jest.fn().mockResolvedValue(undefined),
  scheduleOfferExpiry: jest.fn().mockResolvedValue(undefined),
  removeOfferExpiryJob: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/foodics/writebackHook", () => ({
  enqueueFoodicsWriteback: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/driverAppPushService", () => ({
  sendDispatchDriverPush: jest.fn().mockResolvedValue({ pushSent: 1 }),
}));
jest.mock("../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

const { postCodSettlement } = require("../../services/wallet/walletService");
const { enqueueFoodicsWriteback } = require("../../services/foodics/writebackHook");
const { publishEvent } = require("../../services/eventBus");
const {
  startReturnToMerchant,
  failAndReturnToMerchant,
  failDelivery,
} = require("../../services/orderService");
const {
  OrderStateConflictError,
  DRIVER_ACTIVE_STATUSES,
  isReturningToMerchant,
} = require("../../services/orderStateMachine");

const TENANT = "t-1";
const D = (v: string | number) => new Prisma.Decimal(v);
const DRIVER_ACTOR = { type: "DRIVER" as const, id: "drv-1", name: "Qadir" };

const IN_FLIGHT = {
  id: "ord-1",
  tenantId: TENANT,
  orderNumber: "DRB-BRGB-000001",
  vendorId: "v-1",
  driverId: "drv-1",
  status: "PICKED_UP",
  deliveryFeeKwd: D("1.250"),
  isTraining: false,
  trainingSessionId: null,
  metadata: { driverPhase: "ARRIVED_AT_DROPOFF" },
};

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
  prisma.deliveryOrder.count.mockResolvedValue(0);
  prisma.courierOnlineSession.updateMany.mockResolvedValue({ count: 1 });
});

describe("isReturningToMerchant / DRIVER_ACTIVE_STATUSES", () => {
  test("an in-flight order is returning only once the leg was started", () => {
    expect(isReturningToMerchant({ status: "PICKED_UP", metadata: null })).toBe(false);
    expect(
      isReturningToMerchant({ status: "PICKED_UP", metadata: { returnStartedAt: "2026-10-05T10:00:00Z" } }),
    ).toBe(true);
    expect(
      isReturningToMerchant({ status: "ARRIVED", metadata: { returnStartedAt: "2026-10-05T10:00:00Z" } }),
    ).toBe(true);
  });

  test("FAILED (older builds) is on the return leg; a finished order is not", () => {
    expect(isReturningToMerchant({ status: "FAILED" })).toBe(true);
    expect(
      isReturningToMerchant({ status: "DELIVERED", metadata: { returnStartedAt: "2026-10-05T10:00:00Z" } }),
    ).toBe(false);
    expect(isReturningToMerchant({ status: "RETURNED" })).toBe(false);
  });

  test("a driver standing at the shop counter (ARRIVED) still has an active order", () => {
    expect(DRIVER_ACTIVE_STATUSES).toEqual(["ASSIGNED", "ARRIVED", "PICKED_UP", "FAILED"]);
  });
});

describe("startReturnToMerchant", () => {
  test("marks the order as on its way back WITHOUT moving its status", async () => {
    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce(IN_FLIGHT)
      .mockResolvedValueOnce({ ...IN_FLIGHT, metadata: { returnStartedAt: "x" } });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    await startReturnToMerchant({ tenantId: TENANT, orderId: "ord-1", actor: DRIVER_ACTOR });

    const guard = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    // Status-guarded on the CURRENT status, and the status is not in the data.
    expect(guard.where).toEqual({ id: "ord-1", tenantId: TENANT, status: "PICKED_UP" });
    expect(guard.data.status).toBeUndefined();
    // The earlier metadata survives next to the new marker.
    expect(guard.data.metadata).toMatchObject({ driverPhase: "ARRIVED_AT_DROPOFF" });
    expect(typeof guard.data.metadata.returnStartedAt).toBe("string");

    const event = prisma.orderEvent.create.mock.calls[0][0].data;
    expect(event.action).toBe("order.return_started");
    expect(event.operator).toBe("Qadir");
    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.return_started",
        payload: expect.objectContaining({ orderId: "ord-1", returning: true, vendorId: "v-1" }),
      }),
    );
  });

  test("is idempotent: a second tap writes nothing", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValueOnce({
      ...IN_FLIGHT,
      metadata: { returnStartedAt: "2026-10-05T10:00:00Z" },
    });

    await startReturnToMerchant({ tenantId: TENANT, orderId: "ord-1", actor: DRIVER_ACTOR });

    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
    expect(prisma.orderEvent.create).not.toHaveBeenCalled();
  });

  test("a finished order cannot be turned around (409)", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValueOnce({ ...IN_FLIGHT, status: "DELIVERED" });
    await expect(
      startReturnToMerchant({ tenantId: TENANT, orderId: "ord-1", actor: DRIVER_ACTOR }),
    ).rejects.toThrow(OrderStateConflictError);
  });

  test("losing the race to a concurrent cancel answers 409 and writes no event", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValueOnce(IN_FLIGHT);
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      startReturnToMerchant({ tenantId: TENANT, orderId: "ord-1", actor: DRIVER_ACTOR }),
    ).rejects.toThrow(OrderStateConflictError);
    expect(prisma.orderEvent.create).not.toHaveBeenCalled();
  });
});

describe("failAndReturnToMerchant", () => {
  test("at the shop: PICKED_UP → FAILED (reason) → RETURNED in one tx, driver released, no wallet posting", async () => {
    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce({ ...IN_FLIGHT, metadata: { returnStartedAt: "x" } })
      .mockResolvedValueOnce({ ...IN_FLIGHT, status: "RETURNED" });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    const order = await failAndReturnToMerchant({
      tenantId: TENANT,
      orderId: "ord-1",
      reason: "CUSTOMER_UNREACHABLE",
      actor: DRIVER_ACTOR,
      note: "Returned to the shop by the driver",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [toFailed, toReturned] = prisma.deliveryOrder.updateMany.mock.calls.map((c: any[]) => c[0]);
    expect(toFailed.where).toEqual({ id: "ord-1", tenantId: TENANT, status: "PICKED_UP" });
    expect(toFailed.data).toMatchObject({ status: "FAILED", failureReason: "CUSTOMER_UNREACHABLE" });
    expect(toReturned.where).toEqual({ id: "ord-1", tenantId: TENANT, status: "FAILED" });
    expect(toReturned.data).toMatchObject({ status: "RETURNED" });
    expect(toReturned.data.returnedAt).toBeInstanceOf(Date);

    const actions = prisma.orderEvent.create.mock.calls.map((c: any[]) => c[0].data.action);
    expect(actions).toEqual(["order.failed", "order.returned"]);

    // Released only now that the bag is back on the counter.
    expect(prisma.courierOnlineSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { availability: "ONLINE" } }),
    );
    expect(postCodSettlement).not.toHaveBeenCalled();
    expect(enqueueFoodicsWriteback).toHaveBeenCalledWith("ord-1", "CANCELLED");
    expect(order.status).toBe("RETURNED");
  });

  test("an order an older build already FAILED only takes the RETURNED step", async () => {
    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce({ ...IN_FLIGHT, status: "FAILED" }) // this function
      .mockResolvedValueOnce({ ...IN_FLIGHT, status: "FAILED" }) // returnToMerchant
      .mockResolvedValueOnce({ ...IN_FLIGHT, status: "RETURNED" });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    await failAndReturnToMerchant({
      tenantId: TENANT,
      orderId: "ord-1",
      reason: "ignored",
      actor: DRIVER_ACTOR,
    });

    expect(prisma.deliveryOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.deliveryOrder.updateMany.mock.calls[0][0].where.status).toBe("FAILED");
  });

  test("a delivered order cannot be reported failed (409)", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValueOnce({ ...IN_FLIGHT, status: "DELIVERED" });
    await expect(
      failAndReturnToMerchant({ tenantId: TENANT, orderId: "ord-1", reason: "x", actor: DRIVER_ACTOR }),
    ).rejects.toThrow(OrderStateConflictError);
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
  });
});

describe("failDelivery (older app builds)", () => {
  test("accepts ARRIVED, which the state machine allows", async () => {
    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce({ ...IN_FLIGHT, status: "ARRIVED" })
      .mockResolvedValueOnce({ ...IN_FLIGHT, status: "FAILED" });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    const order = await failDelivery({
      tenantId: TENANT,
      orderId: "ord-1",
      reason: "CUSTOMER_REFUSED",
      actor: DRIVER_ACTOR,
    });

    expect(prisma.deliveryOrder.updateMany.mock.calls[0][0].where.status).toBe("ARRIVED");
    expect(order.status).toBe("FAILED");
  });
});
