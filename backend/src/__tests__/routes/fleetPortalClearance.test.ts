// Revision 24b — the delivery company sees the two-step termination too.
//
// Contract under test:
//   1. The roster and the driver profile carry `terminationPending`, read the
//      same way as the staff side: TERMINATED and no terminationClearedAt.
//   2. The profile lists the kit still to come back (`equipmentToReturn`): the
//      issued, unreturned DriverInventory rows clearance would mark returned.
//      It is empty for anyone not pending.
//   3. Fleet containment: another company's driver is a 404 and its inventory
//      is never read.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.fleetPartner = prisma.fleetPartner ?? { findFirst: jest.fn(), findMany: jest.fn() };
prisma.driver = prisma.driver ?? { findFirst: jest.fn(), findMany: jest.fn() };
prisma.fleetChangeRequest = prisma.fleetChangeRequest ?? { findMany: jest.fn() };
prisma.fleetIssue = prisma.fleetIssue ?? { findMany: jest.fn() };
prisma.fleetDocument = prisma.fleetDocument ?? { findMany: jest.fn() };
prisma.driverInventory = prisma.driverInventory ?? { findMany: jest.fn() };
prisma.device = prisma.device ?? { findFirst: jest.fn() };
prisma.user = prisma.user ?? { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() };
// The shared stub carries partial entries for some of these; fill the gaps
// per suite rather than widening the shared file.
for (const [model, fns] of Object.entries({
  driver: ["findFirst", "findMany"],
  fleetChangeRequest: ["findMany"],
  fleetIssue: ["findMany"],
  fleetDocument: ["findMany"],
  driverInventory: ["findMany"],
  device: ["findFirst"],
  fleetPartner: ["findFirst", "findMany"],
  user: ["findFirst"],
})) {
  for (const fn of fns) prisma[model][fn] = prisma[model][fn] ?? jest.fn();
}

jest.mock("../../services/notificationService", () => ({
  createViolationNotifications: jest.fn().mockResolvedValue(undefined),
  createSupportNotifications: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/ratingService", () => ({
  getDriverRating: jest.fn().mockResolvedValue({ avg: null, count: 0 }),
}));
jest.mock("../../services/fleet/fleetActivityService", () => ({
  rosterActivity: jest.fn().mockResolvedValue(new Map()),
  driverMonthActivity: jest.fn().mockResolvedValue({
    month: "2026-10", days: [], totalOrders: 0, activeDays: 0, avgPerActiveDay: null,
  }),
}));
jest.mock("../../services/wallet/fleetCashService", () => ({
  ...jest.requireActual("../../services/wallet/fleetCashService"),
  driverCashBalances: jest.fn().mockResolvedValue(new Map()),
}));

import fleetPortalRouter from "../../routes/fleetPortal";

const FLEET_USER = {
  userId: "u-fleet",
  tenantId: "t-1",
  role: "FLEET",
  email: "ops@sidra.kw",
  fleetPartnerId: "f-1",
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = FLEET_USER; next(); });
  app.use("/api/fleet", fleetPortalRouter);
  return app;
}

const BASE_DRIVER = {
  id: "d-1",
  tenantId: "t-1",
  fleetPartnerId: "f-1",
  name: "Abdul Rahman",
  phone: "+96555881284",
  status: "TERMINATED",
  vehicleType: "MOTORCYCLE",
  driverCode: "DRB-0001",
  zone: null,
  hireDate: new Date("2026-01-01"),
  performanceTier: null,
  throttledUntil: null,
  terminatedAt: new Date("2026-10-14T09:00:00Z"),
  terminationClearedAt: null,
};

const INVENTORY = [
  { id: "inv-1", driverId: "d-1", itemType: "BAG", quantity: 1, issued: true, issuedDate: new Date("2026-02-01"), returnedDate: null, condition: "OK", conditionNote: null },
  { id: "inv-2", driverId: "d-1", itemType: "HELMET", quantity: 1, issued: false, issuedDate: new Date("2026-02-01"), returnedDate: new Date("2026-09-01"), condition: "OK", conditionNote: null },
  { id: "inv-3", driverId: "d-1", itemType: "JACKET", quantity: 2, issued: true, issuedDate: null, returnedDate: null, condition: "OK", conditionNote: null },
];

describe("Fleet portal: pending termination clearance", () => {
  beforeEach(() => {
    resetAllMocks();
    prisma.fleetChangeRequest.findMany.mockResolvedValue([]);
    prisma.fleetIssue.findMany.mockResolvedValue([]);
    prisma.fleetDocument.findMany.mockResolvedValue([]);
    prisma.driverInventory.findMany.mockResolvedValue(INVENTORY);
    prisma.device.findFirst.mockResolvedValue(null);
    // An owner login: no narrowed role or tab list.
    prisma.user.findFirst.mockResolvedValue({ fleetRole: null, fleetTabs: null, fleetPartnerIds: null });
  });

  test("the profile reads pending and lists only what is still out", async () => {
    prisma.driver.findFirst.mockResolvedValue(BASE_DRIVER);
    const res = await request(makeApp()).get("/api/fleet/drivers/d-1");
    expect(res.status).toBe(200);
    expect(res.body.driver.terminationPending).toBe(true);
    expect(res.body.driver.terminatedAt).toBe("2026-10-14T09:00:00.000Z");
    expect(res.body.equipmentToReturn).toEqual([
      { id: "inv-1", itemType: "BAG", quantity: 1, issuedDate: "2026-02-01T00:00:00.000Z" },
      { id: "inv-3", itemType: "JACKET", quantity: 2, issuedDate: null },
    ]);
    // The full equipment history is still there beside it.
    expect(res.body.equipment).toHaveLength(3);
  });

  test("a cleared driver is not pending and has nothing to return", async () => {
    prisma.driver.findFirst.mockResolvedValue({
      ...BASE_DRIVER,
      terminationClearedAt: new Date("2026-10-15T08:00:00Z"),
    });
    const res = await request(makeApp()).get("/api/fleet/drivers/d-1");
    expect(res.status).toBe(200);
    expect(res.body.driver.terminationPending).toBe(false);
    expect(res.body.equipmentToReturn).toEqual([]);
  });

  test("an active driver with kit is not pending", async () => {
    prisma.driver.findFirst.mockResolvedValue({ ...BASE_DRIVER, status: "ACTIVE", terminatedAt: null });
    const res = await request(makeApp()).get("/api/fleet/drivers/d-1");
    expect(res.body.driver.terminationPending).toBe(false);
    expect(res.body.equipmentToReturn).toEqual([]);
  });

  test("a driver terminated before revision 24 (no stamps) reads as pending", async () => {
    prisma.driver.findFirst.mockResolvedValue({ ...BASE_DRIVER, terminatedAt: null });
    const res = await request(makeApp()).get("/api/fleet/drivers/d-1");
    expect(res.body.driver.terminationPending).toBe(true);
  });

  test("another company's driver is a 404 and its kit is never read", async () => {
    prisma.driver.findFirst.mockResolvedValue(null);
    const res = await request(makeApp()).get("/api/fleet/drivers/d-other");
    expect(res.status).toBe(404);
    expect(prisma.driver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "t-1", fleetPartnerId: "f-1" }) }),
    );
    expect(prisma.driverInventory.findMany).not.toHaveBeenCalled();
  });

  test("the roster flags pending rows, scoped to the caller's company", async () => {
    prisma.driver.findMany.mockResolvedValue([
      { ...BASE_DRIVER, id: "d-1" },
      { ...BASE_DRIVER, id: "d-2", terminationClearedAt: new Date("2026-10-15T08:00:00Z") },
      { ...BASE_DRIVER, id: "d-3", status: "ACTIVE", terminatedAt: null },
    ]);
    const res = await request(makeApp()).get("/api/fleet/drivers");
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.map((r: any) => [r.id, r.terminationPending]));
    expect(byId).toEqual({ "d-1": true, "d-2": false, "d-3": false });
    expect(prisma.driver.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t-1", fleetPartnerId: "f-1" },
        select: expect.objectContaining({ terminatedAt: true, terminationClearedAt: true }),
      }),
    );
  });
});
