import { z } from "zod";
import { prisma } from "../../../config";
import { defineTool, toolRegistry } from "../../registry";

/**
 * Phase 1 read tool — REQ-agent-read-tools.
 *
 * Returns top-N drivers ranked by a chosen metric for the given period.
 * For completedOrders/totalRevenue: groupBy driverId on OrderLog.
 * For avgScore: latest AiScore per driver.
 * For violations: count Violation rows.
 * Each row carries driverName for human-readable output.
 */
export const courierLeaderboard = defineTool({
  name: "courierLeaderboard",
  description:
    "Return the top-N couriers ranked by a chosen metric (completedOrders, totalRevenue, avgScore, violations) for a date range. Each row includes driverId, driverName, the metric name, the metric value, and a 1-based rank. Use for 'top performers this week', the dispatcher's daily standings card, or as input to coaching prompts. Default metric 'completedOrders'. Default limit 20, max 100. Tenant-scoped, optional platform filter.",
  inputSchema: {
    type: "object" as const,
    properties: {
      dateFrom: { type: "string", description: "ISO date YYYY-MM-DD, inclusive." },
      dateTo: { type: "string", description: "ISO date YYYY-MM-DD, inclusive." },
      metric: {
        type: "string",
        enum: ["completedOrders", "totalRevenue", "avgScore", "violations"],
        description: "Metric to rank by. Default 'completedOrders'.",
      },
      order: { type: "string", enum: ["desc", "asc"], description: "Sort direction. Default 'desc'." },
      limit: { type: "number", description: "Default 20, max 100." },
      platform: {
        type: "string",
        enum: ["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"],
        description: "Optional platform filter.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  inputValidator: z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    metric: z
      .enum(["completedOrders", "totalRevenue", "avgScore", "violations"])
      .optional(),
    order: z.enum(["desc", "asc"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    platform: z.enum(["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"]).optional(),
  }),
  strict: true,
  sideEffect: "read",
  requiredRole: ["ADMIN", "OPS_MANAGER", "SUPERVISOR", "ACCOUNTANT", "VIEWER"],
  requiresApproval: false,
  allowedAgents: ["*"],
  async execute(ctx, input) {
    const metric = input.metric ?? "completedOrders";
    const order: "desc" | "asc" = input.order ?? "desc";
    const limit = Math.min(input.limit ?? 20, 100);
    const dateTo = input.dateTo ? new Date(input.dateTo) : new Date();
    const dateFrom = input.dateFrom
      ? new Date(input.dateFrom)
      : new Date(dateTo.getTime() - 7 * 86_400_000);

    type Row = {
      driverId: string;
      driverName: string;
      platform?: string;
      metric: string;
      value: number;
      rank: number;
      dateFrom?: string;
      dateTo?: string;
      usedFallbackWindow?: boolean;
    };

    if (metric === "completedOrders" || metric === "totalRevenue") {
      const loadRows = (from: Date, to: Date) =>
        prisma.orderLog.groupBy({
          by: ["driverId"],
          where: {
            tenantId: ctx.tenantId,
            date: { gte: from, lte: to },
            ...(input.platform ? { platform: input.platform } : {}),
          },
          _sum: { orderCount: true, totalAmount: true },
        });
      const valueOf = (r: Awaited<ReturnType<typeof loadRows>>[number]) =>
        metric === "completedOrders"
          ? Number(r._sum.orderCount ?? 0)
          : Number(r._sum.totalAmount ?? 0);

      let effectiveFrom = dateFrom;
      let effectiveTo = dateTo;
      let usedFallbackWindow = false;
      let rows = await loadRows(effectiveFrom, effectiveTo);
      if (rows.every((r) => valueOf(r) <= 0)) {
        const latest = await prisma.orderLog.findFirst({
          where: {
            tenantId: ctx.tenantId,
            ...(input.platform ? { platform: input.platform } : {}),
          },
          orderBy: { date: "desc" },
          select: { date: true },
        });
        if (latest?.date) {
          effectiveTo = latest.date;
          effectiveFrom = new Date(effectiveTo.getTime() - 7 * 86_400_000);
          rows = await loadRows(effectiveFrom, effectiveTo);
          usedFallbackWindow = true;
        }
      }

      const driverIds = rows.map((r) => r.driverId);
      const drivers = await prisma.driver.findMany({
        where: { tenantId: ctx.tenantId, id: { in: driverIds } },
        select: { id: true, name: true, platform: true },
      });
      const driverById = new Map(drivers.map((d) => [d.id, d]));
      const sorted = rows
        .map((r) => ({
          driverId: r.driverId,
          driverName: driverById.get(r.driverId)?.name ?? "(unknown)",
          platform: driverById.get(r.driverId)?.platform,
          metric,
          value: valueOf(r),
          dateFrom: effectiveFrom.toISOString().slice(0, 10),
          dateTo: effectiveTo.toISOString().slice(0, 10),
          usedFallbackWindow,
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => (order === "desc" ? b.value - a.value : a.value - b.value))
        .slice(0, limit)
        .map((r, i): Row => ({ ...r, rank: i + 1 }));
      return sorted;
    }

    if (metric === "violations") {
      // Group violations by driverId in the period.
      const rows = await prisma.driver.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.platform ? { platform: input.platform } : {}),
        },
        select: {
          id: true,
          name: true,
          violations: {
            where: { violationTime: { gte: dateFrom, lte: dateTo } },
            select: { id: true },
          },
        },
        take: 1000,
      });
      const sorted = rows
        .map((d) => ({
          driverId: d.id,
          driverName: d.name,
          metric,
          value: d.violations?.length ?? 0,
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => (order === "desc" ? b.value - a.value : a.value - b.value))
        .slice(0, limit)
        .map((r, i): Row => ({ ...r, rank: i + 1 }));
      return sorted;
    }

    // metric === "avgScore" — latest AiScore per driver.
    const drivers = await prisma.driver.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(input.platform ? { platform: input.platform } : {}),
      },
      select: {
        id: true,
        name: true,
        aiScores: {
          where: { date: { gte: dateFrom, lte: dateTo } },
          orderBy: { date: "desc" },
          take: 1,
          select: { compositeScore: true },
        },
      },
      take: 1000,
    });
    const sorted = drivers
      .map((d) => ({
        driverId: d.id,
        driverName: d.name,
        metric,
        value: d.aiScores?.[0]?.compositeScore ?? 0,
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => (order === "desc" ? b.value - a.value : a.value - b.value))
      .slice(0, limit)
      .map((r, i): Row => ({ ...r, rank: i + 1 }));
    return sorted;
  },
});

export function registerCourierLeaderboardTool() {
  toolRegistry.register(courierLeaderboard);
}

registerCourierLeaderboardTool();
