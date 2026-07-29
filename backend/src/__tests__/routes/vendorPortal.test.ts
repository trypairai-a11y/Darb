// Darb 2.0 — vendor portal route tests (plan §A8 /api/vendor).
//
// Contract under test: every read/write is scoped by tenantId + vendorId
// taken from the signed JWT (req.user) — NEVER from query params or body.
//
// Mocking follows the house pattern: moduleNameMapper routes ../config and
// ../middleware/{auth,tenantScope} to the shared mocks; rbac + vendorScope
// run for real. The auth mock only fills a default ADMIN user when req.user
// is missing, so tests inject their own vendor identity via a pre-router
// middleware (same technique as the /api/decisions tests).

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
// The shared mocks/config doesn't know the Darb 2.0 models yet — augment the
// stub in-place rather than editing the shared file (parallel-track safety).
// resetAllMocks() iterates Object.entries(prisma), so these get reset too.
prisma.vendor = prisma.vendor ?? {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  updateMany: jest.fn(),
};
prisma.deliveryOrder = prisma.deliveryOrder ?? {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  count: jest.fn(),
};
prisma.walletAccount = prisma.walletAccount ?? { findFirst: jest.fn() };
prisma.walletEntry = prisma.walletEntry ?? { findMany: jest.fn(), count: jest.fn() };
prisma.vendorBranch = prisma.vendorBranch ?? { findMany: jest.fn() };

// Orders-core track wired the two former 501 stubs into orderService — mock
// the service boundary so these route tests stay unit-level.
jest.mock("../../services/orderService", () => ({
  OrderNotFoundError: class OrderNotFoundError extends Error {},
  createDeliveryOrder: jest.fn(),
  cancelOrder: jest.fn(),
}));

import { OrderStateConflictError } from "../../services/orderStateMachine";
import vendorPortalRouter from "../../routes/vendorPortal";

const {
  createDeliveryOrder: mockCreateDeliveryOrder,
  cancelOrder: mockCancelOrder,
} = require("../../services/orderService");

const VENDOR_USER = {
  userId: "u-vendor",
  tenantId: "t-1",
  role: "VENDOR",
  email: "vendor@burgerboulevard.kw",
  vendorId: "v-1",
};

function makeApp(user: Record<string, unknown> | null = VENDOR_USER) {
  const app = express();
  app.use(express.json());
  if (user) {
    app.use((req: any, _res, next) => { req.user = user; next(); });
  }
  app.use("/api/vendor", vendorPortalRouter);
  return app;
}

describe("Vendor portal routes", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // ─── Access control ────────────────────────────────────────────────────────

  test("staff (ADMIN) user is rejected with 403 by rbac(VENDOR)", async () => {
    // No injected user → the auth mock fills its default ADMIN identity.
    const res = await request(makeApp(null)).get("/api/vendor/orders");
    expect(res.status).toBe(403);
  });

  test("VENDOR role without vendorId in the token → 403 from vendorScope", async () => {
    const app = makeApp({ ...VENDOR_USER, vendorId: undefined });
    const res = await request(app).get("/api/vendor/orders");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Vendor account required" });
  });

  // ─── GET /orders ───────────────────────────────────────────────────────────

  describe("GET /api/vendor/orders", () => {
    test("is ALWAYS scoped to the JWT vendorId — query-param vendorId is ignored", async () => {
      prisma.deliveryOrder.findMany.mockResolvedValueOnce([]);
      prisma.deliveryOrder.count.mockResolvedValueOnce(0);

      const res = await request(makeApp()).get(
        "/api/vendor/orders?vendorId=v-SOMEONE-ELSE&tenantId=t-EVIL"
      );

      expect(res.status).toBe(200);
      expect(prisma.deliveryOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "t-1", vendorId: "v-1" }),
        })
      );
      const where = prisma.deliveryOrder.findMany.mock.calls[0][0].where;
      expect(where.vendorId).toBe("v-1");
      expect(where.tenantId).toBe("t-1");
    });

    test("?status= CSV filter maps to status.in, invalid values dropped", async () => {
      prisma.deliveryOrder.findMany.mockResolvedValueOnce([]);
      prisma.deliveryOrder.count.mockResolvedValueOnce(0);

      await request(makeApp()).get("/api/vendor/orders?status=CREATED,assigned,BOGUS");

      expect(prisma.deliveryOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["CREATED", "ASSIGNED"] },
          }),
        })
      );
    });

    test("returns paginated shape", async () => {
      prisma.deliveryOrder.findMany.mockResolvedValueOnce([
        { id: "o-1", orderNumber: "DRB-BRGB-1", status: "CREATED" },
      ]);
      prisma.deliveryOrder.count.mockResolvedValueOnce(1);

      const res = await request(makeApp()).get("/api/vendor/orders");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toMatchObject({ page: 1, total: 1 });
    });
  });

  // ─── GET /orders/:id ───────────────────────────────────────────────────────

  describe("GET /api/vendor/orders/:id", () => {
    test("404 when the order does not belong to this vendor", async () => {
      prisma.deliveryOrder.findFirst.mockResolvedValueOnce(null);

      const res = await request(makeApp()).get("/api/vendor/orders/o-foreign");

      expect(res.status).toBe(404);
      expect(prisma.deliveryOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "o-foreign", tenantId: "t-1", vendorId: "v-1",
          }),
        })
      );
    });

    test("includes driver and OrderEvent timeline ordered by timestamp", async () => {
      prisma.deliveryOrder.findFirst.mockResolvedValueOnce({
        id: "o-1",
        orderNumber: "DRB-BRGB-1",
        status: "ASSIGNED",
        driver: { id: "d-1", name: "Qadir", phone: "+96550000000" },
      });
      prisma.orderEvent.findMany.mockResolvedValueOnce([
        { id: "e-1", action: "order.created", timestamp: "2026-07-19T10:00:00Z" },
        { id: "e-2", action: "order.assigned", timestamp: "2026-07-19T10:01:00Z" },
      ]);

      const res = await request(makeApp()).get("/api/vendor/orders/o-1");

      expect(res.status).toBe(200);
      expect(res.body.driver).toMatchObject({ name: "Qadir", phone: "+96550000000" });
      expect(res.body.timeline).toHaveLength(2);
      expect(prisma.orderEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "t-1", orderId: "o-1" },
          orderBy: { timestamp: "asc" },
        })
      );
    });
  });

  // ─── Order service wiring (darb2-integration: former 501 stubs) ────────────

  describe("POST /api/vendor/orders", () => {
    beforeEach(() => {
      mockCreateDeliveryOrder.mockReset();
      mockCancelOrder.mockReset();
    });

    test("calls createDeliveryOrder with vendorId from the JWT (body vendorId ignored), source VENDOR_PORTAL", async () => {
      mockCreateDeliveryOrder.mockResolvedValueOnce({
        id: "o-new", orderNumber: "DRB-BRGB-0001", status: "DISPATCHING",
      });

      const res = await request(makeApp())
        .post("/api/vendor/orders")
        .send({
          vendorId: "v-SOMEONE-ELSE", // stripped by the schema, ignored by the handler
          branchId: "b-1",
          paymentMethod: "COD",
          orderTotalKwd: "5.000",
          customerName: "Abdullah",
          dropoff: { lat: 29.33, lng: 48.07 },
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: "o-new", status: "DISPATCHING" });
      expect(mockCreateDeliveryOrder).toHaveBeenCalledTimes(1);
      expect(mockCreateDeliveryOrder.mock.calls[0][0]).toMatchObject({
        tenantId: "t-1",
        vendorId: "v-1",
        source: "VENDOR_PORTAL",
        branchId: "b-1",
        paymentMethod: "COD",
        orderTotalKwd: "5.000",
        actor: expect.objectContaining({ type: "VENDOR" }),
      });
    });

    test("400 on schema violations (missing branchId)", async () => {
      const res = await request(makeApp())
        .post("/api/vendor/orders")
        .send({ paymentMethod: "COD", orderTotalKwd: "5.000", dropoff: {} });
      expect(res.status).toBe(400);
      expect(mockCreateDeliveryOrder).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/vendor/orders/:id/cancel", () => {
    beforeEach(() => {
      mockCreateDeliveryOrder.mockReset();
      mockCancelOrder.mockReset();
    });

    test("404 for an order that does not belong to this vendor — cancelOrder never called", async () => {
      prisma.deliveryOrder.findFirst.mockResolvedValueOnce(null);

      const res = await request(makeApp())
        .post("/api/vendor/orders/o-foreign/cancel")
        .send({ reason: "changed mind" });

      expect(res.status).toBe(404);
      expect(mockCancelOrder).not.toHaveBeenCalled();
      expect(prisma.deliveryOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "o-foreign", tenantId: "t-1", vendorId: "v-1",
          }),
        })
      );
    });

    test("owned order → cancelOrder with the pre-pickup allowFrom set + VENDOR actor", async () => {
      prisma.deliveryOrder.findFirst.mockResolvedValueOnce({ id: "o-1" });
      mockCancelOrder.mockResolvedValueOnce({ id: "o-1", status: "CANCELLED" });

      const res = await request(makeApp())
        .post("/api/vendor/orders/o-1/cancel")
        .send({ reason: "changed mind" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: "o-1", status: "CANCELLED" });
      expect(mockCancelOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t-1",
          orderId: "o-1",
          reason: "changed mind",
          allowFrom: ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED"],
          actor: expect.objectContaining({ type: "VENDOR" }),
        })
      );
    });

    test("state conflict from the service maps to 409", async () => {
      prisma.deliveryOrder.findFirst.mockResolvedValueOnce({ id: "o-1" });
      mockCancelOrder.mockRejectedValueOnce(
        new OrderStateConflictError("o-1", "PICKED_UP", "CANCELLED")
      );

      const res = await request(makeApp())
        .post("/api/vendor/orders/o-1/cancel")
        .send({ reason: "too late" });

      expect(res.status).toBe(409);
    });
  });

  // ─── POST /pause ───────────────────────────────────────────────────────────

  describe("POST /api/vendor/pause", () => {
    test("updates Vendor.isPaused scoped by JWT vendor + tenant", async () => {
      prisma.vendor.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(makeApp())
        .post("/api/vendor/pause")
        .send({ paused: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, isPaused: true });
      expect(prisma.vendor.updateMany).toHaveBeenCalledWith({
        where: { id: "v-1", tenantId: "t-1" },
        data: { isPaused: true },
      });
    });

    test("400 when paused is not a boolean", async () => {
      const res = await request(makeApp())
        .post("/api/vendor/pause")
        .send({ paused: "yes" });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });
  });

  // ─── Wallet ────────────────────────────────────────────────────────────────

  describe("wallet endpoints", () => {
    test("GET /wallet serializes balance as 3dp string and defaults to 0.000", async () => {
      prisma.walletAccount.findFirst.mockResolvedValueOnce(null);

      const res = await request(makeApp()).get("/api/vendor/wallet");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ownerKey: "VENDOR:v-1",
        balanceKwd: "0.000",
        accountId: null,
        // PRD §11 credit line fields (no vendor row mocked ⇒ no cap).
        creditCapKwd: null,
        creditUsedKwd: "0.000",
      });
      expect(prisma.walletAccount.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "t-1", ownerKey: "VENDOR:v-1" },
        })
      );
    });

    test("GET /wallet/entries applies the ?month=YYYY-MM window", async () => {
      prisma.walletAccount.findFirst.mockResolvedValueOnce({ id: "acc-1" });
      prisma.walletEntry.findMany.mockResolvedValueOnce([
        {
          id: "we-1", direction: "CREDIT", amountKwd: 4, runningBalanceKwd: 4,
          createdAt: "2026-07-01T00:00:00Z",
          transaction: { id: "tx-1", type: "COD_SETTLEMENT", memo: null, orderId: "o-1" },
        },
      ]);
      prisma.walletEntry.count.mockResolvedValueOnce(1);
      // WalletTransaction has no order relation, so the route resolves the
      // numbers itself. Without this the ledger prints raw UUIDs.
      prisma.deliveryOrder.findMany.mockResolvedValueOnce([
        { id: "o-1", orderNumber: "DRB-DWPH-0130" },
      ]);

      const res = await request(makeApp()).get("/api/vendor/wallet/entries?month=2026-07");

      expect(res.status).toBe(200);
      expect(res.body.data[0]).toMatchObject({
        amountKwd: "4.000",
        runningBalanceKwd: "4.000",
      });
      // The merchant sees the order number they know, not the id.
      expect(res.body.data[0].transaction.order).toEqual({ orderNumber: "DRB-DWPH-0130" });
      // Scoped to this vendor: an id from someone else's ledger resolves to
      // nothing rather than leaking a number across tenants.
      expect(prisma.deliveryOrder.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["o-1"] }, tenantId: "t-1", vendorId: "v-1" },
        select: { id: true, orderNumber: true },
      });
      const where = prisma.walletEntry.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ tenantId: "t-1", accountId: "acc-1" });
      expect(where.createdAt.gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
      expect(where.createdAt.lt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    });

    test("GET /wallet/entries rejects a malformed month", async () => {
      prisma.walletAccount.findFirst.mockResolvedValueOnce({ id: "acc-1" });
      const res = await request(makeApp()).get("/api/vendor/wallet/entries?month=July");
      expect(res.status).toBe(400);
    });
  });

  // ─── Branches ──────────────────────────────────────────────────────────────

  test("GET /branches is vendor-scoped", async () => {
    prisma.vendorBranch.findMany.mockResolvedValueOnce([]);

    const res = await request(makeApp()).get("/api/vendor/branches");

    expect(res.status).toBe(200);
    expect(prisma.vendorBranch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t-1", vendorId: "v-1" },
      })
    );
  });
});
