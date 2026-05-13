// Phase 8 Wave 0 RED supertest — turned GREEN by Wave 3 (routes/
// financeExpenses.ts). Do not skip.
//
// Behavior contract (REQ-finance-expenses-pl):
//   1. POST /api/finance/expenses {category:'FUEL', amountKd:25.500,
//      vendor, dateIncurred} returns 201 + Expense row.
//   2. Zod rejects unknown category enum value.
//   3. GET /api/finance/expenses paginated + ?from + ?to + ?category
//      filters.
//   4. DELETE /api/finance/expenses/:id soft-deletes (deletedAt
//      timestamp) — preserves audit per CON-audit-row-shape.
//   5. RBAC = ADMIN|ACCOUNTANT.

import request from "supertest";
import express from "express";
import { prisma } from "../mocks/config";
import financeExpensesRouter from "../../routes/financeExpenses";

const TENANT_A = "tenant-A";

function makeApp(role = "ACCOUNTANT", tenantId = TENANT_A) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: "user-1", tenantId, role };
    next();
  });
  app.use("/api/finance/expenses", financeExpensesRouter);
  return app;
}

describe("Phase 8 / REQ-finance-expenses-pl: expense ledger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as any).expense = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue({
        id: "exp-1",
        tenantId: TENANT_A,
        category: "FUEL",
        amountKd: "25.500",
      }),
      create: jest.fn().mockResolvedValue({
        id: "exp-1",
        tenantId: TENANT_A,
        category: "FUEL",
        amountKd: "25.500",
        vendor: "Q8 Petrol",
        dateIncurred: new Date("2026-05-12T00:00:00Z"),
      }),
      update: jest.fn().mockResolvedValue({
        id: "exp-1",
        deletedAt: new Date(),
      }),
    };
  });

  test("POST /api/finance/expenses returns 201 + Expense row", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).post("/api/finance/expenses").send({
      category: "FUEL",
      amountKd: 25.5,
      vendor: "Q8 Petrol",
      dateIncurred: "2026-05-12",
    });
    expect(res.status).toBe(201);
    const call = (prisma as any).expense.create.mock.calls[0][0];
    expect(call.data.tenantId).toBe(TENANT_A);
    expect(call.data.category).toBe("FUEL");
  });

  test("Zod rejects unknown category enum value", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).post("/api/finance/expenses").send({
      category: "DOGFOOD",
      amountKd: 5,
      vendor: "x",
      dateIncurred: "2026-05-12",
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/finance/expenses paginated + ?from + ?to + ?category filters", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).get(
      "/api/finance/expenses?from=2026-05-01&to=2026-05-31&category=FUEL&page=1&pageSize=20",
    );
    expect(res.status).toBe(200);
    const call = (prisma as any).expense.findMany.mock.calls[0][0];
    expect(call.where.tenantId).toBe(TENANT_A);
    expect(call.where.category).toBe("FUEL");
    expect(call.where.dateIncurred).toBeDefined();
  });

  test("DELETE /api/finance/expenses/:id soft-deletes (deletedAt set, row preserved)", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).delete("/api/finance/expenses/exp-1");
    expect(res.status).toBe(200);
    const updateCall = (prisma as any).expense.update.mock.calls[0][0];
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });

  test("RBAC = ADMIN|ACCOUNTANT — SUPERVISOR rejected", async () => {
    const supervisorApp = makeApp("SUPERVISOR");
    const r = await request(supervisorApp).post("/api/finance/expenses").send({
      category: "FUEL",
      amountKd: 25.5,
      vendor: "Q8",
      dateIncurred: "2026-05-12",
    });
    expect(r.status).toBe(403);
  });
});

// RED — turned GREEN by Wave 3 (routes/financeExpenses.ts + Expense migration).
