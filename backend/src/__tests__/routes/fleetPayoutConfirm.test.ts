// Darb 2.0 revision 13 (#8) — the delivery company confirms its own payout.
//
// Contract under test:
//   1. FINAL -> CONFIRMED is a status-guarded claim. A second confirm is a 409,
//      not a second stamp.
//   2. A dispute needs a reason and opens a support ticket carrying the
//      figures, so the disagreement lands in the inbox Darb already triages.
//   3. Disputing clears the confirmation. Confirm-then-dispute must not leave a
//      statement payable on the strength of the earlier click.
//   4. postFleetPayout refuses anything that is not CONFIRMED. The gate lives
//      in the service, so the cron and a script are bound by it too — and a
//      zero-total statement is the one deliberate exception.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.fleetPartner = prisma.fleetPartner ?? { findFirst: jest.fn(), findMany: jest.fn() };
prisma.fleetPayoutStatement = prisma.fleetPayoutStatement ?? {
  findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
};
prisma.supportTicket = prisma.supportTicket ?? { create: jest.fn() };
prisma.user = prisma.user ?? {
  findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(),
  create: jest.fn(), update: jest.fn(),
};

jest.mock("../../services/notificationService", () => ({
  createViolationNotifications: jest.fn().mockResolvedValue(undefined),
}));

import fleetPortalRouter from "../../routes/fleetPortal";
import { postFleetPayout } from "../../services/fleetService";
import { WalletError } from "../../services/wallet/walletService";

const FLEET_USER = {
  userId: "u-fleet",
  tenantId: "t-1",
  role: "FLEET",
  email: "owner@sidra.kw",
  fleetPartnerId: "f-1",
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = FLEET_USER; next(); });
  app.use("/api/fleet", fleetPortalRouter);
  return app;
}

/** A Decimal-ish stand-in: only the two methods the service actually calls. */
function money(value: number) {
  return {
    lte: (n: number) => value <= n,
    toFixed: (d: number) => value.toFixed(d),
    times: (n: number) => money(value * n),
  };
}

const STATEMENT = {
  id: "st-1",
  tenantId: "t-1",
  fleetPartnerId: "f-1",
  periodStart: new Date("2026-06-01T00:00:00Z"),
  periodEnd: new Date("2026-07-01T00:00:00Z"),
  deliveredOrders: 177,
  feePerOrderKwd: money(1.1),
  totalKwd: money(194.7),
  status: "FINAL",
};

describe("Fleet payout confirmation", () => {
  beforeEach(() => {
    resetAllMocks();
    prisma.fleetPartner.findFirst.mockResolvedValue({ id: "f-1", name: "Sidra Delivery Co" });
    prisma.user.findFirst.mockResolvedValue({
      fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: null, name: "Owner",
    });
  });

  // ─── Confirming ──────────────────────────────────────────────────────────

  test("confirming a FINAL statement stamps who and when", async () => {
    prisma.fleetPayoutStatement.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(makeApp()).post("/api/fleet/statements/st-1/confirm");

    expect(res.status).toBe(200);
    expect(prisma.fleetPayoutStatement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t-1",
          fleetPartnerId: "f-1",
          status: { in: ["FINAL", "DISPUTED"] },
        }),
        data: expect.objectContaining({ status: "CONFIRMED", confirmedById: "u-fleet" }),
      }),
    );
  });

  test("confirming twice is a 409, not a second stamp", async () => {
    prisma.fleetPayoutStatement.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(makeApp()).post("/api/fleet/statements/st-1/confirm");
    expect(res.status).toBe(409);
  });

  test("another fleet's statement simply does not match", async () => {
    prisma.fleetPayoutStatement.updateMany.mockResolvedValue({ count: 0 });
    await request(makeApp()).post("/api/fleet/statements/st-elsewhere/confirm");
    expect(prisma.fleetPayoutStatement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ fleetPartnerId: "f-1" }),
      }),
    );
  });

  // ─── Disputing ───────────────────────────────────────────────────────────

  test("a dispute with no real reason is refused", async () => {
    const res = await request(makeApp())
      .post("/api/fleet/statements/st-1/dispute")
      .send({ reason: "wrong" });
    expect(res.status).toBe(400);
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  test("a dispute opens a Payout ticket carrying the figures, and clears the confirmation", async () => {
    prisma.fleetPayoutStatement.findFirst.mockResolvedValue(STATEMENT);
    prisma.supportTicket.create.mockResolvedValue({ id: "tk-1" });
    prisma.fleetPayoutStatement.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(makeApp())
      .post("/api/fleet/statements/st-1/dispute")
      .send({ reason: "Eleven orders on the 14th are missing from the count." });

    expect(res.status).toBe(201);
    expect(prisma.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fleetPartnerId: "f-1",
          vendorId: null,
          // The enum stays WALLET; only the fleet portal's label says Payout.
          type: "WALLET",
          subject: "Payout query: 2026-06",
        }),
      }),
    );
    expect(prisma.fleetPayoutStatement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DISPUTED",
          disputeTicketId: "tk-1",
          confirmedAt: null,
          confirmedById: null,
        }),
      }),
    );
  });

  test("a paid statement cannot be disputed after the fact", async () => {
    prisma.fleetPayoutStatement.findFirst.mockResolvedValue({ ...STATEMENT, status: "PAID" });
    const res = await request(makeApp())
      .post("/api/fleet/statements/st-1/dispute")
      .send({ reason: "This month was short by eleven orders." });
    expect(res.status).toBe(409);
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  // ─── The gate that actually stops a payment ──────────────────────────────

  describe("postFleetPayout", () => {
    beforeEach(() => {
      // The service runs everything inside one transaction; hand it the same
      // stub so the assertions read the calls it makes.
      prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    });

    test("refuses an unconfirmed statement", async () => {
      prisma.fleetPayoutStatement.findFirst.mockResolvedValue(STATEMENT);
      await expect(
        postFleetPayout({ tenantId: "t-1", statementId: "st-1", actorId: "u-1" }),
      ).rejects.toBeInstanceOf(WalletError);
      expect(prisma.fleetPayoutStatement.update).not.toHaveBeenCalled();
    });

    test("refuses a disputed statement, and says so differently", async () => {
      prisma.fleetPayoutStatement.findFirst.mockResolvedValue({
        ...STATEMENT,
        status: "DISPUTED",
      });
      await expect(
        postFleetPayout({ tenantId: "t-1", statementId: "st-1", actorId: "u-1" }),
      ).rejects.toThrow(/disputed/i);
    });

    test("a zero-total statement still pays with no confirmation", async () => {
      // Nothing to disagree with about KD 0.000, and holding a payroll run open
      // for it would be theatre.
      prisma.fleetPayoutStatement.findFirst.mockResolvedValue({
        ...STATEMENT,
        status: "FINAL",
        deliveredOrders: 0,
        totalKwd: money(0),
      });
      const res = await postFleetPayout({
        tenantId: "t-1", statementId: "st-1", actorId: "u-1",
      });
      expect(res).toBeNull();
      expect(prisma.fleetPayoutStatement.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "PAID" } }),
      );
    });
  });
});
