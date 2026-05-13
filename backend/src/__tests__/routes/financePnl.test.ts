// Phase 8 Wave 0 RED supertest — turned GREEN by Wave 3 (routes/
// financePnl.ts). Do not skip.
//
// Behavior contract (REQ-finance-expenses-pl):
//   1. GET /api/finance/pnl?period=month&from=2026-04-01 returns
//      { revenue: { byPlatform: {...4 keys} }, expenses: {
//      byCategory: {...6 keys} }, net }.
//   2. GET /api/finance/pnl?period=quarter&from=2026-04-01 returns Q2
//      2026 sums (3 months merged).
//   3. ?period=invalid returns 400.
//   4. Tenant isolation enforced.

import request from "supertest";
import express from "express";
import { prisma } from "../mocks/config";
import financePnlRouter from "../../routes/financePnl";

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

function makeApp(role = "ACCOUNTANT", tenantId = TENANT_A) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: "user-1", tenantId, role };
    next();
  });
  app.use("/api/finance/pnl", financePnlRouter);
  return app;
}

describe("Phase 8 / REQ-finance-expenses-pl: P&L month + quarter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as any).invoice = {
      findMany: jest.fn().mockResolvedValue([
        {
          tenantId: TENANT_A,
          platform: "KEETA",
          status: "ISSUED",
          totalKd: "1000.000",
          issuedAt: new Date("2026-04-10T00:00:00Z"),
        },
      ]),
    };
    (prisma as any).expense = {
      findMany: jest.fn().mockResolvedValue([
        {
          tenantId: TENANT_A,
          category: "FUEL",
          amountKd: "100.000",
          dateIncurred: new Date("2026-04-05T00:00:00Z"),
        },
      ]),
    };
  });

  test("?period=month&from=2026-04-01 returns {revenue.byPlatform 4 keys, expenses.byCategory 6 keys, net}", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).get(
      "/api/finance/pnl?period=month&from=2026-04-01",
    );
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.revenue.byPlatform).sort()).toEqual([
      "AMERICANA",
      "DELIVEROO",
      "KEETA",
      "TALABAT",
    ]);
    expect(Object.keys(res.body.expenses.byCategory).length).toBe(6);
    expect(res.body.net).toBeDefined();
  });

  test("?period=quarter&from=2026-04-01 returns Q2 2026 sums (3 months merged)", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).get(
      "/api/finance/pnl?period=quarter&from=2026-04-01",
    );
    expect(res.status).toBe(200);
    const invoiceCall = (prisma as any).invoice.findMany.mock.calls[0][0];
    const gte = invoiceCall.where.issuedAt.gte ?? invoiceCall.where.issuedAt.gt;
    const lt = invoiceCall.where.issuedAt.lt ?? invoiceCall.where.issuedAt.lte;
    expect(+new Date(gte)).toBeLessThanOrEqual(+new Date("2026-04-01T00:00:00Z"));
    expect(+new Date(lt)).toBeGreaterThanOrEqual(+new Date("2026-07-01T00:00:00Z") - 86400000);
  });

  test("?period=invalid returns 400", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).get(
      "/api/finance/pnl?period=hourly&from=2026-04-01",
    );
    expect(res.status).toBe(400);
  });

  test("tenant isolation: filter scoped to req.user.tenantId; cross-tenant returns empty shape", async () => {
    const app = makeApp("ACCOUNTANT", TENANT_B);
    (prisma as any).invoice.findMany.mockResolvedValue([]);
    (prisma as any).expense.findMany.mockResolvedValue([]);
    const res = await request(app).get(
      "/api/finance/pnl?period=month&from=2026-04-01",
    );
    expect(res.status).toBe(200);
    const invoiceCall = (prisma as any).invoice.findMany.mock.calls[0][0];
    expect(invoiceCall.where.tenantId).toBe(TENANT_B);
  });
});

// RED — turned GREEN by Wave 3 (routes/financePnl.ts).
