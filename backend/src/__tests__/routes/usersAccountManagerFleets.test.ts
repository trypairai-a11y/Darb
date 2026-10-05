// PUT/GET /api/users/:id/permissions, the delivery-company half of an
// account manager's links (client note of 2026-08-16: "only the
// vendor/delivery company account manager will get notifications regarding
// the companies he is handling").
//
// Contract under test: managedFleetIds replaces the whole AccountManagerFleet
// set, only ids that resolve to a fleet in the caller's own tenant are
// written, and both verbs report the set back so the dialog can redraw it.

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
prisma.fleetPartner = prisma.fleetPartner ?? {};
prisma.fleetPartner.findMany = jest.fn();
prisma.userSurfacePermission = prisma.userSurfacePermission ?? {};
prisma.userSurfacePermission.findMany = jest.fn();
prisma.accountManagerFleet = { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() };
prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));

import usersRouter from "../../routes/users";

const ADMIN = { userId: "u-admin", tenantId: "t-1", role: "ADMIN", email: "a@darb.kw" };
const AM = { id: "u-am", role: "ACCOUNT_MANAGER", vendorId: null, fleetPartnerId: null, vendorRole: null, vendorTabs: null, fleetRole: null, fleetTabs: null };

function makeApp(user: Record<string, unknown> = ADMIN) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = user; next(); });
  app.use("/api/users", usersRouter);
  return app;
}

beforeEach(() => {
  resetAllMocks();
  prisma.user.findFirst.mockResolvedValue(AM);
  prisma.userSurfacePermission.findMany.mockResolvedValue([]);
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
});

test("PUT writes only the tenant's own fleets and replaces the old set", async () => {
  prisma.fleetPartner.findMany.mockResolvedValue([{ id: "f-1" }]);
  prisma.accountManagerFleet.findMany.mockResolvedValue([{ fleetPartnerId: "f-1" }]);
  const res = await request(makeApp()).put("/api/users/u-am/permissions").send({ managedFleetIds: ["f-1", "f-other-tenant"] });
  expect(res.status).toBe(200);
  expect(prisma.fleetPartner.findMany).toHaveBeenCalledWith({ where: { tenantId: "t-1", id: { in: ["f-1", "f-other-tenant"] } }, select: { id: true } });
  expect(prisma.accountManagerFleet.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "t-1", userId: "u-am" } });
  expect(prisma.accountManagerFleet.createMany).toHaveBeenCalledWith({ data: [{ tenantId: "t-1", userId: "u-am", fleetPartnerId: "f-1" }] });
  expect(res.body.managedFleetIds).toEqual(["f-1"]);
});

test("PUT with an empty list clears the links", async () => {
  prisma.fleetPartner.findMany.mockResolvedValue([]);
  prisma.accountManagerFleet.findMany.mockResolvedValue([]);
  await request(makeApp()).put("/api/users/u-am/permissions").send({ managedFleetIds: [] });
  expect(prisma.accountManagerFleet.deleteMany).toHaveBeenCalled();
  expect(prisma.accountManagerFleet.createMany).not.toHaveBeenCalled();
});

test("PUT without managedFleetIds leaves the fleet links alone", async () => {
  prisma.accountManagerFleet.findMany.mockResolvedValue([{ fleetPartnerId: "f-1" }]);
  await request(makeApp()).put("/api/users/u-am/permissions").send({ overrides: {} });
  expect(prisma.accountManagerFleet.deleteMany).not.toHaveBeenCalled();
});

test("GET reports the linked delivery companies", async () => {
  prisma.accountManagerFleet.findMany.mockResolvedValue([{ fleetPartnerId: "f-1" }, { fleetPartnerId: "f-2" }]);
  const res = await request(makeApp()).get("/api/users/u-am/permissions");
  expect(res.status).toBe(200);
  expect(res.body.managedFleetIds).toEqual(["f-1", "f-2"]);
});

test("only an admin can change the links", async () => {
  const res = await request(makeApp({ ...ADMIN, role: "OPS_MANAGER" })).put("/api/users/u-am/permissions").send({ managedFleetIds: ["f-1"] });
  expect(res.status).toBe(403);
  expect(prisma.accountManagerFleet.deleteMany).not.toHaveBeenCalled();
});
