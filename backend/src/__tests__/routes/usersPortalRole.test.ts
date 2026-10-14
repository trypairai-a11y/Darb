// Revision 24 (#2) — Admin › Users: the Role column is unique per portal.
//
// Contract under test:
//   1. An HQ staff role cannot be written onto a shop or company login (it
//      would lift the login out of its portal's containment).
//   2. VENDOR/FLEET cannot be given to an HQ login from this list.
//   3. A portal login's role goes through `portalRole`, into vendorRole or
//      fleetRole by the login's portal.
//   4. The last active owner of a shop or company cannot be moved off owner.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

jest.mock("../../services/inviteService", () => ({ createInvite: jest.fn(), emailInvite: jest.fn() }));
jest.mock("../../services/permissionService", () => ({
  APP_SURFACES: ["PEOPLE"],
  defaultsForRole: jest.fn().mockReturnValue({}),
  managedVendorIds: jest.fn().mockResolvedValue([]),
  resolvePermissions: jest.fn().mockResolvedValue({}),
  can: jest.fn().mockResolvedValue(true),
}));

const prisma = getMockPrisma();
prisma.user = prisma.user ?? {};
prisma.user.findFirst = jest.fn();
prisma.user.findMany = jest.fn();
prisma.user.findUnique = jest.fn();
prisma.user.updateMany = jest.fn();

import usersRouter from "../../routes/users";

const ADMIN = { userId: "u-admin", tenantId: "t-1", role: "ADMIN", email: "a@darb.kw" };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = ADMIN; next(); });
  app.use("/api/users", usersRouter);
  return app;
}

const HQ = { id: "u-hq", role: "SUPERVISOR", vendorId: null, fleetPartnerId: null, vendorRole: null, vendorTabs: null, fleetRole: null, fleetTabs: null };
const SHOP_OWNER = { ...HQ, id: "u-shop", role: "VENDOR", vendorId: "v-1", vendorRole: "ADMIN" };
const FLEET_OWNER = { ...HQ, id: "u-fleet", role: "FLEET", fleetPartnerId: "f-1", fleetRole: null };

beforeEach(() => {
  resetAllMocks();
  prisma.user.updateMany.mockResolvedValue({ count: 1 });
  prisma.user.findUnique.mockResolvedValue({ id: "x", branchId: null });
  prisma.user.findMany.mockResolvedValue([]);
});

test("an HQ role cannot be written onto a shop login", async () => {
  prisma.user.findFirst.mockResolvedValue(SHOP_OWNER);
  const res = await request(makeApp()).put("/api/users/u-shop").send({ role: "ADMIN" });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("PORTAL_LOGIN");
  expect(prisma.user.updateMany).not.toHaveBeenCalled();
});

test("a portal role cannot be given to an HQ login from this list", async () => {
  prisma.user.findFirst.mockResolvedValue(HQ);
  const res = await request(makeApp()).put("/api/users/u-hq").send({ role: "VENDOR" });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("NOT_AN_HQ_ROLE");
});

test("an HQ login still takes an HQ role", async () => {
  prisma.user.findFirst.mockResolvedValue(HQ);
  const res = await request(makeApp()).put("/api/users/u-hq").send({ role: "ACCOUNTANT" });
  expect(res.status).toBe(200);
  expect(prisma.user.updateMany.mock.calls[0][0].data).toEqual({ role: "ACCOUNTANT" });
});

test("a shop login's portal role lands in vendorRole when another owner exists", async () => {
  prisma.user.findFirst.mockResolvedValue(SHOP_OWNER);
  prisma.user.findMany.mockResolvedValue([{ vendorRole: "OWNER" }]);
  const res = await request(makeApp()).put("/api/users/u-shop").send({ portalRole: "ACCOUNTANT" });
  expect(res.status).toBe(200);
  expect(prisma.user.updateMany.mock.calls[0][0].data).toMatchObject({ vendorRole: "ACCOUNTANT", branchId: null });
  expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ vendorId: "v-1", isActive: true, id: { not: "u-shop" } });
});

test("the last active shop owner cannot be moved off owner", async () => {
  prisma.user.findFirst.mockResolvedValue(SHOP_OWNER);
  prisma.user.findMany.mockResolvedValue([{ vendorRole: "ACCOUNTANT" }]);
  const res = await request(makeApp()).put("/api/users/u-shop").send({ portalRole: "ACCOUNTANT" });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("LAST_OWNER");
  expect(prisma.user.updateMany).not.toHaveBeenCalled();
});

test("the last fleet owner (a NULL role reads as owner) is protected too", async () => {
  prisma.user.findFirst.mockResolvedValue(FLEET_OWNER);
  prisma.user.findMany.mockResolvedValue([]);
  const res = await request(makeApp()).put("/api/users/u-fleet").send({ portalRole: "OPS_MANAGER" });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("LAST_OWNER");
});

test("a fleet login's portal role lands in fleetRole", async () => {
  prisma.user.findFirst.mockResolvedValue(FLEET_OWNER);
  prisma.user.findMany.mockResolvedValue([{ fleetRole: null }]);
  const res = await request(makeApp()).put("/api/users/u-fleet").send({ portalRole: "OPERATIONS" });
  expect(res.status).toBe(200);
  expect(prisma.user.updateMany.mock.calls[0][0].data).toEqual({ fleetRole: "OPS_MANAGER" });
});
