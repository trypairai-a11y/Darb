/**
 * Phase 7 Wave 0 RED test — liveFleetStatus aggregate extension.
 *
 * Wave 1 extends the existing liveFleetStatus tool's return shape
 * with a new aggregate `orderRejectionCount`: the number of distinct
 * drivers (this tenant, today) whose KeetaDailyMetrics.rejectedAuto
 * is >= 3.
 *
 * Per Pitfall 8 (rejection-signal nuance): rejectedAuto is the
 * canonical signal — it represents the auto-timeout path used by
 * violationEngine.ts + aiInsightsEngine.ts. Other platforms have no
 * equivalent field today, so Wave 1 counts Keeta rejections only.
 *
 * REQ-floor-live-map.
 */

jest.mock("../../../../config", () => require("../../../mocks/config"));

import "../../../../agent"; // side-effect register all read tools
import { toolRegistry } from "../../../../agent/registry";
import { prisma } from "../../../mocks/config";

const ctx = {
  tenantId: "tenA",
  agentId: "chat",
  runId: "run-1",
  actorRole: "ADMIN" as const,
  userId: "u-1",
};

describe("Phase 7 / REQ-floor-live-map: liveFleetStatus.orderRejectionCount aggregate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Wave 1's liveFleetStatus will issue a keetaDailyMetrics.groupBy
    // (or findMany with rejectedAuto>=3). We provide a permissive mock
    // so the tool's where-clause shape drives the result, not the
    // mock's data layout.
    (prisma as any).keetaDailyMetrics = {
      groupBy: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    };
    // Existing session reads still need to return SOMETHING.
    (prisma.courierOnlineSession.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([]);
  });

  test("1 driver with rejectedAuto=5 today -> orderRejectionCount: 1", async () => {
    (prisma as any).keetaDailyMetrics.groupBy.mockResolvedValue([
      { driverId: "drv-reject-1", _sum: { rejectedAuto: 5 } },
    ]);
    (prisma as any).keetaDailyMetrics.findMany.mockResolvedValue([
      { driverId: "drv-reject-1", rejectedAuto: 5, tenantId: "tenA", date: new Date() },
    ]);
    (prisma as any).keetaDailyMetrics.count.mockResolvedValue(1);

    const result = await toolRegistry.invoke("liveFleetStatus", ctx, {});
    expect(result.status).not.toBe("error");
    const data: any = (result as any).data ?? result;
    expect(data.orderRejectionCount).toBe(1);
  });

  test("1 driver with rejectedAuto=2 today (under threshold) -> orderRejectionCount: 0", async () => {
    (prisma as any).keetaDailyMetrics.groupBy.mockResolvedValue([]);
    (prisma as any).keetaDailyMetrics.findMany.mockResolvedValue([]);
    (prisma as any).keetaDailyMetrics.count.mockResolvedValue(0);

    const result = await toolRegistry.invoke("liveFleetStatus", ctx, {});
    const data: any = (result as any).data ?? result;
    expect(data.orderRejectionCount).toBe(0);
  });

  test("2 drivers with rejectedAuto>=3 today -> orderRejectionCount: 2", async () => {
    (prisma as any).keetaDailyMetrics.groupBy.mockResolvedValue([
      { driverId: "drv-a", _sum: { rejectedAuto: 4 } },
      { driverId: "drv-b", _sum: { rejectedAuto: 7 } },
    ]);
    (prisma as any).keetaDailyMetrics.findMany.mockResolvedValue([
      { driverId: "drv-a", rejectedAuto: 4, tenantId: "tenA", date: new Date() },
      { driverId: "drv-b", rejectedAuto: 7, tenantId: "tenA", date: new Date() },
    ]);
    (prisma as any).keetaDailyMetrics.count.mockResolvedValue(2);

    const result = await toolRegistry.invoke("liveFleetStatus", ctx, {});
    const data: any = (result as any).data ?? result;
    expect(data.orderRejectionCount).toBe(2);
  });

  test("tenant boundary: cross-tenant ctx returns orderRejectionCount: 0 (where-clause carries tenantId)", async () => {
    (prisma as any).keetaDailyMetrics.groupBy.mockResolvedValue([]);
    (prisma as any).keetaDailyMetrics.findMany.mockResolvedValue([]);
    (prisma as any).keetaDailyMetrics.count.mockResolvedValue(0);

    const tenBCtx = { ...ctx, tenantId: "tenB" };
    const result = await toolRegistry.invoke("liveFleetStatus", tenBCtx, {});
    const data: any = (result as any).data ?? result;
    expect(data.orderRejectionCount).toBe(0);

    // And on the way out, every keetaDailyMetrics query must carry
    // tenantId=tenB in its where clause. If Wave 1 forgets to scope
    // the aggregate, this assertion fires.
    const groupByCalls = (prisma as any).keetaDailyMetrics.groupBy.mock.calls;
    const findManyCalls = (prisma as any).keetaDailyMetrics.findMany.mock.calls;
    const allCalls = [...groupByCalls, ...findManyCalls];
    for (const call of allCalls) {
      const where = call[0]?.where ?? {};
      const tenantScoped =
        where.tenantId === "tenB" ||
        (Array.isArray(where.AND) && where.AND.some((b: any) => b?.tenantId === "tenB"));
      expect(tenantScoped).toBe(true);
    }
  });
});

// RED — turned GREEN by Wave 1 (extends existing liveFleetStatus.ts
// return shape with orderRejectionCount).
