// Darb 2.0 §9 — portal logins for a delivery company (/api/fleets/:id/users).
//
// Contract under test: both the list and the create are ADMIN-only, both
// resolve the fleet through the caller's own tenant first, and the list is
// scoped by that resolved fleet rather than by the id off the URL. Creating a
// login used to be the only half of this pair, and it was reachable only by
// curl; the list is what the fleet detail panel reads.
//
// House pattern: moduleNameMapper routes ../config and ../middleware/{auth,
// tenantScope} to the shared mocks, rbac runs for real, and each test injects
// its own identity through a pre-router middleware.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.fleetPartner = prisma.fleetPartner ?? {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
};
prisma.fleetPartner.findFirst = prisma.fleetPartner.findFirst ?? jest.fn();
prisma.user = prisma.user ?? {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
};
prisma.user.findMany = prisma.user.findMany ?? jest.fn();
prisma.user.findUnique = prisma.user.findUnique ?? jest.fn();
prisma.user.create = prisma.user.create ?? jest.fn();

import fleetsRouter from "../../routes/fleets";

const ADMIN = { userId: "u-1", tenantId: "t-1", role: "ADMIN", email: "a@darb.kw" };
const OPS = { userId: "u-2", tenantId: "t-1", role: "OPS_MANAGER", email: "o@darb.kw" };

function makeApp(user: Record<string, unknown> = ADMIN) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = user; next(); });
  app.use("/api/fleets", fleetsRouter);
  return app;
}

const FLEET = { id: "f-1", tenantId: "t-1", name: "Al Mostaqbal Delivery" };

describe("GET /api/fleets/:id/users", () => {
  beforeEach(() => {
    resetAllMocks();
    jest.clearAllMocks();
  });

  test("returns this fleet's logins, scoped to the caller's tenant", async () => {
    prisma.fleetPartner.findFirst.mockResolvedValue(FLEET);
    prisma.user.findMany.mockResolvedValue([
      { id: "u-f1", email: "ops@almostaqbal.kw", name: "Ops Manager", phone: null, role: "FLEET", isActive: true, createdAt: new Date("2026-07-01") },
    ]);

    const res = await request(makeApp()).get("/api/fleets/f-1/users");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].email).toBe("ops@almostaqbal.kw");
    // The fleet is resolved through the tenant, then the users through the
    // resolved fleet — never straight off req.params.
    expect(prisma.fleetPartner.findFirst).toHaveBeenCalledWith({
      where: { id: "f-1", tenantId: "t-1" },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fleetPartnerId: "f-1", tenantId: "t-1" } }),
    );
  });

  test("never returns the password hash", async () => {
    prisma.fleetPartner.findFirst.mockResolvedValue(FLEET);
    prisma.user.findMany.mockResolvedValue([]);

    await request(makeApp()).get("/api/fleets/f-1/users");

    const select = prisma.user.findMany.mock.calls[0][0].select;
    expect(select.passwordHash).toBeUndefined();
    expect(select.email).toBe(true);
  });

  test("another tenant's fleet id is a 404, not an empty list", async () => {
    // findFirst is tenant-scoped, so a foreign id resolves to nothing. A 200
    // with [] would confirm the id exists; 404 says nothing either way.
    prisma.fleetPartner.findFirst.mockResolvedValue(null);

    const res = await request(makeApp()).get("/api/fleets/f-other/users");

    expect(res.status).toBe(404);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  test("OPS_MANAGER is refused — reading partner staff emails is ADMIN work", async () => {
    const res = await request(makeApp(OPS)).get("/api/fleets/f-1/users");

    expect(res.status).toBe(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/fleets/:id/users", () => {
  beforeEach(() => {
    resetAllMocks();
    jest.clearAllMocks();
  });

  const BODY = {
    name: "Ops Manager",
    email: "ops@almostaqbal.kw",
    password: "hand-over-me",
    phone: "+96550000000",
  };

  test("creates a FLEET login pinned to the fleet and the caller's tenant", async () => {
    prisma.fleetPartner.findFirst.mockResolvedValue(FLEET);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "u-new", ...BODY, role: "FLEET" });

    const res = await request(makeApp()).post("/api/fleets/f-1/users").send(BODY);

    expect(res.status).toBe(201);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.role).toBe("FLEET");
    expect(data.fleetPartnerId).toBe("f-1");
    expect(data.tenantId).toBe("t-1");
    // Hashed, never stored as typed.
    expect(data.passwordHash).toBeDefined();
    expect(data.passwordHash).not.toBe(BODY.password);
  });

  test("a duplicate email is a 400 the panel can show verbatim", async () => {
    prisma.fleetPartner.findFirst.mockResolvedValue(FLEET);
    prisma.user.findUnique.mockResolvedValue({ id: "u-existing" });

    const res = await request(makeApp()).post("/api/fleets/f-1/users").send(BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already registered/i);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("a password under 8 characters is refused before any lookup", async () => {
    prisma.fleetPartner.findFirst.mockResolvedValue(FLEET);

    const res = await request(makeApp())
      .post("/api/fleets/f-1/users")
      .send({ ...BODY, password: "short" });

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("OPS_MANAGER cannot mint a portal login", async () => {
    const res = await request(makeApp(OPS)).post("/api/fleets/f-1/users").send(BODY);

    expect(res.status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
