// Revision 24 (#17) — pressing a driver on Cash with companies opens their
// cash ledger, in the Admin portal and in the delivery company's Cash tab.
//
// Contract under test:
//   1. The ledger IS the driver's DRIVER_CASH entries: newest first, each with
//      the running balance, "IN" for a debit (cash collected) and "OUT" for a
//      credit (cash handed in), and the order number joined on.
//   2. The fleet portal can only open its own drivers: the company is part of
//      the lookup, so another company's driver answers 404 like no driver.
//   3. A driver who never touched cash has an empty ledger at 0.000.

import request from "supertest";
import express from "express";
import { Prisma } from "../../generated/prisma";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
prisma.driver = prisma.driver ?? {};
prisma.driver.findFirst = jest.fn();
prisma.walletAccount = prisma.walletAccount ?? {};
prisma.walletAccount.findFirst = jest.fn();
prisma.walletEntry = prisma.walletEntry ?? {};
prisma.walletEntry.findMany = jest.fn();
prisma.walletEntry.count = jest.fn();
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
prisma.deliveryOrder.findMany = jest.fn();
prisma.remittance = prisma.remittance ?? {};
prisma.remittance.findMany = jest.fn();
prisma.user = prisma.user ?? {};
prisma.user.findFirst = jest.fn();
prisma.fleetPartner = prisma.fleetPartner ?? {};
prisma.fleetPartner.findMany = jest.fn();

jest.mock("../../services/eventBus", () => ({ publishEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../services/notificationService", () => ({
  createViolationNotifications: jest.fn().mockResolvedValue(undefined),
}));

import walletsRouter from "../../routes/wallets";
import fleetPortalRouter from "../../routes/fleetPortal";

const D = (v: string) => new Prisma.Decimal(v);
const ACCOUNTANT = { userId: "u-1", tenantId: "t-1", role: "ACCOUNTANT", email: "acc@darb.kw" };
const FLEET_USER = { userId: "u-fleet", tenantId: "t-1", role: "FLEET", email: "f@marina.kw", fleetPartnerId: "f-1" };

function makeApp(user: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = { ...user }; next(); });
  app.use("/api/wallets", walletsRouter);
  app.use("/api/fleet", fleetPortalRouter);
  return app;
}

const DRIVER = {
  id: "d-1", name: "Ali", driverCode: "DRB-1", phone: "+965", fleetPartnerId: "f-1",
  fleetPartner: { name: "Marina" },
};

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.driver.findFirst.mockResolvedValue(DRIVER);
  prisma.walletAccount.findFirst.mockResolvedValue({ id: "acc-d1", balanceKwd: D("7.500") });
  prisma.walletEntry.findMany.mockResolvedValue([
    {
      id: "e-2", direction: "CREDIT", amountKwd: D("5.000"), runningBalanceKwd: D("7.500"),
      createdAt: new Date("2026-10-12T10:00:00Z"),
      transaction: { type: "REMITTANCE", memo: null, orderId: null, remittanceId: "r-1" },
    },
    {
      id: "e-1", direction: "DEBIT", amountKwd: D("12.500"), runningBalanceKwd: D("12.500"),
      createdAt: new Date("2026-10-11T10:00:00Z"),
      transaction: { type: "COD_SETTLEMENT", memo: "COD", orderId: "o-1", remittanceId: null },
    },
  ]);
  prisma.walletEntry.count.mockResolvedValue(2);
  prisma.deliveryOrder.findMany.mockResolvedValue([{ id: "o-1", orderNumber: "DRB-RP-0042" }]);
  prisma.remittance.findMany.mockResolvedValue([{ id: "r-1", method: "CASH", fleetPartnerId: "f-1" }]);
  // loadFleetIdentity reads the row; a FINANCE-style login holds the CASH tab.
  prisma.user.findFirst.mockResolvedValue({
    fleetRole: "ACCOUNTANT", fleetTabs: null, fleetPartnerIds: null, isActive: true, name: "Fin",
  });
});

test("staff read every posting behind the balance, newest first", async () => {
  const res = await request(makeApp(ACCOUNTANT)).get("/api/wallets/drivers/d-1/cash-ledger");
  expect(res.status).toBe(200);
  expect(res.body.balanceKwd).toBe("7.500");
  expect(res.body.driver).toMatchObject({ id: "d-1", fleetPartnerName: "Marina" });
  expect(res.body.data[0]).toMatchObject({
    type: "REMITTANCE", direction: "OUT", amountKwd: "5.000", runningBalanceKwd: "7.500",
    remittanceMethod: "CASH", settledByCompany: true,
  });
  expect(res.body.data[1]).toMatchObject({
    type: "COD_SETTLEMENT", direction: "IN", orderNumber: "DRB-RP-0042", runningBalanceKwd: "12.500",
  });
  expect(res.body.pagination).toMatchObject({ total: 2, page: 1 });
  // The staff lookup is not narrowed to a company.
  expect(prisma.driver.findFirst.mock.calls[0][0].where).toEqual({ id: "d-1", tenantId: "t-1" });
  expect(prisma.walletAccount.findFirst.mock.calls[0][0].where).toMatchObject({ ownerKey: "DRIVER:d-1", ownerType: "DRIVER_CASH" });
});

test("a driver with no cash account reads as an empty ledger", async () => {
  prisma.walletAccount.findFirst.mockResolvedValue(null);
  const res = await request(makeApp(ACCOUNTANT)).get("/api/wallets/drivers/d-1/cash-ledger");
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ balanceKwd: "0.000", data: [] });
});

test("the fleet portal opens its own driver, scoped to its own company", async () => {
  const res = await request(makeApp(FLEET_USER)).get("/api/fleet/cash/drivers/d-1/ledger");
  expect(res.status).toBe(200);
  expect(prisma.driver.findFirst.mock.calls[0][0].where).toEqual({ id: "d-1", tenantId: "t-1", fleetPartnerId: "f-1" });
  expect(res.body.data).toHaveLength(2);
});

test("another company's driver answers 404, like no driver at all", async () => {
  prisma.driver.findFirst.mockResolvedValue(null);
  const res = await request(makeApp(FLEET_USER)).get("/api/fleet/cash/drivers/d-other/ledger");
  expect(res.status).toBe(404);
  expect(prisma.walletEntry.findMany).not.toHaveBeenCalled();
});

test("a fleet login without the Cash tab is locked out with TAB_NOT_GRANTED", async () => {
  prisma.user.findFirst.mockResolvedValue({
    fleetRole: "OPS_MANAGER", fleetTabs: null, fleetPartnerIds: null, isActive: true, name: "Ops",
  });
  const res = await request(makeApp(FLEET_USER)).get("/api/fleet/cash/drivers/d-1/ledger");
  expect(res.status).toBe(403);
  expect(res.body.code).toBe("TAB_NOT_GRANTED");
});
