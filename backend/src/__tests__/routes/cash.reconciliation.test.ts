// Phase 8 Wave 0 RED supertest — turned GREEN by Wave 3 (GET /api/cash/
// reconciliation route + RBAC). Do not skip.
//
// Behavior contract (REQ-finance-cash-workbench + CON-cash-platform-coverage):
//   1. 200 with 4 age buckets for ?platform=KEETA.
//   2. 200 with 4 buckets across KEETA+TALABAT+DELIVEROO when ?platform
//      absent (default scope).
//   3. 400 when ?platform=AMERICANA (excluded per CON-cash-platform-
//      coverage).
//   4. 401 when no auth.
//   5. 403 when role=SUPERVISOR (RBAC = ADMIN|ACCOUNTANT only).
//   6. tenant scope honoured.

import request from "supertest";
import express from "express";
import { prisma } from "../mocks/config";
import cashRouter from "../../routes/cash";

const TENANT_A = "tenant-A";

function makeApp(user: { role?: string; tenantId?: string } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (user.role === undefined) return next();
    req.user = {
      userId: "user-1",
      tenantId: user.tenantId ?? TENANT_A,
      role: user.role,
    };
    next();
  });
  app.use("/api/cash", cashRouter);
  return app;
}

describe("Phase 8 / REQ-finance-cash-workbench: GET /api/cash/reconciliation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.cashRecord.findMany as jest.Mock).mockResolvedValue([
      {
        id: "c1",
        tenantId: TENANT_A,
        platform: "KEETA",
        status: "PENDING",
        salesAmount: "10.500",
        collectionAmount: "3.250",
        createdAt: new Date(Date.now() - 86400000),
      },
    ]);
  });

  test("200 with 4 age buckets for ?platform=KEETA", async () => {
    const app = makeApp({ role: "ACCOUNTANT" });
    const res = await request(app).get("/api/cash/reconciliation?platform=KEETA");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.buckets)).toBe(true);
    expect(res.body.buckets).toHaveLength(4);
  });

  test("200 with 4 buckets across 3 platforms when ?platform absent (default = KEETA+TALABAT+DELIVEROO)", async () => {
    const app = makeApp({ role: "ACCOUNTANT" });
    const res = await request(app).get("/api/cash/reconciliation");
    expect(res.status).toBe(200);
    expect(res.body.buckets).toHaveLength(4);
  });

  test("400 when ?platform=AMERICANA (excluded per CON-cash-platform-coverage)", async () => {
    const app = makeApp({ role: "ACCOUNTANT" });
    const res = await request(app).get(
      "/api/cash/reconciliation?platform=AMERICANA",
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/CON-cash-platform-coverage|Americana excluded/i);
  });

  test("401 when no auth", async () => {
    const app = makeApp({}); // no req.user
    const res = await request(app).get("/api/cash/reconciliation?platform=KEETA");
    expect(res.status).toBe(401);
  });

  test("403 when role=SUPERVISOR (RBAC = ADMIN|ACCOUNTANT only)", async () => {
    const app = makeApp({ role: "SUPERVISOR" });
    const res = await request(app).get("/api/cash/reconciliation?platform=KEETA");
    expect(res.status).toBe(403);
  });

  test("tenant scope honoured (response buckets scoped to req.user.tenantId)", async () => {
    const app = makeApp({ role: "ACCOUNTANT", tenantId: TENANT_A });
    await request(app).get("/api/cash/reconciliation?platform=KEETA");
    const call = (prisma.cashRecord.findMany as jest.Mock).mock.calls[0]?.[0];
    expect(call?.where?.tenantId).toBe(TENANT_A);
  });
});

// RED — turned GREEN by Wave 3 (GET /api/cash/reconciliation).
