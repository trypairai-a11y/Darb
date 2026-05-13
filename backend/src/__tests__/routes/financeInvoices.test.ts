// Phase 8 Wave 0 RED supertest — turned GREEN by Wave 3 (routes/
// financeInvoices.ts). Do not skip.
//
// Behavior contract (REQ-finance-invoices + Open Question #3 — invoices
// cover all 4 platforms INCLUDING Americana):
//   1. GET /api/finance/invoices returns paginated Invoice[] across all 4
//      platforms (Americana INCLUDED).
//   2. ?platform=AMERICANA returns rows; ?status=UNRECONCILED filters.
//   3. POST /api/finance/invoices/:id/reconcile flips status
//      UNRECONCILED -> RECONCILED + writes BankReceiptId reference.
//   4. RBAC = ADMIN|ACCOUNTANT for POST; ADMIN|ACCOUNTANT|VIEWER for GET.
//   5. Tenant isolation across all endpoints.

import request from "supertest";
import express from "express";
import { prisma } from "../mocks/config";
import financeInvoicesRouter from "../../routes/financeInvoices";

const TENANT_A = "tenant-A";

function makeApp(role = "ACCOUNTANT", tenantId = TENANT_A) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: "user-1", tenantId, role };
    next();
  });
  app.use("/api/finance/invoices", financeInvoicesRouter);
  return app;
}

describe("Phase 8 / REQ-finance-invoices: per-platform invoices", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as any).invoice = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "inv-1",
          tenantId: TENANT_A,
          platform: "KEETA",
          status: "UNRECONCILED",
          totalKd: "1000.000",
        },
        {
          id: "inv-2",
          tenantId: TENANT_A,
          platform: "AMERICANA",
          status: "UNRECONCILED",
          totalKd: "200.000",
        },
      ]),
      count: jest.fn().mockResolvedValue(2),
      findFirst: jest.fn().mockResolvedValue({
        id: "inv-1",
        tenantId: TENANT_A,
        platform: "KEETA",
        status: "UNRECONCILED",
      }),
      update: jest.fn().mockResolvedValue({
        id: "inv-1",
        status: "RECONCILED",
        bankReceiptId: "rcpt-1",
      }),
    };
  });

  test("GET /api/finance/invoices returns paginated Invoice[] across all 4 platforms (Americana INCLUDED)", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).get("/api/finance/invoices");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data) || Array.isArray(res.body)).toBe(true);
    const list = res.body.data ?? res.body;
    expect(list.length).toBeGreaterThanOrEqual(1);
    // Default query has no platform filter (Americana NOT excluded).
    const call = (prisma as any).invoice.findMany.mock.calls[0][0];
    expect(JSON.stringify(call.where ?? {})).not.toMatch(
      /not.*AMERICANA|exclude.*AMERICANA/i,
    );
  });

  test("?platform=AMERICANA returns rows; ?status=UNRECONCILED filters", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app).get(
      "/api/finance/invoices?platform=AMERICANA&status=UNRECONCILED",
    );
    expect(res.status).toBe(200);
    const call = (prisma as any).invoice.findMany.mock.calls[0][0];
    expect(call.where.platform).toBe("AMERICANA");
    expect(call.where.status).toBe("UNRECONCILED");
  });

  test("POST /api/finance/invoices/:id/reconcile flips status to RECONCILED + writes bankReceiptId reference", async () => {
    const app = makeApp("ACCOUNTANT");
    const res = await request(app)
      .post("/api/finance/invoices/inv-1/reconcile")
      .send({ bankReceiptId: "rcpt-1" });
    expect(res.status).toBe(200);
    const updateCall = (prisma as any).invoice.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("RECONCILED");
    expect(updateCall.data.bankReceiptId).toBe("rcpt-1");
  });

  test("RBAC: VIEWER can GET; SUPERVISOR cannot POST /reconcile", async () => {
    const viewerApp = makeApp("VIEWER");
    const viewerRes = await request(viewerApp).get("/api/finance/invoices");
    expect(viewerRes.status).toBe(200);

    const supervisorApp = makeApp("SUPERVISOR");
    const postRes = await request(supervisorApp)
      .post("/api/finance/invoices/inv-1/reconcile")
      .send({ bankReceiptId: "rcpt-1" });
    expect(postRes.status).toBe(403);
  });

  test("tenant isolation: GET filters by req.user.tenantId; cross-tenant invoice id returns 404", async () => {
    const app = makeApp("ACCOUNTANT");
    await request(app).get("/api/finance/invoices");
    const call = (prisma as any).invoice.findMany.mock.calls[0][0];
    expect(call.where.tenantId).toBe(TENANT_A);

    (prisma as any).invoice.findFirst = jest.fn().mockResolvedValue(null);
    const otherApp = makeApp("ACCOUNTANT", "tenant-other");
    const r = await request(otherApp)
      .post("/api/finance/invoices/inv-1/reconcile")
      .send({ bankReceiptId: "rcpt-x" });
    expect(r.status).toBe(404);
  });
});

// RED — turned GREEN by Wave 3 (routes/financeInvoices.ts + Invoice migration).
