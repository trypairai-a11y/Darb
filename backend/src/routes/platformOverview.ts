import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { cacheGet, cacheSet } from "../utils/cache";

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── R2 · Talabat restructured overview ─────────────────────────────────────
//
// Shape:
//   { window: {start, end},
//     zones: [{ name, scheduled, online, late, noShow, gpsStale }],
//     attention: [{ id, severity, title, action: { type, payload } }],
//     kpis: { ordersCompleted, onTimeRate, utr,
//             dodPct: { ordersCompleted, onTimeRate, utr } } }
router.get("/talabat/live", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const platform = "TALABAT" as const;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const yStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const sixtyMinAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // ── Zones (derived from Driver.zone) ─────────────────────────────────
    const [drivers, todayAttendance, onlineSessions] = await Promise.all([
      prisma.driver.findMany({
        where: { tenantId, platform, status: "ACTIVE" },
        select: { id: true, name: true, phone: true, zone: true },
      }),
      prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          date: { gte: todayStart, lt: todayEnd },
          driver: { platform },
        },
        select: { driverId: true, status: true, lateMinutes: true },
      }),
      prisma.courierOnlineSession.findMany({
        where: {
          tenantId,
          isOnline: true,
          driver: { platform },
        },
        select: { driverId: true, lastGpsAt: true, area: true },
      }),
    ]);

    const attByDriver = new Map(todayAttendance.map((a) => [a.driverId, a]));
    const onlineByDriver = new Map(onlineSessions.map((s) => [s.driverId, s]));
    const staleCutoff = new Date(now.getTime() - 15 * 60 * 1000);

    type ZoneAgg = {
      name: string;
      scheduled: number;
      online: number;
      late: number;
      noShow: number;
      gpsStale: number;
    };
    const zones = new Map<string, ZoneAgg>();
    const ensureZone = (name: string): ZoneAgg => {
      if (!zones.has(name))
        zones.set(name, { name, scheduled: 0, online: 0, late: 0, noShow: 0, gpsStale: 0 });
      return zones.get(name)!;
    };

    for (const d of drivers) {
      const zoneName = d.zone ?? "Unassigned";
      const z = ensureZone(zoneName);
      const att = attByDriver.get(d.id);
      if (att) z.scheduled += 1;
      if (onlineByDriver.has(d.id)) z.online += 1;
      if (att?.status === "LATE") z.late += 1;
      if (att?.status === "ABSENT") z.noShow += 1;
      const s = onlineByDriver.get(d.id);
      if (s?.lastGpsAt && s.lastGpsAt < staleCutoff) z.gpsStale += 1;
    }

    const zoneRows = [...zones.values()].sort((a, b) => b.scheduled - a.scheduled);

    // ── Attention list ───────────────────────────────────────────────────
    const attention: Array<{
      id: string;
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      title: string;
      action: { type: string; payload: any };
    }> = [];

    for (const d of drivers) {
      const att = attByDriver.get(d.id);
      if (att?.status === "ABSENT") {
        attention.push({
          id: `absent-${d.id}`,
          severity: "HIGH",
          title: `${d.name} is marked absent — call`,
          action: { type: "CALL", payload: { driverId: d.id, phone: d.phone } },
        });
      }
      if (att?.status === "LATE" && (att.lateMinutes ?? 0) >= 15) {
        attention.push({
          id: `late-${d.id}`,
          severity: "MEDIUM",
          title: `${d.name} is ${att.lateMinutes}m late`,
          action: { type: "CALL", payload: { driverId: d.id, phone: d.phone } },
        });
      }
      const s = onlineByDriver.get(d.id);
      if (s?.lastGpsAt && s.lastGpsAt < staleCutoff) {
        attention.push({
          id: `gps-${d.id}`,
          severity: "HIGH",
          title: `${d.name} GPS stale since ${s.lastGpsAt.toISOString().slice(11, 16)}`,
          action: { type: "OPEN_DRIVER", payload: { driverId: d.id } },
        });
      }
    }

    // Recent rejections (from OrderLog status if available — aggregate count only)
    const recentRejectionCount = await prisma.orderLog.count({
      where: {
        tenantId,
        platform,
        date: { gte: sixtyMinAgo },
      },
    }).catch(() => 0);
    if (recentRejectionCount > 0) {
      attention.push({
        id: `rejections-60m`,
        severity: "MEDIUM",
        title: `${recentRejectionCount} order activity events in last 60 min`,
        action: { type: "OPEN_ORDER", payload: { windowMinutes: 60 } },
      });
    }

    const severityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

    // ── KPIs (today vs yesterday DoD) ────────────────────────────────────
    // UTR is averaged only across drivers who hit the default shift period
    const settings = await prisma.platformSettings.findUnique({
      where: { tenantId_platform: { tenantId, platform } },
      select: { shiftRules: true },
    });
    const sr = (settings?.shiftRules as any) || {};
    const defaultHoursPerDay = Number(
      sr?.MOTORCYCLE?.defaultHoursPerDay ??
      sr?.CAR?.defaultHoursPerDay ??
      sr?.defaultHoursPerDay ??
      12
    );

    const computeKpis = async (start: Date, end: Date) => {
      const [orderAgg, eligibleMetrics] = await Promise.all([
        prisma.orderLog.aggregate({
          where: { tenantId, platform, date: { gte: start, lt: end } },
          _sum: { orderCount: true },
        }),
        prisma.talabatDailyMetrics.findMany({
          where: {
            tenantId,
            shiftDate: { gte: start, lt: end },
            status: { in: ["PARSED", "APPROVED"] },
            onlineHours: { gte: defaultHoursPerDay },
            utr: { not: null },
          },
          select: { utr: true },
        }),
      ]);
      const totalOrders = orderAgg._sum.orderCount ?? 0;
      const utrAvg = eligibleMetrics.length > 0
        ? eligibleMetrics.reduce((sum, m) => sum + Number(m.utr), 0) / eligibleMetrics.length
        : null;
      return {
        ordersCompleted: totalOrders,
        onTimeRate: null as number | null, // wired once on-time signal lands — see R9 / AttendanceRecord
        utr: utrAvg != null ? Math.round(utrAvg * 100) / 100 : null,
      };
    };

    const [today, yesterday] = await Promise.all([
      computeKpis(todayStart, todayEnd),
      computeKpis(yStart, todayStart),
    ]);

    const dodPct = (t: number | null, y: number | null) =>
      t == null || y == null || y === 0 ? null : Math.round(((t - y) / y) * 10000) / 100;

    res.json({
      window: { start: todayStart, end: todayEnd },
      zones: zoneRows,
      attention,
      kpis: {
        today,
        yesterday,
        dodPct: {
          ordersCompleted: dodPct(today.ordersCompleted, yesterday.ordersCompleted),
          onTimeRate: dodPct(today.onTimeRate, yesterday.onTimeRate),
          utr: dodPct(today.utr, yesterday.utr),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── D2 · Deliveroo overview (unassigned by zone + top/bottom riders) ───────
router.get("/deliveroo/overview", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart);
    const dayOfWeek = weekStart.getDay(); // 0 = Sun
    weekStart.setDate(weekStart.getDate() - dayOfWeek);

    const settings = await prisma.platformSettings.findUnique({
      where: { tenantId_platform: { tenantId, platform: "DELIVEROO" } },
    });
    const amberThreshold =
      (settings?.zones as any)?.unassignedAmberThreshold ?? 1;
    const redThreshold = (settings?.zones as any)?.unassignedRedThreshold ?? 3;

    const [todayMetrics, sevenMetrics, weekMetrics, yesterdayMetrics] =
      await Promise.all([
        prisma.deliverooDailyMetrics.findMany({
          where: {
            tenantId,
            shiftDate: { gte: todayStart, lt: todayEnd },
            status: { in: ["PARSED", "APPROVED"] },
          },
          include: { driver: { select: { id: true, name: true, zone: true } } },
        }),
        prisma.deliverooDailyMetrics.findMany({
          where: {
            tenantId,
            shiftDate: { gte: sevenStart, lt: todayStart },
            status: { in: ["PARSED", "APPROVED"] },
          },
          include: { driver: { select: { zone: true } } },
        }),
        prisma.deliverooDailyMetrics.findMany({
          where: {
            tenantId,
            shiftDate: { gte: weekStart, lt: todayEnd },
            status: { in: ["PARSED", "APPROVED"] },
          },
          include: {
            driver: { select: { id: true, name: true, zone: true, utr: true } },
          },
        }),
        prisma.deliverooDailyMetrics.findMany({
          where: {
            tenantId,
            shiftDate: {
              gte: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000),
              lt: todayStart,
            },
            status: { in: ["PARSED", "APPROVED"] },
          },
        }),
      ]);

    // Zone aggregation — today
    type ZoneRow = { zone: string; today: number; avg7: number; severity: "green" | "amber" | "red" };
    const zoneTodayMap = new Map<string, number>();
    const zoneHistMap = new Map<string, number>();
    for (const m of todayMetrics) {
      const z = m.driver?.zone ?? "Unassigned";
      zoneTodayMap.set(z, (zoneTodayMap.get(z) ?? 0) + (m.unassignedCount ?? 0));
    }
    for (const m of sevenMetrics) {
      const z = m.driver?.zone ?? "Unassigned";
      zoneHistMap.set(z, (zoneHistMap.get(z) ?? 0) + (m.unassignedCount ?? 0));
    }
    const allZones = new Set<string>([
      ...zoneTodayMap.keys(),
      ...zoneHistMap.keys(),
    ]);
    const unassignedByZone: ZoneRow[] = [...allZones]
      .map((zone) => {
        const today = zoneTodayMap.get(zone) ?? 0;
        const avg7 = Math.round(((zoneHistMap.get(zone) ?? 0) / 7) * 10) / 10;
        const severity: ZoneRow["severity"] =
          today >= redThreshold ? "red" : today >= amberThreshold ? "amber" : "green";
        return { zone, today, avg7, severity };
      })
      .sort((a, b) => b.today - a.today);

    // Top / Bottom riders — this week by composite of deliveries + UTR stand-in
    // (acceptance not yet extracted; use deliveriesCount / onlineHour estimates).
    type RiderAgg = {
      driverId: string;
      name: string;
      deliveries: number;
      onlineHours: number;
      unassignedLinked: number;
    };
    const riders = new Map<string, RiderAgg>();
    for (const m of weekMetrics) {
      if (!m.driver) continue;
      const r = riders.get(m.driverId) ?? {
        driverId: m.driverId,
        name: m.driver.name,
        deliveries: 0,
        onlineHours: 0,
        unassignedLinked: 0,
      };
      r.deliveries += m.deliveriesCount ?? 0;
      const buckets = Array.isArray(m.hourlyBuckets)
        ? (m.hourlyBuckets as any[])
        : [];
      // Each non-zero 2-hour bucket contributes ~2 online hours (heuristic)
      r.onlineHours += buckets.reduce(
        (sum: number, v: any) => sum + (Number(v) > 0 ? 2 : 0),
        0
      );
      r.unassignedLinked += m.unassignedCount ?? 0;
      riders.set(m.driverId, r);
    }
    const riderRows = [...riders.values()].map((r) => ({
      driverId: r.driverId,
      name: r.name,
      deliveries: r.deliveries,
      utr:
        r.onlineHours > 0
          ? Math.round((r.deliveries / r.onlineHours) * 100) / 100
          : 0,
      unassignedLinked: r.unassignedLinked,
      // Composite: higher utr, higher deliveries, lower unassigned
      composite:
        (r.onlineHours > 0 ? (r.deliveries / r.onlineHours) * 10 : 0) +
        r.deliveries * 0.1 -
        r.unassignedLinked * 2,
    }));
    riderRows.sort((a, b) => b.composite - a.composite);
    const topRiders = riderRows.slice(0, 5);
    const bottomRiders = riderRows.slice(-5).reverse();

    // KPI strip — today vs yesterday DoD
    const sum = (rows: any[], k: "deliveriesCount" | "unassignedCount") =>
      rows.reduce((s, r) => s + (r[k] ?? 0), 0);
    const sumDec = (rows: any[], k: "codCollectedKwd" | "tipsKwd") =>
      rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);

    const todayKpis = {
      deliveries: sum(todayMetrics, "deliveriesCount"),
      cashKwd: Math.round(sumDec(todayMetrics, "codCollectedKwd") * 1000) / 1000,
      tipsKwd: Math.round(sumDec(todayMetrics, "tipsKwd") * 1000) / 1000,
      unassigned: sum(todayMetrics, "unassignedCount"),
    };
    const ydKpis = {
      deliveries: sum(yesterdayMetrics, "deliveriesCount"),
      cashKwd:
        Math.round(sumDec(yesterdayMetrics, "codCollectedKwd") * 1000) / 1000,
      tipsKwd: Math.round(sumDec(yesterdayMetrics, "tipsKwd") * 1000) / 1000,
      unassigned: sum(yesterdayMetrics, "unassignedCount"),
    };
    const dod = (t: number, y: number) =>
      y === 0 ? null : Math.round(((t - y) / y) * 10000) / 100;

    res.json({
      unassignedByZone,
      topRiders,
      bottomRiders,
      kpis: {
        ...todayKpis,
        dodPct: {
          deliveries: dod(todayKpis.deliveries, ydKpis.deliveries),
          cashKwd: dod(todayKpis.cashKwd, ydKpis.cashKwd),
          tipsKwd: dod(todayKpis.tipsKwd, ydKpis.tipsKwd),
          unassigned: dod(todayKpis.unassigned, ydKpis.unassigned),
        },
      },
      thresholds: { amber: amberThreshold, red: redThreshold },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/platform-overview/:platform
router.get("/:platform", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const platform = req.params.platform.toUpperCase() as any;
    const companyId = req.query.companyId as string | undefined;
    const trendDays = req.query.days ? Math.min(parseInt(req.query.days as string), 30) : 0;

    // Cache key: 5 minute TTL (today's data refreshed frequently)
    const cacheKey = `platform_overview:${tenantId}:${platform}:${companyId || ""}:${trendDays}`;
    const cached = await cacheGet(cacheKey);
    if (cached) { res.json(cached); return; }

    // Today's date range
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const driverWhere: any = { tenantId, platform, status: "ACTIVE" };
    if (companyId) driverWhere.companyId = companyId;

    // Fetch drivers with today's data in parallel
    const [drivers, todayOrders, todayCash, todayAttendance, todayViolations, recentAlerts] = await Promise.all([
      // All active drivers for this platform
      prisma.driver.findMany({
        where: driverWhere,
        select: {
          id: true, name: true, phone: true, utr: true, batchNumber: true, zone: true, status: true,
          companyId: true, company: { select: { name: true } },
          aiScores: {
            orderBy: { date: "desc" },
            take: 1,
            select: { compositeScore: true, trend: true, date: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      // Today's orders
      prisma.orderLog.findMany({
        where: { tenantId, platform, date: { gte: todayStart, lt: todayEnd }, ...(companyId ? { driver: { companyId } } : {}) },
        select: { driverId: true, orderCount: true, cashCollected: true, tips: true, totalAmount: true },
      }),
      // Today's cash records
      prisma.cashRecord.findMany({
        where: { tenantId, date: { gte: todayStart, lt: todayEnd }, ...(companyId ? { driver: { companyId, platform } } : { driver: { platform } }) },
        select: { driverId: true, salesAmount: true, collectionAmount: true, status: true, pendingDues: true },
      }),
      // Today's attendance
      prisma.attendanceRecord.findMany({
        where: { tenantId, date: { gte: todayStart, lt: todayEnd }, ...(companyId ? { driver: { companyId, platform } } : { driver: { platform } }) },
        select: { driverId: true, status: true, lateMinutes: true },
      }),
      // Today's violations (Talabat compliance events)
      platform === "TALABAT"
        ? prisma.talabatViolationEvent.findMany({
            where: { tenantId, createdAt: { gte: todayStart, lt: todayEnd }, ...(companyId ? { driver: { companyId } } : {}) },
            select: { id: true, driverId: true, type: true, description: true, resolved: true, driver: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        : Promise.resolve([]),
      // Recent alerts
      prisma.alert.findMany({
        where: { tenantId, status: "ACTIVE", ...(companyId ? { driver: { companyId, platform } } : { driver: { platform } }) },
        select: { id: true, type: true, severity: true, title: true, message: true, driverId: true, driver: { select: { name: true } }, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Build per-driver order/cash maps
    const ordersByDriver = new Map<string, { orders: number; cash: number; tips: number }>();
    for (const o of todayOrders) {
      const existing = ordersByDriver.get(o.driverId) || { orders: 0, cash: 0, tips: 0 };
      existing.orders += o.orderCount;
      existing.cash += Number(o.cashCollected || 0);
      existing.tips += Number(o.tips || 0);
      ordersByDriver.set(o.driverId, existing);
    }

    const cashByDriver = new Map<string, { sales: number; collected: number; pending: number }>();
    for (const c of todayCash) {
      const existing = cashByDriver.get(c.driverId) || { sales: 0, collected: 0, pending: 0 };
      existing.sales += Number(c.salesAmount);
      existing.collected += Number(c.collectionAmount);
      existing.pending += Number(c.pendingDues);
      cashByDriver.set(c.driverId, existing);
    }

    const attendanceByDriver = new Map<string, string>();
    for (const a of todayAttendance) {
      attendanceByDriver.set(a.driverId, a.status);
    }

    // Build driver rows with all data
    const driverRows = drivers.map((d) => {
      const orderData = ordersByDriver.get(d.id) || { orders: 0, cash: 0, tips: 0 };
      const cashData = cashByDriver.get(d.id) || { sales: 0, collected: 0, pending: 0 };
      const attendance = attendanceByDriver.get(d.id) || null;
      const latestScore = d.aiScores[0] || null;

      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        utr: d.utr,
        batchNumber: d.batchNumber,
        zone: d.zone,
        company: d.company.name,
        companyId: d.companyId,
        darbGrade: latestScore?.compositeScore || null,
        gradeTrend: latestScore?.trend || null,
        todayOrders: orderData.orders,
        todayCash: orderData.cash,
        todayTips: orderData.tips,
        cashCollected: cashData.collected,
        cashPending: cashData.pending,
        cashSales: cashData.sales,
        attendance,
      };
    });

    // Sort by Darb grade descending (ranking)
    driverRows.sort((a, b) => (b.darbGrade || 0) - (a.darbGrade || 0));

    // Assign ranks
    driverRows.forEach((d, i) => (d as any).rank = i + 1);

    // Summary stats
    const totalOrders = driverRows.reduce((sum, d) => sum + d.todayOrders, 0);
    const totalCashCollected = driverRows.reduce((sum, d) => sum + d.cashCollected, 0);
    const totalCashPending = driverRows.reduce((sum, d) => sum + d.cashPending, 0);
    const totalCashSales = driverRows.reduce((sum, d) => sum + d.cashSales, 0);
    const presentCount = driverRows.filter((d) => d.attendance === "PRESENT").length;
    const lateCount = driverRows.filter((d) => d.attendance === "LATE").length;
    const absentCount = driverRows.filter((d) => d.attendance === "ABSENT").length;
    const activeViolations = (todayViolations as any[]).filter((v) => !v.resolved).length;

    // UTR: average UTR of drivers who hit the default shift period today
    const platformSettingsRow = await prisma.platformSettings.findUnique({
      where: { tenantId_platform: { tenantId, platform } },
      select: { shiftRules: true },
    });
    const psShiftRules = (platformSettingsRow?.shiftRules as any) || {};
    const platformDefaultHours = Number(
      psShiftRules?.MOTORCYCLE?.defaultHoursPerDay ??
      psShiftRules?.CAR?.defaultHoursPerDay ??
      psShiftRules?.defaultHoursPerDay ??
      12
    );
    const driverIds = driverRows.map((d) => d.id);
    const todayMetricsRows = platform === "TALABAT"
      ? await prisma.talabatDailyMetrics.findMany({
          where: { tenantId, driverId: { in: driverIds }, shiftDate: { gte: todayStart, lt: todayEnd } },
          select: { driverId: true, onlineHours: true, utr: true },
        })
      : platform === "KEETA"
      ? (await prisma.keetaDailyMetrics.findMany({
          where: { tenantId, driverId: { in: driverIds }, date: { gte: todayStart, lt: todayEnd } },
          select: { driverId: true, onlineTime: true },
        })).map((m) => ({ driverId: m.driverId, onlineHours: (m.onlineTime ?? 0) / 60, utr: null as number | null }))
      : [];
    const hoursByDriver = new Map<string, number>();
    const utrByDriverMetric = new Map<string, number>();
    for (const m of todayMetricsRows) {
      if (m.onlineHours != null) hoursByDriver.set(m.driverId, Number(m.onlineHours));
      if ((m as any).utr != null) utrByDriverMetric.set(m.driverId, Number((m as any).utr));
    }
    const eligibleDrivers = driverRows.filter((d) => {
      const hours = hoursByDriver.get(d.id) ?? 0;
      const utrVal = utrByDriverMetric.get(d.id) ?? (d.utr != null ? Number(d.utr) : null);
      return utrVal != null && hours >= platformDefaultHours;
    });
    const avgUtr = eligibleDrivers.length > 0
      ? eligibleDrivers.reduce((sum, d) => sum + Number(utrByDriverMetric.get(d.id) ?? d.utr ?? 0), 0) / eligibleDrivers.length
      : null;

    // Historical trend data (if days param provided)
    let trend: any[] = [];
    if (trendDays > 0) {
      const trendStart = new Date(todayStart);
      trendStart.setDate(trendStart.getDate() - trendDays);

      const [trendOrders, trendAttendance, trendViolations] = await Promise.all([
        prisma.orderLog.groupBy({
          by: ["date"],
          where: { tenantId, platform, date: { gte: trendStart, lt: todayEnd }, ...(companyId ? { driver: { companyId } } : {}) },
          _sum: { orderCount: true },
          _count: { id: true },
          orderBy: { date: "asc" },
        }),
        prisma.attendanceRecord.groupBy({
          by: ["date", "status"],
          where: { tenantId, date: { gte: trendStart, lt: todayEnd }, ...(companyId ? { driver: { companyId, platform } } : { driver: { platform } }) },
          _count: { id: true },
          orderBy: { date: "asc" },
        }),
        platform === "TALABAT"
          ? prisma.talabatViolationEvent.groupBy({
              by: ["createdAt"],
              where: { tenantId, createdAt: { gte: trendStart, lt: todayEnd }, ...(companyId ? { driver: { companyId } } : {}) },
              _count: { id: true },
            })
          : Promise.resolve([]),
      ]);

      // Build per-day trend map
      const trendMap = new Map<string, any>();
      for (const o of trendOrders) {
        const key = new Date(o.date).toISOString().split("T")[0];
        trendMap.set(key, { ...(trendMap.get(key) || {}), orders: o._sum.orderCount || 0 });
      }
      for (const a of trendAttendance) {
        const key = new Date(a.date).toISOString().split("T")[0];
        const entry = trendMap.get(key) || {};
        if (a.status === "PRESENT" || a.status === "LATE") {
          entry.present = (entry.present || 0) + a._count.id;
        } else if (a.status === "ABSENT") {
          entry.absent = (entry.absent || 0) + a._count.id;
        }
        trendMap.set(key, entry);
      }

      // Generate a day-by-day array for the range
      for (let i = trendDays; i >= 0; i--) {
        const d = new Date(todayStart);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        trend.push({ date: key, orders: 0, present: 0, absent: 0, violations: 0, ...(trendMap.get(key) || {}) });
      }

      // Overlay violation counts
      for (const v of trendViolations as any[]) {
        const key = new Date(v.createdAt).toISOString().split("T")[0];
        const entry = trend.find((t) => t.date === key);
        if (entry) entry.violations = (entry.violations || 0) + v._count.id;
      }
    }

    const responsePayload = {
      drivers: driverRows,
      summary: {
        totalDrivers: drivers.length,
        totalOrders,
        totalCashCollected: Math.round(totalCashCollected * 1000) / 1000,
        totalCashPending: Math.round(totalCashPending * 1000) / 1000,
        totalCashSales: Math.round(totalCashSales * 1000) / 1000,
        presentCount,
        lateCount,
        absentCount,
        activeViolations,
        utr: avgUtr != null ? Math.round(avgUtr * 100) / 100 : null,
      },
      violations: todayViolations,
      alerts: recentAlerts.sort((a: any, b: any) => {
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (severityOrder[a.severity as keyof typeof severityOrder] ?? 4) -
               (severityOrder[b.severity as keyof typeof severityOrder] ?? 4);
      }),
      ...(trendDays > 0 ? { trend } : {}),
    };

    await cacheSet(cacheKey, responsePayload, 300); // 5 minute TTL
    res.json(responsePayload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
