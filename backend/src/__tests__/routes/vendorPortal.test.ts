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
import { Prisma } from "../../generated/prisma";
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
prisma.vendorBranch = prisma.vendorBranch ?? { findMany: jest.fn(), updateMany: jest.fn() };
prisma.vendorBranch.updateMany = prisma.vendorBranch.updateMany ?? jest.fn();
// Revision 10 (#6) — the tab gate reads the caller's row on every request
// rather than trusting the JWT, the same way requireSuperAdmin does. Every
// route on this router goes through it, so the delegate has to exist.
prisma.user = prisma.user ?? {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
// Revision 10 (#2) — top-ups.
prisma.vendorTopUp = prisma.vendorTopUp ?? {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  updateMany: jest.fn(),
};
// getVendorBranchBalances aggregates over the ledger in one grouped raw query.
prisma.$queryRaw = prisma.$queryRaw ?? jest.fn();

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

/** Money the way Prisma hands it back: a Decimal, not a JS number. */
const D = (v: string | number) => new Prisma.Decimal(v);

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
    // No per-user override: every login falls back to its role's own tabs,
    // which is what each of these tests was written against. Individual tests
    // override this to exercise a narrowed tab list.
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([]);
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
      // Not `Once`: the route also asks for the per-branch breakdown and the
      // top-up suggestion, and both look the account up themselves.
      prisma.walletAccount.findFirst.mockResolvedValue(null);
      prisma.vendorBranch.findMany.mockResolvedValue([]);
      prisma.deliveryOrder.findMany.mockResolvedValue([]);

      const res = await request(makeApp()).get("/api/vendor/wallet");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ownerKey: "VENDOR:v-1",
        balanceKwd: "0.000",
        accountId: null,
        // Revision 10 (#3): the figure the card shows for whatever the branch
        // pills are on. No ?branchId ⇒ the combined total.
        scopedBalanceKwd: "0.000",
        scopedBranchId: null,
        branchBalances: {},
        unallocatedKwd: "0.000",
        // Revision 11 (#2): what the unallocated figure is made of. Empty here
        // because there is no account, so there is nothing to explain.
        unallocatedByType: {},
        // Revision 10 (#2): the prefill for the top-up field. Nothing owed and
        // no delivery history ⇒ the KD 10 floor.
        suggestedTopUpKwd: "10.000",
        outstandingKwd: "0.000",
        // PRD §11 credit line fields (no vendor row mocked ⇒ no cap).
        creditCapKwd: null,
        creditUsedKwd: "0.000",
        // Revision 8 (#5): headroom and the suspension flag. Both null/false
        // with no cap configured, which is the "no credit line" case.
        creditRemainingKwd: null,
        creditSuspended: false,
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

  // ─── Revision 10 ───────────────────────────────────────────────────────────

  describe("per-branch pause (revision 10, #7)", () => {
    test("a branchId pauses that branch alone and never touches the vendor row", async () => {
      prisma.vendorBranch.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(makeApp())
        .post("/api/vendor/pause")
        .send({ paused: true, branchId: "b-2" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, branchId: "b-2", isPaused: true });
      expect(prisma.vendorBranch.updateMany).toHaveBeenCalledWith({
        where: { id: "b-2", tenantId: "t-1", vendorId: "v-1" },
        data: { isPaused: true },
      });
      // The whole point of the edit: one counter closing must not close the shop.
      expect(prisma.vendor.updateMany).not.toHaveBeenCalled();
    });

    test("a branch belonging to another shop is a 404, not somebody else's pause", async () => {
      prisma.vendorBranch.updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await request(makeApp())
        .post("/api/vendor/pause")
        .send({ paused: true, branchId: "b-elsewhere" });

      expect(res.status).toBe(404);
    });

    test("resuming the account clears the branch flags too", async () => {
      prisma.vendor.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.vendorBranch.updateMany.mockResolvedValueOnce({ count: 2 });

      const res = await request(makeApp()).post("/api/vendor/pause").send({ paused: false });

      expect(res.status).toBe(200);
      // Otherwise a branch paused last week keeps refusing orders with no
      // switch anywhere showing why.
      expect(prisma.vendorBranch.updateMany).toHaveBeenCalledWith({
        where: { tenantId: "t-1", vendorId: "v-1", isPaused: true },
        data: { isPaused: false },
      });
    });

    test("pausing the account leaves the branch flags alone", async () => {
      prisma.vendor.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(makeApp()).post("/api/vendor/pause").send({ paused: true });

      expect(res.status).toBe(200);
      expect(prisma.vendorBranch.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("per-user tab access (revision 10, #6)", () => {
    test("a narrowed tab list closes the endpoint, not just the rail entry", async () => {
      // An owner took WALLET away from this login. The tabs come from the row,
      // not the token, so an already-issued JWT cannot outlive the change.
      prisma.user.findFirst.mockResolvedValue({
        vendorRole: "OWNER",
        vendorTabs: ["ORDERS", "SUPPORT"],
      });

      const res = await request(makeApp()).get("/api/vendor/wallet");

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "This tab is not part of your access" });
      // Refused before any query ran, so a fenced login never reaches the data.
      expect(prisma.walletAccount.findFirst).not.toHaveBeenCalled();
    });

    test("a tab the list grants stays open even when the role would not give it", async () => {
      // ORDER_TRACKING has no WALLET tab by default. An owner granting it is a
      // decision about their own staff and their own money, and it holds.
      prisma.user.findFirst.mockResolvedValue({
        vendorRole: "ORDER_TRACKING",
        vendorTabs: ["ORDERS", "WALLET", "SUPPORT"],
      });
      prisma.walletAccount.findFirst.mockResolvedValue(null);
      prisma.vendorBranch.findMany.mockResolvedValue([]);
      prisma.deliveryOrder.findMany.mockResolvedValue([]);

      const res = await request(
        makeApp({ ...VENDOR_USER, vendorRole: "ORDER_TRACKING" }),
      ).get("/api/vendor/wallet");

      expect(res.status).toBe(200);
    });

    test("no override falls back to the role's own tabs — a tracker still sees no money", async () => {
      prisma.user.findFirst.mockResolvedValue({ vendorRole: "ORDER_TRACKING", vendorTabs: null });

      const res = await request(
        makeApp({ ...VENDOR_USER, vendorRole: "ORDER_TRACKING" }),
      ).get("/api/vendor/wallet");

      expect(res.status).toBe(403);
    });

    test("GET /me hands the caller its own effective tab list", async () => {
      prisma.vendor.findFirst.mockResolvedValueOnce({ id: "v-1", name: "Al Dawaa", branches: [] });
      prisma.user.findFirst.mockResolvedValue({ vendorRole: "FINANCE", vendorTabs: null });

      const res = await request(makeApp()).get("/api/vendor/me");

      expect(res.status).toBe(200);
      // The rail and the route fence read this instead of deriving access from
      // vendorRole, which is what made a narrowed list invisible until it 403'd.
      expect(res.body.portalTabs).toEqual(["ORDERS", "WALLET", "GROW", "SUPPORT"]);
    });
  });

  describe("branch-aware wallet balance (revision 10, #3)", () => {
    test("?branchId= scopes the figure to that branch, leaving the account total intact", async () => {
      prisma.walletAccount.findFirst.mockResolvedValue({ id: "acc-1", balanceKwd: D(-12.5) });
      prisma.vendorBranch.findMany.mockResolvedValue([{ id: "b-1" }, { id: "b-2" }]);
      prisma.deliveryOrder.findMany.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue([
        { branchId: "b-1", direction: "DEBIT", total: 10 },
        { branchId: "b-2", direction: "DEBIT", total: 2.5 },
      ]);

      const res = await request(makeApp()).get("/api/vendor/wallet?branchId=b-2");

      expect(res.status).toBe(200);
      // The bug the client reported: both branches printed the account total.
      expect(res.body.balanceKwd).toBe("-12.500");
      expect(res.body.scopedBalanceKwd).toBe("-2.500");
      expect(res.body.scopedBranchId).toBe("b-2");
      expect(res.body.branchBalances).toEqual({ "b-1": "-10.000", "b-2": "-2.500" });
    });

    test("a branch with no movement reads 0.000, not the shop's total", async () => {
      prisma.walletAccount.findFirst.mockResolvedValue({ id: "acc-1", balanceKwd: D(-12.5) });
      prisma.vendorBranch.findMany.mockResolvedValue([{ id: "b-1" }, { id: "b-quiet" }]);
      prisma.deliveryOrder.findMany.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue([{ branchId: "b-1", direction: "DEBIT", total: 12.5 }]);

      const res = await request(makeApp()).get("/api/vendor/wallet?branchId=b-quiet");

      expect(res.status).toBe(200);
      expect(res.body.scopedBalanceKwd).toBe("0.000");
    });

    test("postings with no order are reported as unallocated so the figures reconcile", async () => {
      prisma.walletAccount.findFirst.mockResolvedValue({ id: "acc-1", balanceKwd: D(5) });
      prisma.vendorBranch.findMany.mockResolvedValue([{ id: "b-1" }]);
      prisma.deliveryOrder.findMany.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue([
        { branchId: "b-1", direction: "DEBIT", total: 3 },
        { branchId: null, direction: "CREDIT", total: 8 },
      ]);

      const res = await request(makeApp()).get("/api/vendor/wallet");

      expect(res.status).toBe(200);
      expect(res.body.branchBalances).toEqual({ "b-1": "-3.000" });
      // A top-up belongs to the shop, not to a counter. Named rather than
      // hidden, so branch figures plus this equal the total.
      expect(res.body.unallocatedKwd).toBe("8.000");
    });
  });

  describe("cancelling a support request (revision 10, #5)", () => {
    beforeEach(() => {
      prisma.supportTicket = prisma.supportTicket ?? {
        findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn(), create: jest.fn(),
        findMany: jest.fn(),
      };
      prisma.supportTicketMessage = prisma.supportTicketMessage ?? { create: jest.fn() };
      for (const fn of [
        ...Object.values(prisma.supportTicket),
        ...Object.values(prisma.supportTicketMessage),
      ]) {
        if (typeof fn === "function" && "mockReset" in fn) (fn as jest.Mock).mockReset();
      }
    });

    test("an open request becomes CANCELLED, with a note saying the shop withdrew it", async () => {
      prisma.supportTicket.findFirst
        .mockResolvedValueOnce({ id: "tk-1", status: "OPEN" })
        .mockResolvedValueOnce({ id: "tk-1", status: "CANCELLED", messages: [] });
      prisma.supportTicket.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.supportTicketMessage.create.mockResolvedValueOnce({});

      const res = await request(makeApp())
        .post("/api/vendor/support/tk-1/cancel")
        .send({ reason: "Driver turned up after all" });

      expect(res.status).toBe(200);
      // Status-guarded like every other transition here: two people cancelling
      // at once must not both win.
      expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
        where: {
          id: "tk-1", tenantId: "t-1", vendorId: "v-1",
          status: { in: ["OPEN", "ANSWERED"] },
        },
        data: { status: "CANCELLED" },
      });
      expect(prisma.supportTicketMessage.create.mock.calls[0][0].data.body).toContain(
        "Driver turned up after all",
      );
    });

    test("a request Darb already resolved cannot be withdrawn", async () => {
      prisma.supportTicket.findFirst.mockResolvedValueOnce({ id: "tk-9", status: "RESOLVED" });

      const res = await request(makeApp()).post("/api/vendor/support/tk-9/cancel").send({});

      expect(res.status).toBe(409);
      expect(prisma.supportTicket.updateMany).not.toHaveBeenCalled();
    });

    test("another shop's request is a plain 404", async () => {
      prisma.supportTicket.findFirst.mockResolvedValueOnce(null);

      const res = await request(makeApp()).post("/api/vendor/support/tk-x/cancel").send({});

      expect(res.status).toBe(404);
    });
  });
});
