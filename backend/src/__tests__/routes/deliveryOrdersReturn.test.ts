// POST /api/delivery-orders/:id/return, the staff Return to store button in
// Ops > Orders. Client note (2026-10-05): a driver now turns back to the shop
// BEFORE the failure is recorded, so the backstop must also close an order
// that is still in flight but on its way back; any other in-flight order is
// still a delivery and must not be closed from here.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

jest.mock("../../services/orderService", () => {
  const actual = jest.requireActual("../../services/orderService");
  return {
    OrderNotFoundError: actual.OrderNotFoundError,
    SLA_PROMISE_MINUTES: 45,
    assignDriverManually: jest.fn(),
    cancelOrder: jest.fn(),
    createDeliveryOrder: jest.fn(),
    redispatchOrder: jest.fn(),
    returnToMerchant: jest.fn(),
    failAndReturnToMerchant: jest.fn(),
  };
});
jest.mock("../../queues/dispatchQueue", () => ({ enqueueDispatchStart: jest.fn() }));

const prisma = getMockPrisma();
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
prisma.deliveryOrder.findFirst = jest.fn();

const { returnToMerchant, failAndReturnToMerchant } = require("../../services/orderService");
const router = require("../../routes/deliveryOrders").default;

const SUPERVISOR = { userId: "u-1", tenantId: "t-1", role: "SUPERVISOR", email: "sup@darb.kw" };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = SUPERVISOR;
    next();
  });
  app.use("/api/delivery-orders", router);
  return app;
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
});

test("an order on its way back is reported failed and returned in one step", async () => {
  prisma.deliveryOrder.findFirst.mockResolvedValue({
    id: "ord-1",
    status: "PICKED_UP",
    metadata: { returnStartedAt: "2026-10-05T10:00:00.000Z" },
  });
  (failAndReturnToMerchant as jest.Mock).mockResolvedValue({ id: "ord-1", status: "RETURNED" });

  const res = await request(makeApp()).post("/api/delivery-orders/ord-1/return").send({});

  expect(res.status).toBe(200);
  expect(failAndReturnToMerchant).toHaveBeenCalledWith(
    expect.objectContaining({
      tenantId: "t-1",
      orderId: "ord-1",
      reason: "Returned to the shop, confirmed by staff",
    }),
  );
  expect(returnToMerchant).not.toHaveBeenCalled();
  expect(res.body.status).toBe("RETURNED");
});

test("a FAILED order takes the existing FAILED → RETURNED step", async () => {
  prisma.deliveryOrder.findFirst.mockResolvedValue({ id: "ord-1", status: "FAILED", metadata: null });
  (returnToMerchant as jest.Mock).mockResolvedValue({ id: "ord-1", status: "RETURNED" });

  const res = await request(makeApp()).post("/api/delivery-orders/ord-1/return").send({});

  expect(res.status).toBe(200);
  expect(returnToMerchant).toHaveBeenCalled();
  expect(failAndReturnToMerchant).not.toHaveBeenCalled();
});

test("an ordinary in-flight order is not closed from here (the state machine answers 409)", async () => {
  const { OrderStateConflictError } = jest.requireActual("../../services/orderStateMachine");
  prisma.deliveryOrder.findFirst.mockResolvedValue({ id: "ord-1", status: "PICKED_UP", metadata: null });
  (returnToMerchant as jest.Mock).mockRejectedValue(
    new OrderStateConflictError("ord-1", "PICKED_UP", "RETURNED"),
  );

  const res = await request(makeApp()).post("/api/delivery-orders/ord-1/return").send({});

  expect(res.status).toBe(409);
  expect(failAndReturnToMerchant).not.toHaveBeenCalled();
});

test("unknown order → 404", async () => {
  prisma.deliveryOrder.findFirst.mockResolvedValue(null);
  const res = await request(makeApp()).post("/api/delivery-orders/nope/return").send({});
  expect(res.status).toBe(404);
});
