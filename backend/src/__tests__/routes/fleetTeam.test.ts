// Darb 2.0 revision 13 (#6) — the delivery company's own team.
//
// Contract under test:
//   1. Role and tab list come from the User ROW on every request, never from
//      the token. A token minted before an owner narrowed somebody must not
//      keep opening the old screens.
//   2. A refused tab answers with `code: "TAB_NOT_GRANTED"` and names the tab,
//      so the portal can lock that rail entry instead of guessing from a URL.
//   3. Minting and editing a login is OWNER-only whatever the tab list says. A
//      supervisor who could create an owner login could grant themselves
//      everything, so this is the one thing a tab cannot hand over.
//   4. `fleetPartnerIds` is a fence: it intersects with the owner group and can
//      never widen past it.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.fleetPartner = prisma.fleetPartner ?? { findFirst: jest.fn(), findMany: jest.fn() };
prisma.driver = prisma.driver ?? { findMany: jest.fn(), findFirst: jest.fn() };
prisma.fleetChangeRequest = prisma.fleetChangeRequest ?? {
  findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn(),
};
prisma.fleetIssue = prisma.fleetIssue ?? { findMany: jest.fn(), updateMany: jest.fn() };
prisma.fleetPayoutStatement = prisma.fleetPayoutStatement ?? {
  findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(),
};
prisma.user = prisma.user ?? {
  findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(),
  create: jest.fn(), update: jest.fn(),
};
prisma.deliveryOrder = prisma.deliveryOrder ?? { findMany: jest.fn() };
prisma.orderRating = prisma.orderRating ?? { aggregate: jest.fn(), groupBy: jest.fn() };

jest.mock("../../services/notificationService", () => ({
  createViolationNotifications: jest.fn().mockResolvedValue(undefined),
}));
// The roster's ratings and activity are other subsystems' contracts, and this
// suite is about who may reach the roster at all.
jest.mock("../../services/ratingService", () => ({
  getDriverRating: jest.fn().mockResolvedValue({ avg: null, count: 0 }),
}));
jest.mock("../../services/fleet/fleetActivityService", () => ({
  rosterActivity: jest.fn().mockResolvedValue(new Map()),
  driverMonthActivity: jest.fn().mockResolvedValue({
    month: "2026-07", days: [], totalOrders: 0, activeDays: 0, avgPerActiveDay: null,
  }),
}));

import fleetPortalRouter from "../../routes/fleetPortal";

const OWNER_TOKEN = {
  userId: "u-owner",
  tenantId: "t-1",
  role: "FLEET",
  email: "owner@sidra.kw",
  fleetPartnerId: "f-1",
  ownerGroupId: "g-1",
};

function makeApp(user: Record<string, unknown> = OWNER_TOKEN) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = user; next(); });
  app.use("/api/fleet", fleetPortalRouter);
  return app;
}

/** What loadFleetIdentity will read for this caller. */
function identity(row: Record<string, unknown> | null) {
  prisma.user.findFirst.mockResolvedValue(row);
}

const GROUP = [
  { id: "f-1", name: "Sidra Delivery Co" },
  { id: "f-2", name: "Marina Logistics" },
  { id: "f-3", name: "Nakheel Transport" },
];

describe("Fleet portal team and tab access", () => {
  beforeEach(() => {
    resetAllMocks();
    prisma.fleetPartner.findMany.mockResolvedValue(GROUP);
    prisma.fleetPartner.findFirst.mockResolvedValue({ id: "f-1", name: "Sidra Delivery Co" });
    prisma.user.findMany.mockResolvedValue([]);
  });

  // ─── The tab fence ───────────────────────────────────────────────────────

  test("a FINANCE login cannot open the roster, and the refusal names the tab", async () => {
    identity({ fleetRole: "FINANCE", fleetTabs: null, fleetPartnerIds: null, name: "Aisha" });
    const res = await request(makeApp()).get("/api/fleet/drivers");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TAB_NOT_GRANTED");
    expect(res.body.tab).toBe("ROSTER");
    expect(prisma.driver.findMany).not.toHaveBeenCalled();
  });

  test("an OPERATIONS login cannot open payouts", async () => {
    identity({ fleetRole: "OPERATIONS", fleetTabs: null, fleetPartnerIds: null });
    const res = await request(makeApp()).get("/api/fleet/statements");
    expect(res.status).toBe(403);
    expect(res.body.tab).toBe("PAYOUTS");
  });

  test("a per-user tab list widens a role as well as narrowing it", async () => {
    // The owner decided this supervisor may see what the company is paid. That
    // is the company's call about its own staff and its own money.
    identity({ fleetRole: "OPERATIONS", fleetTabs: ["ROSTER", "PAYOUTS"], fleetPartnerIds: null });
    prisma.fleetPayoutStatement.findMany.mockResolvedValue([]);
    const res = await request(makeApp()).get("/api/fleet/statements");
    expect(res.status).toBe(200);
  });

  test("a login with no fleetRole is an owner: nothing needed backfilling", async () => {
    identity({ fleetRole: null, fleetTabs: null, fleetPartnerIds: null });
    prisma.fleetPayoutStatement.findMany.mockResolvedValue([]);
    expect((await request(makeApp()).get("/api/fleet/statements")).status).toBe(200);
  });

  test("the role is read from the row, not the token", async () => {
    // The token says nothing about a role at all, which is what every fleet
    // token minted before revision 13 looks like. The row is what decides.
    identity({ fleetRole: "FINANCE", fleetTabs: null, fleetPartnerIds: null });
    const res = await request(makeApp({ ...OWNER_TOKEN, fleetRole: "OWNER" })).get(
      "/api/fleet/drivers",
    );
    expect(res.status).toBe(403);
  });

  test("/me hands back the caller's own role and tabs", async () => {
    identity({ fleetRole: "OPERATIONS", fleetTabs: null, fleetPartnerIds: null });
    prisma.fleetPartner.findFirst.mockResolvedValue({ id: "f-1", name: "Sidra Delivery Co" });
    const res = await request(makeApp()).get("/api/fleet/me");
    expect(res.status).toBe(200);
    expect(res.body.portalRole).toBe("OPERATIONS");
    expect(res.body.portalTabs).toEqual(["ROSTER", "ISSUES", "DOCUMENTS", "SUPPORT"]);
  });

  // ─── Company scoping is a fence ──────────────────────────────────────────

  test("a login scoped to Marina cannot act as Sidra by asking for it", async () => {
    identity({ fleetRole: "OPERATIONS", fleetTabs: null, fleetPartnerIds: ["f-2"] });
    prisma.driver.findMany.mockResolvedValue([]);
    prisma.fleetChangeRequest.findMany.mockResolvedValue([]);

    const res = await request(makeApp()).get("/api/fleet/drivers?fleetPartnerId=f-1");
    expect(res.status).toBe(200);
    expect(prisma.driver.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ fleetPartnerId: "f-2" }),
      }),
    );
  });

  test("the company switcher lists only what the login may act for", async () => {
    identity({ fleetRole: "OPERATIONS", fleetTabs: null, fleetPartnerIds: ["f-2", "f-3"] });
    const res = await request(makeApp()).get("/api/fleet/companies");
    expect(res.status).toBe(200);
    expect(res.body.partners.map((p: any) => p.id)).toEqual(["f-2", "f-3"]);
  });

  // ─── Minting a login is the owner's alone ────────────────────────────────

  test("an OPERATIONS login granted the TEAM tab may read it but not add anyone", async () => {
    identity({ fleetRole: "OPERATIONS", fleetTabs: ["ROSTER", "TEAM"], fleetPartnerIds: null });

    const read = await request(makeApp()).get("/api/fleet/team");
    expect(read.status).toBe(200);

    const write = await request(makeApp())
      .post("/api/fleet/team")
      .send({
        name: "New Person", email: "new@sidra.kw", password: "longenough1",
        fleetRole: "OWNER",
      });
    expect(write.status).toBe(403);
    // And crucially no code: this is a role refusal, not a lost tab. Confusing
    // the two would lock the Team entry in the rail for somebody who has it.
    expect(write.body.code).toBeUndefined();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("an owner creates a login scoped to two of the three companies", async () => {
    identity({ fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: "u-new", createdAt: new Date(), isActive: true, ...data,
    }));

    const res = await request(makeApp())
      .post("/api/fleet/team")
      .send({
        name: "Rania", email: "rania@sidra.kw", password: "longenough1",
        fleetRole: "FINANCE", fleetPartnerIds: ["f-2", "f-3"],
      });

    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "FLEET",
          fleetRole: "FINANCE",
          fleetPartnerIds: ["f-2", "f-3"],
          ownerGroupId: "g-1",
        }),
      }),
    );
  });

  test("a company outside the group is dropped, never added", async () => {
    identity({ fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: "u-new", createdAt: new Date(), isActive: true, ...data,
    }));

    await request(makeApp())
      .post("/api/fleet/team")
      .send({
        name: "Rania", email: "rania@sidra.kw", password: "longenough1",
        fleetRole: "FINANCE", fleetPartnerIds: ["f-2", "f-somebody-elses"],
      });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fleetPartnerIds: ["f-2"] }),
      }),
    );
  });

  test("choosing every company stores 'all', so a new company is inherited", async () => {
    identity({ fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: "u-new", createdAt: new Date(), isActive: true, ...data,
    }));

    await request(makeApp())
      .post("/api/fleet/team")
      .send({
        name: "Rania", email: "rania@sidra.kw", password: "longenough1",
        fleetRole: "OWNER", fleetPartnerIds: ["f-1", "f-2", "f-3"],
      });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fleetPartnerIds: undefined }),
      }),
    );
  });

  test("an owner cannot change their own access", async () => {
    identity({ fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: null });
    const res = await request(makeApp())
      .patch(`/api/fleet/team/${OWNER_TOKEN.userId}`)
      .send({ fleetTabs: [] });
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("a login belonging to another group is a 404, not an edit", async () => {
    identity({ fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: null });
    // The row lookup is scoped to the group's companies, so somebody else's
    // login simply does not match.
    prisma.user.findFirst.mockImplementation(async ({ where }: any) =>
      where?.role === "FLEET" ? null : { fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: null },
    );
    const res = await request(makeApp())
      .patch("/api/fleet/team/u-elsewhere")
      .send({ fleetTabs: ["ROSTER"] });
    expect(res.status).toBe(404);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  // ─── Revision 13c: the fence holds on writes, not only on reads ──────────

  test("a company-scoped owner cannot mint a login for a sibling company", async () => {
    // The escalation this closes: an owner scoped to Marina created an OWNER
    // login for Sidra with a password of their choosing, then signed in as it.
    identity({ fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: ["f-2"] });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: "u-new", createdAt: new Date(), isActive: true, ...data,
    }));

    const res = await request(makeApp())
      .post("/api/fleet/team")
      .send({
        name: "Ghost", email: "ghost@sidra.kw", password: "longenough1",
        fleetRole: "OWNER", fleetPartnerIds: ["f-1"],
      });

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("a scoped owner's new login inherits their fence when they name no company", async () => {
    identity({ fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: ["f-2"] });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: "u-new", createdAt: new Date(), isActive: true, ...data,
    }));

    await request(makeApp())
      .post("/api/fleet/team")
      .send({
        name: "Colleague", email: "c@marina.kw", password: "longenough1",
        fleetRole: "OPERATIONS",
      });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fleetPartnerIds: ["f-2"] }),
      }),
    );
  });

  test("a scope naming only companies that are not the caller's is refused, not widened", async () => {
    // It used to store null, which means EVERY company: one stale id in a
    // cached picker handed a finance login the whole group's payouts.
    identity({ fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: null });
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(makeApp())
      .post("/api/fleet/team")
      .send({
        name: "Rania", email: "rania@sidra.kw", password: "longenough1",
        fleetRole: "FINANCE", fleetPartnerIds: ["f-not-in-this-group"],
      });

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("a deactivated login is refused, without waiting for its token to expire", async () => {
    identity({ fleetRole: "OWNER", fleetTabs: null, fleetPartnerIds: null, isActive: false });
    const res = await request(makeApp()).get("/api/fleet/statements");
    expect(res.status).toBe(403);
  });

  test("a token whose user row is gone gets nothing, not everything", async () => {
    identity(null);
    const res = await request(makeApp()).get("/api/fleet/drivers");
    expect(res.status).toBe(401);
  });
});
