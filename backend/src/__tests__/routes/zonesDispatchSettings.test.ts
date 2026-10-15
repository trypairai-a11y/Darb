// Revision 24b: the busy-driver cap (FulfillmentSettings.maxActiveOrdersPerDriver)
// gets its own narrow endpoint so ops can set it without being handed the
// tenant's fee fields.
//
// Contract under test:
//   1. PUT /api/zones/settings/dispatch accepts ADMIN and OPS_MANAGER, nobody else.
//   2. It writes only maxActiveOrdersPerDriver, scoped to the caller's tenant.
//   3. 1 to 10, whole numbers; anything else (or an extra field) is a 400.
//   4. The full PUT /settings stays ADMIN-only and accepts the same 1..10 range.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
prisma.fulfillmentSettings = prisma.fulfillmentSettings ?? {
  findUnique: jest.fn(),
  upsert: jest.fn(),
};

jest.mock("../../services/zoneService", () => ({
  invalidateZoneCache: jest.fn(),
  resolveZone: jest.fn(),
  rezoneBranches: jest.fn(),
}));
jest.mock("../../services/pricingService", () => ({ quoteDelivery: jest.fn() }));

import zonesRouter from "../../routes/zones";

function makeApp(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: "u-1", tenantId: "t-1", role, email: "x@darb.com" };
    next();
  });
  app.use("/api/zones", zonesRouter);
  return app;
}

describe("PUT /api/zones/settings/dispatch", () => {
  beforeEach(() => {
    resetAllMocks();
    prisma.fulfillmentSettings.upsert.mockImplementation(async (args: any) => ({
      tenantId: "t-1",
      maxActiveOrdersPerDriver: args.update.maxActiveOrdersPerDriver,
    }));
  });

  it.each(["ADMIN", "OPS_MANAGER"])("lets %s set the cap, for its own tenant only", async (role) => {
    const res = await request(makeApp(role))
      .put("/api/zones/settings/dispatch")
      .send({ maxActiveOrdersPerDriver: 4 });
    expect(res.status).toBe(200);
    expect(res.body.maxActiveOrdersPerDriver).toBe(4);
    expect(prisma.fulfillmentSettings.upsert).toHaveBeenCalledWith({
      where: { tenantId: "t-1" },
      update: { maxActiveOrdersPerDriver: 4 },
      create: { tenantId: "t-1", maxActiveOrdersPerDriver: 4 },
    });
  });

  it.each(["SUPERVISOR", "DISPATCHER", "ACCOUNTANT", "VENDOR", "FLEET"])("refuses %s", async (role) => {
    const res = await request(makeApp(role))
      .put("/api/zones/settings/dispatch")
      .send({ maxActiveOrdersPerDriver: 2 });
    expect(res.status).toBe(403);
    expect(prisma.fulfillmentSettings.upsert).not.toHaveBeenCalled();
  });

  it.each([0, 11, 2.5, "3", null])("refuses %p", async (value) => {
    const res = await request(makeApp("OPS_MANAGER"))
      .put("/api/zones/settings/dispatch")
      .send({ maxActiveOrdersPerDriver: value });
    expect(res.status).toBe(400);
    expect(prisma.fulfillmentSettings.upsert).not.toHaveBeenCalled();
  });

  it("accepts both ends of the range", async () => {
    for (const v of [1, 10]) {
      const res = await request(makeApp("OPS_MANAGER"))
        .put("/api/zones/settings/dispatch")
        .send({ maxActiveOrdersPerDriver: v });
      expect(res.status).toBe(200);
    }
  });

  it("will not let ops smuggle a fee through it", async () => {
    const res = await request(makeApp("OPS_MANAGER"))
      .put("/api/zones/settings/dispatch")
      .send({ maxActiveOrdersPerDriver: 3, intraZoneFeeKwd: "0.100" });
    expect(res.status).toBe(400);
    expect(prisma.fulfillmentSettings.upsert).not.toHaveBeenCalled();
  });
});

describe("PUT /api/zones/settings (full)", () => {
  beforeEach(() => {
    resetAllMocks();
    prisma.fulfillmentSettings.upsert.mockResolvedValue({ tenantId: "t-1" });
  });

  it("stays ADMIN-only", async () => {
    const res = await request(makeApp("OPS_MANAGER"))
      .put("/api/zones/settings")
      .send({ maxActiveOrdersPerDriver: 3 });
    expect(res.status).toBe(403);
  });

  it("takes the cap up to 10 and no further", async () => {
    const ok = await request(makeApp("ADMIN")).put("/api/zones/settings").send({ maxActiveOrdersPerDriver: 10 });
    expect(ok.status).toBe(200);
    const tooMany = await request(makeApp("ADMIN")).put("/api/zones/settings").send({ maxActiveOrdersPerDriver: 11 });
    expect(tooMany.status).toBe(400);
  });
});
