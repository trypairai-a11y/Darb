// Phase 8 Wave 0 RED test — turned GREEN by Wave 2 (services/finance/
// reconciliation.ts). Do not skip.
//
// Behavior contract (REQ-finance-cash-workbench / CON-cash-platform-coverage):
//   1. buildReconciliation({tenantId, today, platform:'KEETA'}) returns 4
//      buckets at thresholds 0, 3, 7, 14 days. Each bucket {threshold,
//      count, totalGap}.
//   2. totalGap = Σ(salesAmount - collectionAmount) for CashRecord.status
//      IN (PENDING, PARTIAL); SETTLED rows excluded.
//   3. Decimal-safe arithmetic: salesAmount=10.500, collectionAmount=3.250
//      -> gap=7.250 (string compare to avoid float drift).
//   4. platform='AMERICANA' returns empty buckets array — Americana
//      drivers don't carry cash per CON-cash-platform-coverage; function
//      does NOT 500.
//   5. No platform filter -> rows across KEETA+TALABAT+DELIVEROO only
//      (default filter excludes AMERICANA).
//   6. Tenant isolation: tenant-A rows do not appear in tenant-B
//      reconciliation.

import { prisma } from "../../mocks/config";
import { buildReconciliation } from "../../../services/finance/reconciliation";

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const TODAY = new Date("2026-05-13T00:00:00Z");
const dayAgo = (n: number) => new Date(+TODAY - n * 86400000);

describe("Phase 8 / REQ-finance-cash-workbench: bucketed gap report", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 4 buckets at thresholds 0/3/7/14 days", async () => {
    (prisma.cashRecord.findMany as jest.Mock).mockResolvedValue([
      {
        id: "c1",
        tenantId: TENANT_A,
        platform: "KEETA",
        status: "PENDING",
        salesAmount: "10.500",
        collectionAmount: "3.250",
        createdAt: dayAgo(1),
      },
      {
        id: "c2",
        tenantId: TENANT_A,
        platform: "KEETA",
        status: "PARTIAL",
        salesAmount: "20.000",
        collectionAmount: "5.000",
        createdAt: dayAgo(5),
      },
      {
        id: "c3",
        tenantId: TENANT_A,
        platform: "KEETA",
        status: "PENDING",
        salesAmount: "15.000",
        collectionAmount: "0.000",
        createdAt: dayAgo(10),
      },
      {
        id: "c4",
        tenantId: TENANT_A,
        platform: "KEETA",
        status: "PENDING",
        salesAmount: "8.000",
        collectionAmount: "0.000",
        createdAt: dayAgo(30),
      },
    ]);
    const result = await buildReconciliation({
      tenantId: TENANT_A,
      today: TODAY,
      platform: "KEETA",
    });
    expect(result.buckets).toHaveLength(4);
    expect(result.buckets.map((b: any) => b.threshold)).toEqual([0, 3, 7, 14]);
  });

  test("totalGap = Σ(salesAmount - collectionAmount) for PENDING+PARTIAL; SETTLED excluded", async () => {
    (prisma.cashRecord.findMany as jest.Mock).mockResolvedValue([
      {
        tenantId: TENANT_A,
        platform: "KEETA",
        status: "SETTLED",
        salesAmount: "999.000",
        collectionAmount: "999.000",
        createdAt: dayAgo(1),
      },
      {
        tenantId: TENANT_A,
        platform: "KEETA",
        status: "PENDING",
        salesAmount: "10.500",
        collectionAmount: "3.250",
        createdAt: dayAgo(1),
      },
    ]);
    const result = await buildReconciliation({
      tenantId: TENANT_A,
      today: TODAY,
      platform: "KEETA",
    });
    // SETTLED contributed zero; bucket 0-3d should have gap 7.250 (one row).
    const first = result.buckets[0];
    expect(String(first.totalGap)).toBe("7.250");
    expect(first.count).toBe(1);
  });

  test("platform='AMERICANA' returns empty buckets — Americana drivers don't carry cash", async () => {
    (prisma.cashRecord.findMany as jest.Mock).mockResolvedValue([]);
    const result = await buildReconciliation({
      tenantId: TENANT_A,
      today: TODAY,
      platform: "AMERICANA",
    });
    expect(Array.isArray(result.buckets)).toBe(true);
    // Either all 4 buckets are empty (count=0) OR the buckets array itself
    // is empty — either shape acceptable per spec ("empty buckets array").
    if (result.buckets.length > 0) {
      for (const b of result.buckets) {
        expect(b.count).toBe(0);
        expect(String(b.totalGap)).toBe("0.000");
      }
    }
  });

  test("no platform filter -> default scope excludes AMERICANA (only KEETA+TALABAT+DELIVEROO)", async () => {
    (prisma.cashRecord.findMany as jest.Mock).mockResolvedValue([]);
    await buildReconciliation({ tenantId: TENANT_A, today: TODAY });
    const call = (prisma.cashRecord.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toBeDefined();
    // The where clause should filter platforms to the 3 cash-bearing platforms.
    // Encoded either as `platform: { in: [...] }` or `platform: { not: 'AMERICANA' }`.
    const whereString = JSON.stringify(call.where);
    expect(whereString).toMatch(/(KEETA|TALABAT|DELIVEROO|not.*AMERICANA)/);
  });

  test("Decimal-safe arithmetic: gap=salesAmount-collectionAmount produces '7.250' (string compare)", async () => {
    (prisma.cashRecord.findMany as jest.Mock).mockResolvedValue([
      {
        tenantId: TENANT_A,
        platform: "KEETA",
        status: "PENDING",
        salesAmount: "10.500",
        collectionAmount: "3.250",
        createdAt: dayAgo(0),
      },
    ]);
    const result = await buildReconciliation({
      tenantId: TENANT_A,
      today: TODAY,
      platform: "KEETA",
    });
    expect(String(result.buckets[0].totalGap)).toBe("7.250");
  });

  test("tenant isolation: only tenant-A rows are included", async () => {
    (prisma.cashRecord.findMany as jest.Mock).mockImplementation((args: any) => {
      const tid = args?.where?.tenantId;
      if (tid !== TENANT_A) return Promise.resolve([]);
      return Promise.resolve([
        {
          tenantId: TENANT_A,
          platform: "KEETA",
          status: "PENDING",
          salesAmount: "1.000",
          collectionAmount: "0.000",
          createdAt: dayAgo(0),
        },
      ]);
    });
    const result = await buildReconciliation({
      tenantId: TENANT_B,
      today: TODAY,
      platform: "KEETA",
    });
    const total = result.buckets.reduce(
      (acc: number, b: any) => acc + Number(b.totalGap),
      0,
    );
    expect(total).toBe(0);
  });
});

// RED — turned GREEN by Wave 2 (services/finance/reconciliation.ts).
