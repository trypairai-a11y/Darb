/**
 * Phase 7 Wave 0 RED test — orderRejectionToday list tool.
 *
 * Wave 1 ships a NEW agent read tool at
 * backend/src/agent/tools/read/orderRejectionToday.ts. Today the
 * module does not exist; the registry lookup returns undefined; the
 * `import` at module-load time would compile against a non-existent
 * file. That's the RED state.
 *
 * Behaviour contract (per plan §interfaces + Pitfall 8):
 *   - Returns [{driverId, count}] for drivers with rejectedAuto>=3
 *     today.
 *   - Ordered by count DESC.
 *   - Tenant-scoped (ctx.tenantId).
 *   - Empty array when tenant has no metrics today.
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

describe("Phase 7 / REQ-floor-live-map: orderRejectionToday list tool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as any).keetaDailyMetrics = {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    };
  });

  test("the tool is registered (Wave 1 ships the module)", () => {
    const tool = toolRegistry.get("orderRejectionToday");
    expect(tool).toBeDefined();
    expect((tool?.inputSchema as any)?.additionalProperties).toBe(false);
  });

  test("returns [{driverId, count}] ordered by count DESC for drivers with rejectedAuto>=3 today", async () => {
    (prisma as any).keetaDailyMetrics.findMany.mockResolvedValue([
      { driverId: "drv-a", rejectedAuto: 4, tenantId: "tenA", date: new Date() },
      { driverId: "drv-b", rejectedAuto: 9, tenantId: "tenA", date: new Date() },
      { driverId: "drv-c", rejectedAuto: 3, tenantId: "tenA", date: new Date() },
    ]);
    (prisma as any).keetaDailyMetrics.groupBy.mockResolvedValue([
      { driverId: "drv-b", _sum: { rejectedAuto: 9 } },
      { driverId: "drv-a", _sum: { rejectedAuto: 4 } },
      { driverId: "drv-c", _sum: { rejectedAuto: 3 } },
    ]);

    const result = await toolRegistry.invoke("orderRejectionToday", ctx, {});
    expect(result.status).not.toBe("error");
    const data: any = (result as any).data ?? result;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(3);
    expect(data[0]).toEqual({ driverId: "drv-b", count: 9 });
    expect(data[1]).toEqual({ driverId: "drv-a", count: 4 });
    expect(data[2]).toEqual({ driverId: "drv-c", count: 3 });
  });

  test("empty array when tenant has no metrics today", async () => {
    (prisma as any).keetaDailyMetrics.findMany.mockResolvedValue([]);
    (prisma as any).keetaDailyMetrics.groupBy.mockResolvedValue([]);

    const result = await toolRegistry.invoke("orderRejectionToday", ctx, {});
    const data: any = (result as any).data ?? result;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  test("tenant-scoped: cross-tenant rejection rows are NOT returned", async () => {
    // The tool should only ask for tenantId=tenA rows; if it omits
    // the tenant filter, this test's where-clause assertion fires.
    (prisma as any).keetaDailyMetrics.findMany.mockResolvedValue([]);
    (prisma as any).keetaDailyMetrics.groupBy.mockResolvedValue([]);

    await toolRegistry.invoke("orderRejectionToday", ctx, {});

    const groupByCalls = (prisma as any).keetaDailyMetrics.groupBy.mock.calls;
    const findManyCalls = (prisma as any).keetaDailyMetrics.findMany.mock.calls;
    const allCalls = [...groupByCalls, ...findManyCalls];
    expect(allCalls.length).toBeGreaterThan(0);
    for (const call of allCalls) {
      const where = call[0]?.where ?? {};
      const tenantScoped =
        where.tenantId === "tenA" ||
        (Array.isArray(where.AND) && where.AND.some((b: any) => b?.tenantId === "tenA"));
      expect(tenantScoped).toBe(true);
    }
  });
});

// RED — turned GREEN by Wave 1
