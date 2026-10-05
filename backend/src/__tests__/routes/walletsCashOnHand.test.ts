// GET /api/wallets/cash-on-hand, Finance > Cash with companies.
//
// Client note (2026-10-04): "add one more column, the wallet for each delivery
// company". Answered "Not done" on 2026-10-05: the companies were folded out
// of the driver list, so a company with nobody on the roster had no row and no
// wallet. Contract under test: every active company is listed with its own
// FLEET:{id} account, an inactive one only while money sits in it, Darb's own
// drivers carry no wallet, and the wallet total rides beside the cash total.

import request from "supertest";
import express from "express";
import { Prisma } from "../../generated/prisma";
import { getMockPrisma, resetAllMocks } from "../setup";

jest.mock("../../services/wallet/fleetCashService", () => ({
  driverCashBalances: jest.fn(),
}));

const prisma = getMockPrisma();
prisma.driver = prisma.driver ?? {};
prisma.driver.findMany = jest.fn();
prisma.fleetPartner = prisma.fleetPartner ?? {};
prisma.fleetPartner.findMany = jest.fn();
prisma.walletAccount = prisma.walletAccount ?? {};
prisma.walletAccount.findMany = jest.fn();

const { driverCashBalances } = require("../../services/wallet/fleetCashService");
const router = require("../../routes/wallets").default;

const ACCOUNTANT = { userId: "u-1", tenantId: "t-1", role: "ACCOUNTANT", email: "acc@darb.kw" };
const D = (v: string) => new Prisma.Decimal(v);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = ACCOUNTANT;
    next();
  });
  app.use("/api/wallets", router);
  return app;
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.driver.findMany.mockResolvedValue([
    { id: "d-1", name: "Ali", driverCode: "DRB-1", phone: null, status: "ACTIVE", fleetPartnerId: "f-1", fleetPartner: { id: "f-1", name: "Marina" } },
    { id: "d-2", name: "Omar", driverCode: "DRB-2", phone: null, status: "ACTIVE", fleetPartnerId: null, fleetPartner: null },
  ]);
  prisma.fleetPartner.findMany.mockResolvedValue([
    { id: "f-1", name: "Marina", isActive: true },
    { id: "f-2", name: "Sidra", isActive: true }, // no drivers yet
    { id: "f-3", name: "Old Co", isActive: false }, // inactive, money still in
    { id: "f-4", name: "Gone Co", isActive: false }, // inactive, empty
  ]);
  prisma.walletAccount.findMany.mockResolvedValue([
    { ownerKey: "FLEET:f-1", balanceKwd: D("40.000") },
    { ownerKey: "FLEET:f-2", balanceKwd: D("12.500") },
    { ownerKey: "FLEET:f-3", balanceKwd: D("3.000") },
  ]);
  (driverCashBalances as jest.Mock).mockResolvedValue(
    new Map([
      ["d-1", D("7.250")],
      ["d-2", D("1.000")],
    ]),
  );
});

test("every delivery company has a row with its own wallet, drivers or not", async () => {
  const res = await request(makeApp()).get("/api/wallets/cash-on-hand");

  expect(res.status).toBe(200);
  const byName = Object.fromEntries(res.body.companies.map((c: any) => [c.name, c]));
  expect(byName.Marina).toMatchObject({ walletKwd: "40.000", cashOnHandKwd: "7.250", driverCount: 1 });
  expect(byName.Sidra).toMatchObject({ walletKwd: "12.500", cashOnHandKwd: "0.000", driverCount: 0 });
  expect(byName["Old Co"]).toMatchObject({ walletKwd: "3.000" });
  expect(byName["Gone Co"]).toBeUndefined();
  // Darb's own drivers have no company wallet.
  expect(byName.Darb).toMatchObject({ walletKwd: null, cashOnHandKwd: "1.000" });
  expect(res.body.totalKwd).toBe("8.250");
  expect(res.body.walletTotalKwd).toBe("55.500");
});

test("the wallet is read from each company's FLEET account, never a driver's cash", async () => {
  await request(makeApp()).get("/api/wallets/cash-on-hand");
  const where = prisma.walletAccount.findMany.mock.calls[0][0].where;
  expect(where.tenantId).toBe("t-1");
  expect([...where.ownerKey.in].sort()).toEqual(["FLEET:f-1", "FLEET:f-2", "FLEET:f-3", "FLEET:f-4"]);
});
