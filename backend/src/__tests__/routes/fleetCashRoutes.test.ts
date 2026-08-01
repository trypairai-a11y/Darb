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
  test("creates a PENDING row and credits nothing", async () => {
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
      .send({ amountKwd: "500", method: "BANK_TRANSFER", note: "NBK transfer" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.reference).toMatch(/^DEP-[0-9A-F]{6}$/);
    // The whole point of the two-step: submitting is not paying.
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.fleetCashDeposit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fleetPartnerId: "f-1", requestedById: "u-fleet" }),
      }),
    );
  });

  test("a bad method is refused before anything is written", async () => {
    identity("FINANCE");
    const res = await request(makeApp())
      .post("/api/fleet/cash/deposits")
      .send({ amountKwd: "500", method: "CRYPTO" });
    expect(res.status).toBe(400);
    expect(prisma.fleetCashDeposit.create).not.toHaveBeenCalled();
  });

  test("a zero amount is refused", async () => {
    identity("FINANCE");
    const res = await request(makeApp())
      .post("/api/fleet/cash/deposits")
      .send({ amountKwd: "0", method: "CASH" });
    expect(res.status).toBe(400);
    expect(prisma.fleetCashDeposit.create).not.toHaveBeenCalled();
  });
});
