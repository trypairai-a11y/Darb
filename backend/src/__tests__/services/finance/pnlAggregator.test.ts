// Phase 8 Wave 0 RED test — turned GREEN by Wave 2 (services/finance/
// pnlAggregator.ts). Do not skip.
//
// Behavior contract (REQ-finance-expenses-pl):
//   1. aggregatePnl({tenantId, period:'month', from:'2026-04-01'}) returns
//      {revenue: {byPlatform: {KEETA, TALABAT, DELIVEROO, AMERICANA}},
//       expenses: {byCategory: {FUEL, MAINTENANCE, RENT, OFFICE_SALARY,
//       UTILITIES, OTHER}}, net: Decimal}.
//   2. aggregatePnl(period:'quarter') sums 3 months; from='2026-04-01'
//      returns Q2 2026 totals.
//   3. Tenant isolation: aggregator never sums another tenant's rows.
//   4. Decimal-safe (no float widening) — assertion against Prisma
//      Decimal.toString() not toNumber().
//   5. Empty tenant returns zero-valued shape (NOT undefined / null) —
//      Recharts consumer in Wave 3 relies on stable keys.
//   6. Invoice.status='ISSUED' filter applied to revenue inclusion (W3
//      Open Question #3 resolution).

import { prisma } from "../../mocks/config";
import { aggregatePnl } from "../../../services/finance/pnlAggregator";

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

describe("Phase 8 / REQ-finance-expenses-pl: month + quarter cuts", () => {
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
        {
          tenantId: TENANT_A,
          platform: "TALABAT",
          status: "ISSUED",
          totalKd: "500.000",
          issuedAt: new Date("2026-04-15T00:00:00Z"),
        },
        {
          tenantId: TENANT_A,
          platform: "AMERICANA",
          status: "DRAFT", // NOT ISSUED — must be excluded
          totalKd: "999.000",
          issuedAt: new Date("2026-04-20T00:00:00Z"),
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
        {
          tenantId: TENANT_A,
          category: "RENT",
          amountKd: "300.000",
          dateIncurred: new Date("2026-04-01T00:00:00Z"),
        },
      ]),
    };
  });

  test("month period returns {revenue.byPlatform 4-keys, expenses.byCategory 6-keys, net}", async () => {
    const result = await aggregatePnl({
      tenantId: TENANT_A,
      period: "month",
      from: "2026-04-01",
    });
    expect(Object.keys(result.revenue.byPlatform).sort()).toEqual([
      "AMERICANA",
      "DELIVEROO",
      "KEETA",
      "TALABAT",
    ]);
    expect(Object.keys(result.expenses.byCategory).sort()).toEqual([
      "FUEL",
      "MAINTENANCE",
      "OFFICE_SALARY",
      "OTHER",
      "RENT",
      "UTILITIES",
    ]);
    expect(result.net).toBeDefined();
  });

  test("quarter period sums 3 months — from='2026-04-01' covers Q2 2026 (Apr+May+Jun)", async () => {
    await aggregatePnl({
      tenantId: TENANT_A,
      period: "quarter",
      from: "2026-04-01",
    });
    const call = (prisma as any).invoice.findMany.mock.calls[0][0];
    expect(call.where.issuedAt).toBeDefined();
    const gte = call.where.issuedAt.gte ?? call.where.issuedAt.gt;
    const lt = call.where.issuedAt.lt ?? call.where.issuedAt.lte;
    expect(+new Date(gte)).toBeLessThanOrEqual(+new Date("2026-04-01T00:00:00Z"));
    expect(+new Date(lt)).toBeGreaterThanOrEqual(+new Date("2026-07-01T00:00:00Z") - 86400000);
  });

  test("tenant isolation: aggregator never sums another tenant's rows", async () => {
    await aggregatePnl({
      tenantId: TENANT_A,
      period: "month",
      from: "2026-04-01",
    });
    const invoiceCall = (prisma as any).invoice.findMany.mock.calls[0][0];
    const expenseCall = (prisma as any).expense.findMany.mock.calls[0][0];
    expect(invoiceCall.where.tenantId).toBe(TENANT_A);
    expect(expenseCall.where.tenantId).toBe(TENANT_A);

    // tenant-B empty:
    (prisma as any).invoice.findMany.mockResolvedValue([]);
    (prisma as any).expense.findMany.mockResolvedValue([]);
    const resultB = await aggregatePnl({
      tenantId: TENANT_B,
      period: "month",
      from: "2026-04-01",
    });
    for (const k of Object.keys(resultB.revenue.byPlatform)) {
      expect(String(resultB.revenue.byPlatform[k])).toBe("0.000");
    }
  });

  test("Decimal-safe — assertion against string-form sum", async () => {
    const result = await aggregatePnl({
      tenantId: TENANT_A,
      period: "month",
      from: "2026-04-01",
    });
    // KEETA: 1000, TALABAT: 500, DELIVEROO: 0, AMERICANA: 0 (DRAFT excluded).
    expect(String(result.revenue.byPlatform["KEETA"])).toBe("1000.000");
    expect(String(result.revenue.byPlatform["TALABAT"])).toBe("500.000");
    expect(String(result.revenue.byPlatform["AMERICANA"])).toBe("0.000");
  });

  test("empty tenant returns zero-valued stable shape (NOT undefined / null)", async () => {
    (prisma as any).invoice.findMany.mockResolvedValue([]);
    (prisma as any).expense.findMany.mockResolvedValue([]);
    const result = await aggregatePnl({
      tenantId: TENANT_A,
      period: "month",
      from: "2026-04-01",
    });
    expect(result.revenue.byPlatform).toBeDefined();
    expect(result.expenses.byCategory).toBeDefined();
    expect(Object.keys(result.revenue.byPlatform).length).toBe(4);
    expect(Object.keys(result.expenses.byCategory).length).toBe(6);
  });

  test("Invoice.status='ISSUED' filter applied to revenue inclusion — DRAFT/CANCELLED excluded", async () => {
    await aggregatePnl({
      tenantId: TENANT_A,
      period: "month",
      from: "2026-04-01",
    });
    const invoiceCall = (prisma as any).invoice.findMany.mock.calls[0][0];
    expect(JSON.stringify(invoiceCall.where)).toMatch(/ISSUED/);
  });
});

// RED — turned GREEN by Wave 2 (pnlAggregator.ts + Invoice/Expense schema).
