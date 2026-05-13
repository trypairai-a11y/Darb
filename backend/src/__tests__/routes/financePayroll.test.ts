// Phase 8 Wave 0 RED supertest — turned GREEN by Wave 3 (routes/
// financePayroll.ts). Do not skip.
//
// Behavior contract (REQ-finance-payroll):
//   1. POST /api/finance/payroll/runs with {period:'2026-W17'} returns
//      201 + PayrollRun {id, status:'DRAFT', periodStart, periodEnd}.
//   2. GET /api/finance/payroll/runs/:id returns the run + lines array
//      (one PayrollLine per active driver).
//   3. POST /api/finance/payroll/runs/:id/freeze flips DRAFT->FROZEN;
//      cannot freeze twice (409).
//   4. GET /api/finance/payroll/runs/:id/export streams text/csv with
//      header 'IBAN,Amount,Reference'; Content-Disposition: attachment;
//      filename=payroll-<period>.csv.
//   5. POST /api/finance/payroll/runs/:id/export creates a BankFile
//      audit row (NOT a stored file — just the audit).
//   6. RBAC: ACCOUNTANT can POST run; tenant isolation across all
//      endpoints (cross-tenant runId returns 404).

import request from "supertest";
import express from "express";
import { prisma } from "../mocks/config";
import financePayrollRouter from "../../routes/financePayroll";

const TENANT_A = "tenant-A";

function makeApp(role = "ACCOUNTANT", tenantId = TENANT_A) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: "user-1", tenantId, role };
    next();
  });
  app.use("/api/finance/payroll", financePayrollRouter);
  return app;
}

describe("Phase 8 / REQ-finance-payroll: payroll lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as any).payrollRun = {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({
        id: "run-w17",
        tenantId: TENANT_A,
        period: "2026-W17",
        periodStart: new Date("2026-04-20T00:00:00Z"),
        periodEnd: new Date("2026-04-27T00:00:00Z"),
        status: "DRAFT",
      }),
      update: jest.fn(),
    };
    (prisma as any).payrollLine = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    };
    (prisma as any).bankFile = {
      create: jest.fn().mockResolvedValue({ id: "bank-file-1" }),
    };
    (prisma.driver.findMany as jest.Mock).mockResolvedValue([
      { id: "drv-1", tenantId: TENANT_A, name: "Mohamed" },
    ]);
  });

  test("POST /api/finance/payroll/runs with {period:'2026-W17'} returns 201 + PayrollRun DRAFT", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app)
      .post("/api/finance/payroll/runs")
      .send({ period: "2026-W17" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        status: "DRAFT",
      }),
    );
  });

  test("GET /api/finance/payroll/runs/:id returns the run + lines array", async () => {
    (prisma as any).payrollRun.findFirst = jest.fn().mockResolvedValue({
      id: "run-w17",
      tenantId: TENANT_A,
      period: "2026-W17",
      status: "DRAFT",
    });
    (prisma as any).payrollLine.findMany = jest.fn().mockResolvedValue([
      { id: "ln-1", driverId: "drv-1", base: "10.000", net: "10.000" },
    ]);
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).get("/api/finance/payroll/runs/run-w17");
    expect(res.status).toBe(200);
    expect(res.body.run).toBeDefined();
    expect(Array.isArray(res.body.lines)).toBe(true);
  });

  test("POST /api/finance/payroll/runs/:id/freeze flips DRAFT->FROZEN; cannot freeze twice (409)", async () => {
    (prisma as any).payrollRun.findFirst = jest.fn().mockResolvedValue({
      id: "run-w17",
      tenantId: TENANT_A,
      period: "2026-W17",
      status: "DRAFT",
    });
    (prisma as any).payrollRun.update = jest.fn().mockResolvedValue({
      id: "run-w17",
      status: "FROZEN",
    });
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).post(
      "/api/finance/payroll/runs/run-w17/freeze",
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("FROZEN");

    // Second freeze:
    (prisma as any).payrollRun.findFirst = jest.fn().mockResolvedValue({
      id: "run-w17",
      tenantId: TENANT_A,
      status: "FROZEN",
    });
    const res2 = await request(app).post(
      "/api/finance/payroll/runs/run-w17/freeze",
    );
    expect(res2.status).toBe(409);
  });

  test("GET /api/finance/payroll/runs/:id/export streams text/csv with header IBAN,Amount,Reference + Content-Disposition", async () => {
    (prisma as any).payrollRun.findFirst = jest.fn().mockResolvedValue({
      id: "run-w17",
      tenantId: TENANT_A,
      period: "2026-W17",
      status: "FROZEN",
    });
    (prisma as any).payrollLine.findMany = jest.fn().mockResolvedValue([
      {
        iban: "KW81MUKB0000000000000000000001",
        netKd: "1.500",
        reference: "2026-W17-1",
      },
    ]);
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).get(
      "/api/finance/payroll/runs/run-w17/export",
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.headers["content-disposition"]).toMatch(/payroll-2026-W17\.csv/);
    expect(res.text).toMatch(/^IBAN,Amount,Reference/);
  });

  test("POST /api/finance/payroll/runs/:id/export creates a BankFile audit row", async () => {
    (prisma as any).payrollRun.findFirst = jest.fn().mockResolvedValue({
      id: "run-w17",
      tenantId: TENANT_A,
      period: "2026-W17",
      status: "FROZEN",
    });
    (prisma as any).payrollLine.findMany = jest.fn().mockResolvedValue([]);
    const app = makeApp("ACCOUNTANT");
    await request(app).post("/api/finance/payroll/runs/run-w17/export");
    expect((prisma as any).bankFile.create).toHaveBeenCalled();
  });

  test("RBAC: ACCOUNTANT can POST run; VIEWER cannot", async () => {
    const accountantApp = makeApp("ACCOUNTANT");
    const r1 = await request(accountantApp)
      .post("/api/finance/payroll/runs")
      .send({ period: "2026-W17" });
    expect([200, 201]).toContain(r1.status);

    const viewerApp = makeApp("VIEWER");
    const r2 = await request(viewerApp)
      .post("/api/finance/payroll/runs")
      .send({ period: "2026-W18" });
    expect(r2.status).toBe(403);
  });

  test("tenant isolation: cross-tenant runId returns 404", async () => {
    (prisma as any).payrollRun.findFirst = jest.fn().mockResolvedValue(null);
    const app = makeApp("ACCOUNTANT", "tenant-other");
    const res = await request(app).get("/api/finance/payroll/runs/run-w17");
    expect(res.status).toBe(404);
  });
});

// RED — turned GREEN by Wave 3 (routes/financePayroll.ts).
