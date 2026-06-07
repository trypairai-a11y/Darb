import { prisma } from "../config";
import { v4 as uuid } from "uuid";

// ─── Types ──────────────────────────────────────────────────────────────────

interface InsightRecord {
  tenantId: string;
  category: string;
  subcategory: string;
  context: string;
  severity: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  data?: Record<string, unknown>;
  driverId?: string;
  platform?: string;
  score: number;
  expiresAt: Date;
  batchId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 3600_000);
}

function dayBounds(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export class AiInsightsEngine {
  /**
   * Compute all insight categories for a tenant and persist them.
   * Deletes expired insights, then creates fresh ones.
   */
  static async computeAllInsights(tenantId: string): Promise<number> {
    const batchId = uuid();
    const now = new Date();

    // Delete expired insights
    await prisma.aiInsight.deleteMany({
      where: { tenantId, expiresAt: { lt: now } },
    });

    const insights: InsightRecord[] = [];

    try {
      const [revenue, workforce, financial, compliance, coaching, efficiency] = await Promise.all([
        this.analyzeRevenue(tenantId, batchId),
        this.analyzeWorkforce(tenantId, batchId),
        this.analyzeFinancial(tenantId, batchId),
        this.analyzeCompliance(tenantId, batchId),
        this.analyzeCoaching(tenantId, batchId),
        this.analyzeEfficiency(tenantId, batchId),
      ]);

      insights.push(...revenue, ...workforce, ...financial, ...compliance, ...coaching, ...efficiency);
    } catch (err: any) {
      console.error(`[aiInsightsEngine] tenant=${tenantId} analysis failed: ${err.message}`);
    }

    if (insights.length === 0) return 0;

    // Build demand heatmap (for real-time positioning)
    try {
      await this.buildDemandHeatmap(tenantId);
    } catch (err: any) {
      console.error(`[aiInsightsEngine] heatmap build failed: ${err.message}`);
    }

    // Bulk create insights — cast data to Prisma InputJsonValue
    await prisma.aiInsight.createMany({
      data: insights.map((i) => ({
        ...i,
        data: (i.data as any) ?? undefined,
      })),
    });

    console.log(`[aiInsightsEngine] tenant=${tenantId} created ${insights.length} insights (batch=${batchId})`);
    return insights.length;
  }

  // ── Revenue Optimization ────────────────────────────────────────────────────

  private static async analyzeRevenue(tenantId: string, batchId: string): Promise<InsightRecord[]> {
    const insights: InsightRecord[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Peak hour prediction — find hours with highest order volume
    const ordersByHour = await prisma.$queryRaw<
      Array<{ hour: number; day_of_week: number; avg_orders: number; total_days: number }>
    >`
      SELECT
        EXTRACT(HOUR FROM date)::int AS hour,
        EXTRACT(DOW FROM date)::int AS day_of_week,
        AVG("orderCount")::float AS avg_orders,
        COUNT(DISTINCT date::date)::int AS total_days
      FROM "OrderLog"
      WHERE "tenantId" = ${tenantId}
        AND date >= ${thirtyDaysAgo}
      GROUP BY EXTRACT(HOUR FROM date), EXTRACT(DOW FROM date)
      ORDER BY avg_orders DESC
      LIMIT 10
    `;

    if (ordersByHour.length > 0) {
      const top = ordersByHour[0];
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      insights.push({
        tenantId,
        batchId,
        category: "REVENUE",
        subcategory: "peak_hours",
        context: "dashboard",
        severity: "OPPORTUNITY",
        title: `Peak demand: ${dayNames[top.day_of_week]}s at ${top.hour}:00`,
        description: `Historical data shows ${dayNames[top.day_of_week]}s at ${top.hour}:00 average ${top.avg_orders.toFixed(1)} orders. Ensure maximum driver coverage during this window.`,
        actionLabel: "View shifts",
        actionHref: "/keeta/shifts",
        data: { peakHours: ordersByHour.slice(0, 5) },
        score: 85,
        expiresAt: hoursFromNow(4),
      });
    }

    // 2. Idle time cost — drivers with high online time but low orders
    const idleDrivers = await prisma.keetaDailyMetrics.findMany({
      where: {
        tenantId,
        date: { gte: thirtyDaysAgo },
        onlineTime: { gt: 60 },
      },
      include: { driver: { select: { id: true, name: true, platform: true, zone: true } } },
    });

    // Group by driver, compute avg idle ratio
    const driverIdleMap = new Map<string, { name: string; platform: string; zone: string | null; totalOnline: number; totalDelivered: number; days: number }>();
    for (const m of idleDrivers) {
      const entry = driverIdleMap.get(m.driverId) ?? {
        name: m.driver.name,
        platform: m.driver.platform,
        zone: m.driver.zone,
        totalOnline: 0,
        totalDelivered: 0,
        days: 0,
      };
      entry.totalOnline += m.onlineTime ?? 0;
      entry.totalDelivered += m.deliveredTasks ?? 0;
      entry.days++;
      driverIdleMap.set(m.driverId, entry);
    }

    const idleList: Array<{ driverId: string; name: string; avgOrdersPerHour: number; avgOnlineHours: number }> = [];
    for (const [driverId, data] of driverIdleMap) {
      if (data.days < 5) continue;
      const avgOnlineHours = data.totalOnline / data.days / 60;
      const avgOrders = data.totalDelivered / data.days;
      const ordersPerHour = avgOnlineHours > 0 ? avgOrders / avgOnlineHours : 0;
      if (ordersPerHour < 1.0 && avgOnlineHours > 2) {
        idleList.push({ driverId, name: data.name, avgOrdersPerHour: ordersPerHour, avgOnlineHours });
      }
    }

    if (idleList.length > 0) {
      idleList.sort((a, b) => a.avgOrdersPerHour - b.avgOrdersPerHour);
      const topIdle = idleList.slice(0, 5);
      insights.push({
        tenantId,
        batchId,
        category: "REVENUE",
        subcategory: "idle_cost",
        context: "keeta/monitor",
        severity: "WARNING",
        title: `${idleList.length} drivers with high idle time`,
        description: `${topIdle[0].name} averages only ${topIdle[0].avgOrdersPerHour.toFixed(1)} orders/hour despite ${topIdle[0].avgOnlineHours.toFixed(1)}h online daily. Reposition these drivers to high-demand zones.`,
        actionLabel: "View monitor",
        actionHref: "/keeta/monitor",
        data: { drivers: topIdle },
        score: 80,
        expiresAt: hoursFromNow(4),
      });
    }

    // 3. Revenue per driver variance — identify low-value order patterns
    const revenueByDriver = await prisma.orderLog.groupBy({
      by: ["driverId"],
      where: { tenantId, date: { gte: thirtyDaysAgo } },
      _sum: { orderCount: true, totalAmount: true },
    });

    const driverRevenues = revenueByDriver
      .filter((r) => (r._sum.orderCount ?? 0) > 20)
      .map((r) => {
        const orders = r._sum.orderCount ?? 1;
        const revenue = r._sum.totalAmount ? Number(r._sum.totalAmount) : 0;
        return {
          driverId: r.driverId,
          orders,
          revenue,
          revenuePerOrder: revenue / orders,
        };
      });

    if (driverRevenues.length > 3) {
      const avgRevPerOrder = driverRevenues.reduce((s, d) => s + d.revenuePerOrder, 0) / driverRevenues.length;
      const lowRevDrivers = driverRevenues.filter((d) => d.revenuePerOrder < avgRevPerOrder * 0.7);

      if (lowRevDrivers.length > 0) {
        // Fetch driver names
        const driverNames = await prisma.driver.findMany({
          where: { tenantId, id: { in: lowRevDrivers.map((d) => d.driverId) } },
          select: { id: true, name: true },
        });
        const nameMap = new Map(driverNames.map((d) => [d.id, d.name]));

        insights.push({
          tenantId,
          batchId,
          category: "REVENUE",
          subcategory: "low_value_orders",
          context: "analytics",
          severity: "OPPORTUNITY",
          title: `${lowRevDrivers.length} drivers getting below-average order values`,
          description: `Fleet average is ${avgRevPerOrder.toFixed(3)} KD/order. ${nameMap.get(lowRevDrivers[0].driverId) ?? "Some drivers"} average only ${lowRevDrivers[0].revenuePerOrder.toFixed(3)} KD. Consider reassigning to higher-value zones.`,
          actionLabel: "View analytics",
          actionHref: "/analytics",
          data: {
            avgRevPerOrder,
            lowRevDrivers: lowRevDrivers.slice(0, 5).map((d) => ({
              driverId: d.driverId,
              name: nameMap.get(d.driverId),
              revenuePerOrder: d.revenuePerOrder,
            })),
          },
          score: 70,
          expiresAt: hoursFromNow(4),
        });
      }
    }

    return insights;
  }

  // ── Workforce Optimization ──────────────────────────────────────────────────

  private static async analyzeWorkforce(tenantId: string, batchId: string): Promise<InsightRecord[]> {
    const insights: InsightRecord[] = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Recurring absence patterns
    const absences = await prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        status: "ABSENT",
        date: { gte: thirtyDaysAgo },
      },
      include: { driver: { select: { id: true, name: true, platform: true } } },
    });

    // Group by driver + day-of-week
    const absByDriverDay = new Map<string, Map<number, number>>();
    const driverNames = new Map<string, string>();
    for (const a of absences) {
      const dow = a.date.getDay();
      if (!absByDriverDay.has(a.driverId)) absByDriverDay.set(a.driverId, new Map());
      const dmap = absByDriverDay.get(a.driverId)!;
      dmap.set(dow, (dmap.get(dow) ?? 0) + 1);
      driverNames.set(a.driverId, a.driver.name);
    }

    const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const recurringAbsent: Array<{ driverId: string; name: string; day: string; count: number }> = [];
    for (const [driverId, dmap] of absByDriverDay) {
      for (const [dow, count] of dmap) {
        if (count >= 3) {
          recurringAbsent.push({ driverId, name: driverNames.get(driverId) ?? "", day: dayLabels[dow], count });
        }
      }
    }

    if (recurringAbsent.length > 0) {
      insights.push({
        tenantId,
        batchId,
        category: "WORKFORCE",
        subcategory: "recurring_absence",
        context: "attendance",
        severity: "WARNING",
        title: `${recurringAbsent.length} drivers with recurring absence patterns`,
        description: `${recurringAbsent[0].name} has been absent ${recurringAbsent[0].count} ${recurringAbsent[0].day}s this month. Schedule backup drivers for these predictable gaps.`,
        actionLabel: "View attendance",
        actionHref: "/attendance",
        data: { patterns: recurringAbsent.slice(0, 10) },
        score: 75,
        expiresAt: hoursFromNow(4),
      });
    }

    // 2. Understaffed zones — compare shift coverage vs order volume by zone
    const shiftsByZone = await prisma.shift.groupBy({
      by: ["zone"],
      where: {
        tenantId,
        date: { gte: sevenDaysAgo },
        status: { in: ["COMPLETED", "IN_PROGRESS"] },
        zone: { not: null },
      },
      _count: true,
    });

    // Get orders per zone via driver's assigned zone
    const ordersWithDriverZone = await prisma.orderLog.findMany({
      where: { tenantId, date: { gte: sevenDaysAgo } },
      select: { orderCount: true, driver: { select: { zone: true } } },
    });

    const ordersByZone = new Map<string, number>();
    for (const o of ordersWithDriverZone) {
      const zone = o.driver.zone;
      if (!zone) continue;
      ordersByZone.set(zone, (ordersByZone.get(zone) ?? 0) + o.orderCount);
    }

    const zoneMap = new Map<string, { shifts: number; orders: number }>();
    for (const s of shiftsByZone) {
      if (!s.zone) continue;
      const entry = zoneMap.get(s.zone) ?? { shifts: 0, orders: 0 };
      entry.shifts = s._count;
      zoneMap.set(s.zone, entry);
    }
    for (const [zone, orders] of ordersByZone) {
      const entry = zoneMap.get(zone) ?? { shifts: 0, orders: 0 };
      entry.orders = orders;
      zoneMap.set(zone, entry);
    }

    const understaffed: Array<{ zone: string; ordersPerShift: number; shifts: number; orders: number }> = [];
    for (const [zone, data] of zoneMap) {
      if (data.shifts === 0) continue;
      const ordersPerShift = data.orders / data.shifts;
      if (ordersPerShift > 15) {
        understaffed.push({ zone, ordersPerShift, ...data });
      }
    }

    if (understaffed.length > 0) {
      understaffed.sort((a, b) => b.ordersPerShift - a.ordersPerShift);
      insights.push({
        tenantId,
        batchId,
        category: "WORKFORCE",
        subcategory: "understaffed_zones",
        context: "keeta/shifts",
        severity: "CRITICAL",
        title: `${understaffed.length} zones are understaffed`,
        description: `${understaffed[0].zone} has ${understaffed[0].ordersPerShift.toFixed(0)} orders per driver shift — well above optimal. Add more drivers to this zone.`,
        actionLabel: "Manage shifts",
        actionHref: "/keeta/shifts",
        data: { zones: understaffed as any },
        score: 90,
        expiresAt: hoursFromNow(4),
      });
    }

    // 3. Driver-area performance matching — compare orders when driver worked in different zones
    const shiftsWithOrders = await prisma.shift.findMany({
      where: {
        tenantId,
        date: { gte: thirtyDaysAgo },
        zone: { not: null },
        status: "COMPLETED",
      },
      select: {
        driverId: true,
        zone: true,
        orderLogs: { select: { orderCount: true } },
      },
    });

    const driverZones = new Map<string, Map<string, { totalOrders: number; days: number }>>();
    for (const s of shiftsWithOrders) {
      if (!s.zone) continue;
      if (!driverZones.has(s.driverId)) driverZones.set(s.driverId, new Map());
      const zmap = driverZones.get(s.driverId)!;
      const entry = zmap.get(s.zone) ?? { totalOrders: 0, days: 0 };
      entry.totalOrders += s.orderLogs.reduce((sum, o) => sum + o.orderCount, 0);
      entry.days++;
      zmap.set(s.zone, entry);
    }

    const reassignCandidates: Array<{ driverId: string; currentZone: string; betterZone: string; improvement: number }> = [];
    for (const [driverId, zmap] of driverZones) {
      if (zmap.size < 2) continue;
      const zonePerf = [...zmap.entries()]
        .filter(([, d]) => d.days >= 3)
        .map(([zone, d]) => ({ zone, avgOrders: d.totalOrders / d.days, days: d.days }))
        .sort((a, b) => b.avgOrders - a.avgOrders);
      if (zonePerf.length < 2) continue;
      const best = zonePerf[0];
      const worst = zonePerf[zonePerf.length - 1];
      if (best.avgOrders > worst.avgOrders * 1.3) {
        reassignCandidates.push({
          driverId,
          currentZone: worst.zone,
          betterZone: best.zone,
          improvement: ((best.avgOrders - worst.avgOrders) / worst.avgOrders) * 100,
        });
      }
    }

    if (reassignCandidates.length > 0) {
      reassignCandidates.sort((a, b) => b.improvement - a.improvement);
      const top = reassignCandidates[0];
      const names = await prisma.driver.findMany({
        where: { tenantId, id: { in: reassignCandidates.slice(0, 5).map((c) => c.driverId) } },
        select: { id: true, name: true },
      });
      const nameMap = new Map(names.map((d) => [d.id, d.name]));

      insights.push({
        tenantId,
        batchId,
        category: "WORKFORCE",
        subcategory: "driver_area_match",
        context: "keeta/shifts",
        severity: "OPPORTUNITY",
        title: `${reassignCandidates.length} drivers could perform better in different zones`,
        description: `${nameMap.get(top.driverId) ?? "A driver"} completes ${top.improvement.toFixed(0)}% more orders in ${top.betterZone} than ${top.currentZone}. Consider reassigning.`,
        actionLabel: "View shifts",
        actionHref: "/keeta/shifts",
        data: {
          candidates: reassignCandidates.slice(0, 5).map((c) => ({
            ...c,
            name: nameMap.get(c.driverId),
          })) as any,
        },
        score: 72,
        expiresAt: hoursFromNow(4),
      });
    }

    return insights;
  }

  // ── Financial Health ────────────────────────────────────────────────────────

  private static async analyzeFinancial(tenantId: string, batchId: string): Promise<InsightRecord[]> {
    const insights: InsightRecord[] = [];
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Cash collection priority matrix
    const openLedgers = await prisma.pendingDuesLedger.findMany({
      where: {
        tenantId,
        status: "OPEN",
        closingBalance: { gt: 0 },
        month: { gte: currentMonth },
      },
      include: { driver: { select: { id: true, name: true, platform: true } } },
      orderBy: { closingBalance: "desc" },
    });

    if (openLedgers.length > 0) {
      const totalPending = openLedgers.reduce((s, l) => s + parseFloat(l.closingBalance.toString()), 0);

      // Compute risk score for each driver
      const prioritized = openLedgers.map((ledger) => {
        const amount = parseFloat(ledger.closingBalance.toString());
        const daily = (ledger.dailyCollections as Record<string, number>) ?? {};
        const lastCollectionDay = Object.entries(daily)
          .filter(([, v]) => v > 0)
          .map(([k]) => parseInt(k))
          .sort((a, b) => b - a)[0] ?? 0;
        const daysSince = lastCollectionDay > 0 ? now.getDate() - lastCollectionDay : 30;
        const riskScore = amount * Math.max(1, daysSince) * (daysSince > 5 ? 1.5 : 1);

        return {
          driverId: ledger.driverId,
          name: ledger.driver.name,
          platform: ledger.driver.platform,
          amount,
          daysSinceCollection: daysSince,
          riskScore,
        };
      }).sort((a, b) => b.riskScore - a.riskScore);

      const highRisk = prioritized.filter((p) => p.daysSinceCollection >= 5);

      insights.push({
        tenantId,
        batchId,
        category: "FINANCIAL",
        subcategory: "cash_priority",
        context: "talabat/cash",
        severity: highRisk.length > 3 ? "CRITICAL" : "WARNING",
        title: `${totalPending.toFixed(3)} KD pending from ${openLedgers.length} drivers`,
        description: highRisk.length > 0
          ? `${highRisk[0].name} owes ${highRisk[0].amount.toFixed(3)} KD and hasn't collected in ${highRisk[0].daysSinceCollection} days. Collect from top ${Math.min(5, prioritized.length)} drivers first to recover ${prioritized.slice(0, 5).reduce((s, p) => s + p.amount, 0).toFixed(3)} KD.`
          : `Total of ${totalPending.toFixed(3)} KD pending. Follow up with ${prioritized[0].name} (${prioritized[0].amount.toFixed(3)} KD) first.`,
        actionLabel: "View cash",
        actionHref: "/talabat/cash",
        data: { totalPending, driverCount: openLedgers.length, priority: prioritized.slice(0, 10) },
        score: 88,
        expiresAt: hoursFromNow(4),
      });

      // Also push to dashboard
      insights.push({
        tenantId,
        batchId,
        category: "FINANCIAL",
        subcategory: "cash_summary",
        context: "dashboard",
        severity: totalPending > 1000 ? "CRITICAL" : "WARNING",
        title: `${totalPending.toFixed(3)} KD in outstanding cash`,
        description: `${openLedgers.length} drivers have pending cash. ${highRisk.length} are overdue (5+ days). Prioritize collection to maintain cash flow.`,
        actionLabel: "Collect cash",
        actionHref: "/talabat/cash",
        data: { totalPending, highRiskCount: highRisk.length },
        score: totalPending > 1000 ? 92 : 78,
        expiresAt: hoursFromNow(4),
      });
    }

    // 2. Revenue leakage — drivers with declining orders but stable online hours
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fifteenDaysAgo = new Date(now);
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const recentOrders = await prisma.orderLog.groupBy({
      by: ["driverId"],
      where: { tenantId, date: { gte: fifteenDaysAgo } },
      _sum: { orderCount: true },
      _count: true,
    });

    const olderOrders = await prisma.orderLog.groupBy({
      by: ["driverId"],
      where: { tenantId, date: { gte: thirtyDaysAgo, lt: fifteenDaysAgo } },
      _sum: { orderCount: true },
      _count: true,
    });

    const olderMap = new Map(olderOrders.map((o) => [o.driverId, { sum: o._sum.orderCount ?? 0, days: o._count }]));

    const declining: Array<{ driverId: string; recentAvg: number; olderAvg: number; decline: number }> = [];
    for (const r of recentOrders) {
      const older = olderMap.get(r.driverId);
      if (!older || older.days < 5 || r._count < 5) continue;
      const recentAvg = (r._sum.orderCount ?? 0) / r._count;
      const olderAvg = older.sum / older.days;
      if (olderAvg > 5 && recentAvg < olderAvg * 0.6) {
        declining.push({ driverId: r.driverId, recentAvg, olderAvg, decline: ((olderAvg - recentAvg) / olderAvg) * 100 });
      }
    }

    if (declining.length > 0) {
      declining.sort((a, b) => b.decline - a.decline);
      const names = await prisma.driver.findMany({
        where: { tenantId, id: { in: declining.slice(0, 5).map((d) => d.driverId) } },
        select: { id: true, name: true },
      });
      const nameMap = new Map(names.map((d) => [d.id, d.name]));
      const top = declining[0];

      insights.push({
        tenantId,
        batchId,
        category: "FINANCIAL",
        subcategory: "revenue_leakage",
        context: "analytics",
        severity: "WARNING",
        title: `${declining.length} drivers with declining order volume`,
        description: `${nameMap.get(top.driverId) ?? "A driver"}'s orders dropped ${top.decline.toFixed(0)}% (from ${top.olderAvg.toFixed(1)} to ${top.recentAvg.toFixed(1)}/day). Investigate and coach.`,
        actionLabel: "View analytics",
        actionHref: "/analytics",
        data: {
          drivers: declining.slice(0, 5).map((d) => ({ ...d, name: nameMap.get(d.driverId) })),
        },
        score: 74,
        expiresAt: hoursFromNow(4),
      });
    }

    return insights;
  }

  // ── Compliance & Risk ───────────────────────────────────────────────────────

  private static async analyzeCompliance(tenantId: string, batchId: string): Promise<InsightRecord[]> {
    const insights: InsightRecord[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Violation trend analysis
    const recentViolations = await prisma.violation.findMany({
      where: { tenantId, violationTime: { gte: thirtyDaysAgo } },
      include: { driver: { select: { id: true, name: true, platform: true } } },
      orderBy: { violationTime: "desc" },
    });

    // Group by driver and compute weekly trend — skip platform-level (driverless) violations
    const driverViolations = new Map<string, { name: string; platform: string; weeks: Map<number, number> }>();
    for (const v of recentViolations) {
      if (!v.driverId || !v.driver) continue;
      if (!driverViolations.has(v.driverId)) {
        driverViolations.set(v.driverId, { name: v.driver.name, platform: v.driver.platform, weeks: new Map() });
      }
      const weekNum = Math.floor((now.getTime() - v.violationTime.getTime()) / (7 * 86400_000));
      const entry = driverViolations.get(v.driverId)!;
      entry.weeks.set(weekNum, (entry.weeks.get(weekNum) ?? 0) + 1);
    }

    const escalating: Array<{ driverId: string; name: string; thisWeek: number; lastWeek: number }> = [];
    for (const [driverId, data] of driverViolations) {
      const thisWeek = data.weeks.get(0) ?? 0;
      const lastWeek = data.weeks.get(1) ?? 0;
      if (thisWeek > lastWeek && thisWeek >= 2) {
        escalating.push({ driverId, name: data.name, thisWeek, lastWeek });
      }
    }

    if (escalating.length > 0) {
      escalating.sort((a, b) => b.thisWeek - a.thisWeek);
      insights.push({
        tenantId,
        batchId,
        category: "COMPLIANCE",
        subcategory: "violation_trend",
        context: "keeta/violations",
        severity: "CRITICAL",
        title: `${escalating.length} drivers with escalating violations`,
        description: `${escalating[0].name} had ${escalating[0].thisWeek} violations this week (up from ${escalating[0].lastWeek} last week). Intervene before platform suspension.`,
        actionLabel: "View violations",
        actionHref: "/keeta/violations",
        data: { drivers: escalating.slice(0, 10) },
        score: 95,
        expiresAt: hoursFromNow(4),
      });
    }

    // 2. Document expiry calendar (next 30 days)
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 30);

    const driversWithExpiring = await prisma.driver.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        OR: [
          { healthCertExpiry: { gte: now, lte: futureDate } },
          { workPermitExpiry: { gte: now, lte: futureDate } },
          { foodHandlingCertExpiry: { gte: now, lte: futureDate } },
          { vehicleRegExpiry: { gte: now, lte: futureDate } },
          { vehicleInsuranceExpiry: { gte: now, lte: futureDate } },
          { drivingLicenseExpiry: { gte: now, lte: futureDate } },
          { civilIdExpiry: { gte: now, lte: futureDate } },
        ],
      },
      select: {
        id: true, name: true, platform: true,
        healthCertExpiry: true, workPermitExpiry: true, foodHandlingCertExpiry: true,
        vehicleRegExpiry: true, vehicleInsuranceExpiry: true, drivingLicenseExpiry: true,
        civilIdExpiry: true,
      },
    });

    if (driversWithExpiring.length > 0) {
      // Count docs expiring this week vs next week
      const oneWeek = new Date(now);
      oneWeek.setDate(oneWeek.getDate() + 7);

      let thisWeekCount = 0;
      const docFields = [
        "healthCertExpiry", "workPermitExpiry", "foodHandlingCertExpiry",
        "vehicleRegExpiry", "vehicleInsuranceExpiry", "drivingLicenseExpiry", "civilIdExpiry",
      ] as const;

      for (const d of driversWithExpiring) {
        for (const field of docFields) {
          const expiry = d[field];
          if (expiry && expiry >= now && expiry <= oneWeek) thisWeekCount++;
        }
      }

      insights.push({
        tenantId,
        batchId,
        category: "COMPLIANCE",
        subcategory: "document_expiry",
        context: "dashboard",
        severity: thisWeekCount > 3 ? "CRITICAL" : "WARNING",
        title: `${driversWithExpiring.length} drivers have documents expiring soon`,
        description: `${thisWeekCount} documents expire this week. Renew immediately to avoid driver deactivation and lost delivery capacity.`,
        actionLabel: "View drivers",
        actionHref: "/talabat/drivers/docs-expiring",
        data: {
          thisWeekCount,
          totalDrivers: driversWithExpiring.length,
          drivers: driversWithExpiring.slice(0, 10).map((d) => ({ id: d.id, name: d.name, platform: d.platform })),
        },
        score: thisWeekCount > 3 ? 93 : 80,
        expiresAt: hoursFromNow(4),
      });
    }

    // 3. Cross-platform violation comparison
    const violationsByPlatform = new Map<string, number>();
    const driversByPlatform = new Map<string, number>();

    for (const v of recentViolations) {
      violationsByPlatform.set(v.platform, (violationsByPlatform.get(v.platform) ?? 0) + 1);
    }

    const activeDrivers = await prisma.driver.groupBy({
      by: ["platform"],
      where: { tenantId, status: "ACTIVE" },
      _count: true,
    });

    for (const d of activeDrivers) {
      driversByPlatform.set(d.platform, d._count);
    }

    const platformRates: Array<{ platform: string; rate: number; violations: number; drivers: number }> = [];
    for (const [platform, violations] of violationsByPlatform) {
      const drivers = driversByPlatform.get(platform) ?? 1;
      platformRates.push({ platform, rate: violations / drivers, violations, drivers });
    }

    if (platformRates.length >= 2) {
      platformRates.sort((a, b) => b.rate - a.rate);
      const worst = platformRates[0];
      const best = platformRates[platformRates.length - 1];

      if (worst.rate > best.rate * 2) {
        insights.push({
          tenantId,
          batchId,
          category: "COMPLIANCE",
          subcategory: "platform_comparison",
          context: "analytics",
          severity: "WARNING",
          title: `${worst.platform} violation rate is ${(worst.rate / best.rate).toFixed(1)}x higher than ${best.platform}`,
          description: `${worst.platform} has ${worst.rate.toFixed(1)} violations/driver vs ${best.rate.toFixed(1)} for ${best.platform}. Investigate root cause — training, area, or platform-specific issues.`,
          actionLabel: "Compare platforms",
          actionHref: "/analytics",
          data: { platforms: platformRates },
          score: 70,
          expiresAt: hoursFromNow(4),
        });
      }
    }

    return insights;
  }

  // ── Performance Coaching ────────────────────────────────────────────────────

  private static async analyzeCoaching(tenantId: string, batchId: string): Promise<InsightRecord[]> {
    const insights: InsightRecord[] = [];
    const now = new Date();

    // 1. Improvement trend recognition — drivers with 3+ weeks of score improvement
    const scores = await prisma.aiScore.findMany({
      where: { tenantId },
      orderBy: { date: "desc" },
      include: { driver: { select: { id: true, name: true, platform: true } } },
    });

    // Group by driver, check trend
    const driverScores = new Map<string, Array<{ date: Date; composite: number }>>();
    const driverInfo = new Map<string, { name: string; platform: string }>();
    for (const s of scores) {
      if (!driverScores.has(s.driverId)) driverScores.set(s.driverId, []);
      driverScores.get(s.driverId)!.push({ date: s.date, composite: s.compositeScore });
      driverInfo.set(s.driverId, { name: s.driver.name, platform: s.driver.platform });
    }

    const improving: Array<{ driverId: string; name: string; currentScore: number; improvement: number }> = [];
    const struggling: Array<{ driverId: string; name: string; currentScore: number; weakest: string; weakestScore: number }> = [];

    for (const [driverId, history] of driverScores) {
      if (history.length < 14) continue; // Need at least 2 weeks of data
      const recent7 = history.slice(0, 7);
      const older7 = history.slice(7, 14);
      const recentAvg = recent7.reduce((s, h) => s + h.composite, 0) / recent7.length;
      const olderAvg = older7.reduce((s, h) => s + h.composite, 0) / older7.length;

      if (recentAvg > olderAvg + 5) {
        improving.push({
          driverId,
          name: driverInfo.get(driverId)?.name ?? "",
          currentScore: recentAvg,
          improvement: recentAvg - olderAvg,
        });
      }
    }

    if (improving.length > 0) {
      improving.sort((a, b) => b.improvement - a.improvement);
      insights.push({
        tenantId,
        batchId,
        category: "COACHING",
        subcategory: "improving_drivers",
        context: "supervisors",
        severity: "OPPORTUNITY",
        title: `${improving.length} drivers showing consistent improvement`,
        description: `${improving[0].name} improved by ${improving[0].improvement.toFixed(0)} points this week (score: ${improving[0].currentScore.toFixed(0)}). Recognize and reward to maintain momentum.`,
        actionLabel: "View scores",
        actionHref: "/analytics",
        data: { drivers: improving.slice(0, 10) },
        score: 65,
        expiresAt: hoursFromNow(4),
      });
    }

    // 2. Struggling drivers — low scores with specific weak areas
    const latestScores = await prisma.aiScore.findMany({
      where: { tenantId },
      orderBy: { date: "desc" },
      distinct: ["driverId"],
      include: { driver: { select: { id: true, name: true, platform: true } } },
    });

    for (const s of latestScores) {
      if (s.compositeScore >= 50) continue;
      const components = [
        { name: "attendance", score: s.attendanceScore },
        { name: "delivery", score: s.deliveryScore },
        { name: "financial", score: s.financialScore },
        { name: "equipment", score: s.equipmentScore },
        { name: "platform", score: s.platformScore },
      ];
      components.sort((a, b) => a.score - b.score);
      const weakest = components[0];

      struggling.push({
        driverId: s.driverId,
        name: s.driver.name,
        currentScore: s.compositeScore,
        weakest: weakest.name,
        weakestScore: weakest.score,
      });
    }

    if (struggling.length > 0) {
      struggling.sort((a, b) => a.currentScore - b.currentScore);

      // Group by weakest area for training needs
      const trainingNeeds = new Map<string, number>();
      for (const s of struggling) {
        trainingNeeds.set(s.weakest, (trainingNeeds.get(s.weakest) ?? 0) + 1);
      }

      insights.push({
        tenantId,
        batchId,
        category: "COACHING",
        subcategory: "struggling_drivers",
        context: "keeta/performance",
        severity: "WARNING",
        title: `${struggling.length} drivers need coaching (score < 50)`,
        description: `${struggling[0].name} scores ${struggling[0].currentScore.toFixed(0)}/100 — weakest in ${struggling[0].weakest} (${struggling[0].weakestScore.toFixed(0)}). Pair with a top performer for mentoring.`,
        actionLabel: "View performance",
        actionHref: "/keeta/performance",
        data: {
          drivers: struggling.slice(0, 10),
          trainingNeeds: Object.fromEntries(trainingNeeds),
        },
        score: 78,
        expiresAt: hoursFromNow(4),
      });

      // Training needs insight
      if (trainingNeeds.size > 0) {
        const topNeed = [...trainingNeeds.entries()].sort((a, b) => b[1] - a[1])[0];
        insights.push({
          tenantId,
          batchId,
          category: "COACHING",
          subcategory: "training_needs",
          context: "supervisors",
          severity: "OPPORTUNITY",
          title: `${topNeed[1]} drivers need ${topNeed[0]} training`,
          description: `The most common weak area is ${topNeed[0]} — ${topNeed[1]} drivers score below 50 in this category. Consider a group training session to address this efficiently.`,
          actionLabel: "View supervisors",
          actionHref: "/supervisors",
          data: { needs: Object.fromEntries(trainingNeeds) },
          score: 60,
          expiresAt: hoursFromNow(4),
        });
      }
    }

    return insights;
  }

  // ── Operational Efficiency ──────────────────────────────────────────────────

  private static async analyzeEfficiency(tenantId: string, batchId: string): Promise<InsightRecord[]> {
    const insights: InsightRecord[] = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 1. Order rejection analysis
    const keetaMetrics = await prisma.keetaDailyMetrics.findMany({
      where: { tenantId, date: { gte: sevenDaysAgo } },
      include: { driver: { select: { id: true, name: true, zone: true } } },
    });

    if (keetaMetrics.length > 0) {
      let totalRejected = 0;
      let totalOrders = 0;
      const rejectionsByDriver: Array<{ driverId: string; name: string; rejected: number; total: number; rate: number }> = [];
      const driverRejMap = new Map<string, { name: string; rejected: number; total: number }>();

      for (const m of keetaMetrics) {
        const rejected = (m.rejectedByCourier ?? 0) + (m.rejectedAuto ?? 0);
        const total = (m.deliveredTasks ?? 0) + rejected;
        totalRejected += rejected;
        totalOrders += total;

        const entry = driverRejMap.get(m.driverId) ?? { name: m.driver.name, rejected: 0, total: 0 };
        entry.rejected += rejected;
        entry.total += total;
        driverRejMap.set(m.driverId, entry);
      }

      for (const [driverId, data] of driverRejMap) {
        if (data.total < 10) continue;
        const rate = data.rejected / data.total;
        if (rate > 0.15) {
          rejectionsByDriver.push({ driverId, name: data.name, rejected: data.rejected, total: data.total, rate });
        }
      }

      if (rejectionsByDriver.length > 0) {
        rejectionsByDriver.sort((a, b) => b.rate - a.rate);
        const fleetRate = totalOrders > 0 ? (totalRejected / totalOrders) * 100 : 0;

        insights.push({
          tenantId,
          batchId,
          category: "EFFICIENCY",
          subcategory: "order_rejections",
          context: "keeta/monitor",
          severity: "WARNING",
          title: `${rejectionsByDriver.length} drivers with high rejection rates`,
          description: `${rejectionsByDriver[0].name} rejects ${(rejectionsByDriver[0].rate * 100).toFixed(0)}% of orders (fleet avg: ${fleetRate.toFixed(0)}%). Each rejection is a lost sale and hurts platform ranking.`,
          actionLabel: "View monitor",
          actionHref: "/keeta/monitor",
          data: {
            fleetRejectionRate: fleetRate,
            drivers: rejectionsByDriver.slice(0, 5),
          },
          score: 82,
          expiresAt: hoursFromNow(4),
        });
      }
    }

    // 2. Delivery time analysis
    const slowDeliveries = keetaMetrics.filter((m) => Number(m.avgDeliveryMinutes ?? 0) > 40);
    if (slowDeliveries.length > 5) {
      const driverSlowMap = new Map<string, { name: string; zone: string | null; totalMinutes: number; count: number }>();
      for (const m of slowDeliveries) {
        const entry = driverSlowMap.get(m.driverId) ?? { name: m.driver.name, zone: m.driver.zone, totalMinutes: 0, count: 0 };
        entry.totalMinutes += Number(m.avgDeliveryMinutes ?? 0);
        entry.count++;
        driverSlowMap.set(m.driverId, entry);
      }

      const slowDrivers = [...driverSlowMap.entries()]
        .map(([id, d]) => ({ driverId: id, name: d.name, zone: d.zone, avgMinutes: d.totalMinutes / d.count }))
        .filter((d) => d.avgMinutes > 40)
        .sort((a, b) => b.avgMinutes - a.avgMinutes);

      if (slowDrivers.length > 0) {
        insights.push({
          tenantId,
          batchId,
          category: "EFFICIENCY",
          subcategory: "slow_deliveries",
          context: "keeta/performance",
          severity: "WARNING",
          title: `${slowDrivers.length} drivers with slow delivery times`,
          description: `${slowDrivers[0].name} averages ${slowDrivers[0].avgMinutes.toFixed(0)} min/delivery${slowDrivers[0].zone ? ` in ${slowDrivers[0].zone}` : ""}. Investigate if it's routing, traffic, or merchant wait times.`,
          actionLabel: "View performance",
          actionHref: "/keeta/performance",
          data: { drivers: slowDrivers.slice(0, 5) },
          score: 68,
          expiresAt: hoursFromNow(4),
        });
      }
    }

    // 3. Device health — low battery warnings
    const lowBatteryDevices = await prisma.device.findMany({
      where: {
        tenantId,
        isOnline: true,
        batteryLevel: { lt: 20 },
      },
      include: { driver: { select: { id: true, name: true } } },
    });

    if (lowBatteryDevices.length > 0) {
      insights.push({
        tenantId,
        batchId,
        category: "EFFICIENCY",
        subcategory: "device_health",
        context: "keeta/phones",
        severity: lowBatteryDevices.length > 5 ? "WARNING" : "INFO",
        title: `${lowBatteryDevices.length} online devices with low battery`,
        description: `${lowBatteryDevices[0].driver?.name ?? "A driver"}'s phone is at ${lowBatteryDevices[0].batteryLevel}%. Low battery leads to GPS failures and missed orders. Issue power banks.`,
        actionLabel: "View phones",
        actionHref: "/keeta/phones",
        data: {
          devices: lowBatteryDevices.map((d) => ({
            driverId: d.driverId,
            name: d.driver?.name,
            battery: d.batteryLevel,
            model: d.model,
          })),
        },
        score: 55,
        expiresAt: hoursFromNow(4),
      });
    }

    return insights;
  }

  // ── Demand Heatmap Builder ──────────────────────────────────────────────────

  static async buildDemandHeatmap(tenantId: string): Promise<void> {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    // Aggregate orders by zone, day-of-week, hour
    const heatmapData = await prisma.$queryRaw<
      Array<{
        zone: string;
        platform: string;
        day_of_week: number;
        hour: number;
        avg_orders: number;
        total_days: number;
        restaurant_name: string | null;
        restaurant_orders: number;
      }>
    >`
      SELECT
        zone,
        d.platform::text as platform,
        EXTRACT(DOW FROM ol.date)::int AS day_of_week,
        EXTRACT(HOUR FROM ol.date)::int AS hour,
        AVG(ol."orderCount")::float AS avg_orders,
        COUNT(DISTINCT ol.date::date)::int AS total_days,
        ol."restaurantName" AS restaurant_name,
        SUM(ol."orderCount")::int AS restaurant_orders
      FROM "OrderLog" ol
      JOIN "Driver" d ON d.id = ol."driverId"
      WHERE ol."tenantId" = ${tenantId}
        AND ol.date >= ${fourWeeksAgo}
        AND d.zone IS NOT NULL
      GROUP BY d.zone, d.platform, EXTRACT(DOW FROM ol.date), EXTRACT(HOUR FROM ol.date), ol."restaurantName"
      ORDER BY avg_orders DESC
    `;

    // Group into heatmap cells
    const cells = new Map<string, {
      zone: string;
      platform: string;
      dayOfWeek: number;
      hourSlot: number;
      totalOrders: number;
      totalDays: number;
      restaurants: Map<string, number>;
    }>();

    for (const row of heatmapData) {
      if (!row.zone) continue;
      const key = `${row.zone}|${row.platform}|${row.day_of_week}|${row.hour}`;
      if (!cells.has(key)) {
        cells.set(key, {
          zone: row.zone,
          platform: row.platform,
          dayOfWeek: row.day_of_week,
          hourSlot: row.hour,
          totalOrders: 0,
          totalDays: row.total_days,
          restaurants: new Map(),
        });
      }
      const cell = cells.get(key)!;
      cell.totalOrders += row.avg_orders;
      if (row.restaurant_name) {
        cell.restaurants.set(
          row.restaurant_name,
          (cell.restaurants.get(row.restaurant_name) ?? 0) + (row.restaurant_orders ?? 0)
        );
      }
    }

    // Upsert heatmap records
    for (const [, cell] of cells) {
      const topRestaurants = [...cell.restaurants.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, orders]) => ({ name, avgOrders: orders / Math.max(1, cell.totalDays) }));

      const confidence = Math.min(1, cell.totalDays / 20);

      await prisma.demandHeatmap.upsert({
        where: {
          tenantId_platform_zone_dayOfWeek_hourSlot: {
            tenantId,
            platform: cell.platform,
            zone: cell.zone,
            dayOfWeek: cell.dayOfWeek,
            hourSlot: cell.hourSlot,
          },
        },
        update: {
          avgOrders: cell.totalOrders,
          topRestaurants: topRestaurants as any,
          confidence,
        },
        create: {
          tenantId,
          platform: cell.platform,
          zone: cell.zone,
          dayOfWeek: cell.dayOfWeek,
          hourSlot: cell.hourSlot,
          avgOrders: cell.totalOrders,
          topRestaurants: topRestaurants as any,
          confidence,
        },
      });
    }

    console.log(`[aiInsightsEngine] built demand heatmap: ${cells.size} cells for tenant=${tenantId}`);
  }
}
