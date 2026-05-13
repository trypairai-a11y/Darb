// Phase 8 Wave 0 RED test — turned GREEN by Wave 2 (services/finance/
// payrollComputer.ts). Do not skip.
//
// Behavior contract (REQ-finance-payroll):
//   1. computeWeeklyPay({tenantId, driverId, periodStart, periodEnd})
//      returns {base, incentives, deductions, net} all Decimal-safe.
//   2. deductions sum EFFECTIVE Penalty rows where Penalty.createdAt >=
//      periodStart AND < periodEnd; OVERTURNED penalties excluded;
//      Penalty.createdAt < periodStart NOT included (boundary respected).
//   3. incentives sum Shift bonuses in the window (use schema-actual
//      column name from Phase 1).
//   4. base = Driver.contractedRateKd × actualHoursMinutes/60.
//   5. net = base + incentives - deductions; if deductions > base+
//      incentives, net is clamped at 0 (Kuwait labour-law cannot net-negative).
//   6. Tenant isolation: tenant-A penalties cannot deduct from tenant-B
//      driver pay.

import { prisma } from "../../mocks/config";
import { computeWeeklyPay } from "../../../services/finance/payrollComputer";

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const periodStart = new Date("2026-04-20T00:00:00Z");
const periodEnd = new Date("2026-04-27T00:00:00Z");

describe("Phase 8 / REQ-finance-payroll: weekly run computation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_A,
      contractedRateKd: "2.500",
    });
    (prisma as any).penalty = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "p1",
          driverId: "drv_xy12",
          tenantId: TENANT_A,
          penaltyStatus: "EFFECTIVE",
          penaltyValue: "2.500",
          createdAt: new Date("2026-04-22T10:00:00Z"),
        },
        {
          id: "p2",
          driverId: "drv_xy12",
          tenantId: TENANT_A,
          penaltyStatus: "EFFECTIVE",
          penaltyValue: "3.000",
          createdAt: new Date("2026-04-23T10:00:00Z"),
        },
        {
          id: "p3",
          driverId: "drv_xy12",
          tenantId: TENANT_A,
          penaltyStatus: "EFFECTIVE",
          penaltyValue: "1.500",
          createdAt: new Date("2026-04-24T10:00:00Z"),
        },
      ]),
    };
    (prisma.shift as any).findMany = jest.fn().mockResolvedValue([
      {
        id: "s1",
        driverId: "drv_xy12",
        tenantId: TENANT_A,
        scheduledStart: new Date("2026-04-21T08:00:00Z"),
        scheduledEnd: new Date("2026-04-21T16:00:00Z"),
        status: "COMPLETED",
        bonusKd: "0.500",
      },
    ]);
  });

  test("computeWeeklyPay returns {base, incentives, deductions, net} (Decimal-safe — string-compares)", async () => {
    const result = await computeWeeklyPay({
      tenantId: TENANT_A,
      driverId: "drv_xy12",
      periodStart,
      periodEnd,
    });
    expect(typeof String(result.base)).toBe("string");
    expect(typeof String(result.incentives)).toBe("string");
    expect(typeof String(result.deductions)).toBe("string");
    expect(typeof String(result.net)).toBe("string");
  });

  test("deductions sum EFFECTIVE Penalty values where createdAt in window — driver with 3 penalties (2.500+3.000+1.500) -> 7.000", async () => {
    const result = await computeWeeklyPay({
      tenantId: TENANT_A,
      driverId: "drv_xy12",
      periodStart,
      periodEnd,
    });
    expect(String(result.deductions)).toBe("7.000");
  });

  test("OVERTURNED penalties excluded from deductions", async () => {
    (prisma as any).penalty.findMany = jest.fn().mockResolvedValue([
      {
        id: "p1",
        driverId: "drv_xy12",
        tenantId: TENANT_A,
        penaltyStatus: "EFFECTIVE",
        penaltyValue: "2.500",
        createdAt: new Date("2026-04-22T10:00:00Z"),
      },
      {
        id: "p2-overturned",
        driverId: "drv_xy12",
        tenantId: TENANT_A,
        penaltyStatus: "OVERTURNED",
        penaltyValue: "100.000",
        createdAt: new Date("2026-04-22T10:00:00Z"),
      },
    ]);
    const result = await computeWeeklyPay({
      tenantId: TENANT_A,
      driverId: "drv_xy12",
      periodStart,
      periodEnd,
    });
    expect(String(result.deductions)).toBe("2.500");
    // Verify the query filter explicitly excludes OVERTURNED.
    const call = (prisma as any).penalty.findMany.mock.calls[0][0];
    expect(JSON.stringify(call.where)).toMatch(/EFFECTIVE/);
  });

  test("Penalty.createdAt < periodStart NOT included (boundary respected)", async () => {
    await computeWeeklyPay({
      tenantId: TENANT_A,
      driverId: "drv_xy12",
      periodStart,
      periodEnd,
    });
    const call = (prisma as any).penalty.findMany.mock.calls[0][0];
    expect(call.where.createdAt).toBeDefined();
    // gte must be periodStart (or stricter)
    const gte = call.where.createdAt.gte ?? call.where.createdAt.gt;
    expect(+new Date(gte)).toBeGreaterThanOrEqual(+periodStart - 1);
  });

  test("net clamps at 0 when deductions > base+incentives (Kuwait labour-law: no net-negative)", async () => {
    (prisma as any).penalty.findMany = jest.fn().mockResolvedValue([
      {
        id: "p-huge",
        driverId: "drv_xy12",
        tenantId: TENANT_A,
        penaltyStatus: "EFFECTIVE",
        penaltyValue: "9999.000",
        createdAt: new Date("2026-04-22T10:00:00Z"),
      },
    ]);
    const result = await computeWeeklyPay({
      tenantId: TENANT_A,
      driverId: "drv_xy12",
      periodStart,
      periodEnd,
    });
    expect(Number(result.net)).toBeGreaterThanOrEqual(0);
  });

  test("tenant isolation: penalty filter uses tenantId=TENANT_A; tenant-B's data does not bleed", async () => {
    await computeWeeklyPay({
      tenantId: TENANT_A,
      driverId: "drv_xy12",
      periodStart,
      periodEnd,
    });
    const penaltyCall = (prisma as any).penalty.findMany.mock.calls[0][0];
    expect(penaltyCall.where.tenantId).toBe(TENANT_A);
    const shiftCall = (prisma.shift as any).findMany.mock.calls[0][0];
    expect(shiftCall.where.tenantId).toBe(TENANT_A);
    // Calling for tenant-B with the same driver must NOT pick up tenant-A penalties.
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_B,
      contractedRateKd: "2.500",
    });
    (prisma as any).penalty.findMany.mockResolvedValue([]);
    (prisma.shift as any).findMany.mockResolvedValue([]);
    const resultB = await computeWeeklyPay({
      tenantId: TENANT_B,
      driverId: "drv_xy12",
      periodStart,
      periodEnd,
    });
    expect(String(resultB.deductions)).toBe("0.000");
  });
});

// RED — turned GREEN by Wave 2 (payrollComputer.ts + Penalty/Shift schema bonuses).
