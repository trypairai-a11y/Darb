// Darb 2.0 revision 14 — the CASH tab's fence, and the staff confirm gate.
//
// Contract under test:
//   1. CASH is a fleet-portal tab like any other. A FINANCE login opens it; an
//      OPERATIONS login is refused with TAB_NOT_GRANTED, so the portal draws a
//      padlock instead of a 403 screen.
//   2. Identity is read from the User row on every request, never from the
//      JWT. A token minted before an owner narrowed somebody must not keep
//      opening the screens they lost.
//   3. Submitting a deposit creates a PENDING row and credits NOTHING. The
//      accountant's confirmation is the only thing that moves a balance, and
//      this endpoint must never be the second one.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.fleetPartner = prisma.fleetPartner ?? { findFirst: jest.fn(), findMany: jest.fn() };
prisma.fleetCashDeposit = prisma.fleetCashDeposit ?? {
  create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(),
  updateMany: jest.fn(), count: jest.fn(), aggregate: jest.fn(),
};
prisma.walletAccount = prisma.walletAccount ?? {
  upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
  findFirst: jest.fn(), findMany: jest.fn(),
};
prisma.walletTransaction = prisma.walletTransaction ?? {
  create: jest.fn(), findFirst: jest.fn(),
};
prisma.remittance = prisma.remittance ?? { create: jest.fn(), findMany: jest.fn() };
prisma.driver = prisma.driver ?? { findMany: jest.fn(), findFirst: jest.fn() };
prisma.user = prisma.user ?? {
  findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(),
};

jest.mock("../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/notificationService", () => ({
  createViolationNotifications: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Revision 14b — the link is built from the portal base URL, so a deploy with
 * none produces a deposit with a null paymentUrl: a Pay button that goes
 * nowhere. Production sets it; the test sets it too, because asserting against
 * the null would have locked in the broken shape as though it were expected.
 */
process.env.PUBLIC_PORTAL_BASE_URL = "https://darbkw.vercel.app";

import fleetPortalRouter from "../../routes/fleetPortal";

const FLEET_USER = {
  userId: "u-fleet",
  tenantId: "t-1",
  role: "FLEET",
  email: "finance@sidra.kw",
  fleetPartnerId: "f-1",
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = { ...FLEET_USER }; next(); });
  app.use("/api/fleet", fleetPortalRouter);
  return app;
}

/** What loadFleetIdentity reads. The row is the authority, not the token. */
function identity(fleetRole: string, fleetTabs: string[] | null = null) {
  prisma.user.findFirst.mockResolvedValue({
    fleetRole, fleetTabs, fleetPartnerIds: null, isActive: true, name: "Portal user",
  });
}

beforeEach(() => {
  resetAllMocks();
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  prisma.fleetPartner.findFirst.mockResolvedValue({ id: "f-1", name: "Sidra Delivery Co" });
  prisma.driver.findMany.mockResolvedValue([]);
  prisma.walletAccount.findMany.mockResolvedValue([]);
  prisma.walletAccount.findFirst.mockResolvedValue(null);
  prisma.fleetCashDeposit.aggregate.mockResolvedValue({ _sum: { amountKwd: null } });
  prisma.fleetCashDeposit.findMany.mockResolvedValue([]);
  prisma.fleetCashDeposit.count.mockResolvedValue(0);
});

describe("The CASH tab fence", () => {
  test("a FINANCE login opens it", async () => {
    identity("FINANCE");
    const res = await request(makeApp()).get("/api/fleet/cash");
    expect(res.status).toBe(200);
    expect(res.body.balanceKwd).toBe("0.000");
  });

  test("an OWNER login opens it", async () => {
    identity("OWNER");
    const res = await request(makeApp()).get("/api/fleet/cash");
    expect(res.status).toBe(200);
  });

  test("an OPERATIONS login is locked out, with the code the padlock needs", async () => {
    identity("OPERATIONS");
    const res = await request(makeApp()).get("/api/fleet/cash");
    expect(res.status).toBe(403);
    // Without this code the portal is back to guessing "not your tab" from a
    // URL, which is what revision 11 (#7) settled.
    expect(res.body.code).toBe("TAB_NOT_GRANTED");
    expect(res.body.tab).toBe("CASH");
  });

  test("an owner may grant CASH to an operations login through the override", async () => {
    // The override REPLACES the role default, which is what makes "who in my
    // own company settles drivers" the owner's decision rather than Darb's.
    identity("OPERATIONS", ["ROSTER", "CASH"]);
    const res = await request(makeApp()).get("/api/fleet/cash");
    expect(res.status).toBe(200);
  });

  test("settling is fenced on the same tab", async () => {
    identity("OPERATIONS");
    const res = await request(makeApp())
      .post("/api/fleet/cash/settle")
      .send({ lines: [{ driverId: "d-1", amountKwd: "10.000" }] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TAB_NOT_GRANTED");
    expect(prisma.remittance.create).not.toHaveBeenCalled();
  });
});

describe("Submitting a deposit", () => {
  test("creates a PENDING row with a payment link, and credits nothing", async () => {
    identity("FINANCE");
    prisma.fleetCashDeposit.create.mockImplementation(async ({ data }: any) => ({
      id: "dep-1",
      note: null,
      receiptUrl: null,
      status: "PENDING",
      rejectReason: null,
      confirmedAt: null,
      createdAt: new Date(),
      ...data,
    }));

    const res = await request(makeApp())
      .post("/api/fleet/cash/deposits")
      .send({ amountKwd: "500", note: "NBK transfer" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.reference).toMatch(/^DEP-[0-9A-F]{6}$/);
    // Revision 14b — the link IS the deposit. A response with no link is a
    // button that does nothing, which is what the client reported.
    expect(res.body.paymentUrl).toMatch(/\/pay\/[a-f0-9]{32}$/);
    // The whole point of the two-step: creating a link is not being paid.
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.fleetCashDeposit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fleetPartnerId: "f-1",
          requestedById: "u-fleet",
          // 128-bit, the only credential on the public /api/pay surface.
          token: expect.stringMatching(/^[a-f0-9]{32}$/),
          provider: "MANUAL",
        }),
      }),
    );
  });

  test("no method is required any more: the rail is the link", async () => {
    identity("FINANCE");
    prisma.fleetCashDeposit.create.mockImplementation(async ({ data }: any) => ({
      id: "dep-2", note: null, receiptUrl: null, status: "PENDING",
      rejectReason: null, confirmedAt: null, createdAt: new Date(), ...data,
    }));
    const res = await request(makeApp())
      .post("/api/fleet/cash/deposits")
      .send({ amountKwd: "500" });
    expect(res.status).toBe(201);
  });

  test("a zero amount is refused", async () => {
    identity("FINANCE");
    const res = await request(makeApp())
      .post("/api/fleet/cash/deposits")
      .send({ amountKwd: "0" });
    expect(res.status).toBe(400);
    expect(prisma.fleetCashDeposit.create).not.toHaveBeenCalled();
  });
});
