import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { upload } from "../utils/upload";
import { parseKeetaXlsx } from "../services/keetaXlsxParser";
import fs from "fs";
import { getAdapter } from "../adapters";

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── Metrics ─────────────────────────────────────────────────────────────────

// GET /metrics - List KeetaDailyMetrics with filters, paginated
router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo, driverId, validDay } = req.query;
    const where: any = { tenantId };
    if (driverId) where.driverId = driverId;
    if (validDay !== undefined) where.validDay = validDay === "true";
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        const d = new Date(dateFrom as string);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - 1); // include UTC-offset dates
        where.date.gte = d;
      }
      if (dateTo) {
        const d = new Date(dateTo as string);
        d.setHours(23, 59, 59, 999);
        where.date.lte = d;
      }
    }

    const [data, total] = await Promise.all([
      prisma.keetaDailyMetrics.findMany({
        where, skip, take: limit,
        orderBy: { date: "desc" },
        include: { driver: { select: { id: true, name: true, platform: true } } },
      }),
      prisma.keetaDailyMetrics.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /metrics/summary - Aggregate stats for a date range
// F8: adds DoD / WoW deltas + 30-day trend series for the Keeta overview cards.
router.get("/metrics/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo } = req.query;

    const startDate = dateFrom ? new Date(dateFrom as string) : new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - 1); // include UTC-offset dates
    const endDate = dateTo ? new Date(dateTo as string) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const dateFilter = { tenantId, date: { gte: startDate, lte: endDate } };

    const [
      distinctDrivers,
      validDayCount,
      invalidDayCount,
      aggregates,
    ] = await Promise.all([
      prisma.keetaDailyMetrics.findMany({
        where: dateFilter,
        select: { driverId: true },
        distinct: ["driverId"],
      }),
      prisma.keetaDailyMetrics.count({ where: { ...dateFilter, validDay: true } }),
      prisma.keetaDailyMetrics.count({ where: { ...dateFilter, validDay: false } }),
      prisma.keetaDailyMetrics.aggregate({
        where: dateFilter,
        _avg: { onTimeRate: true, avgDeliveryMinutes: true },
        _sum: { deliveredTasks: true, acceptedTasks: true, cancelledTasks: true },
      }),
    ]);

    // Build per-day series for the last 30 days for delta + trend chart.
    const seriesEnd = endDate;
    const seriesStart = new Date(seriesEnd);
    seriesStart.setDate(seriesStart.getDate() - 29);
    seriesStart.setHours(0, 0, 0, 0);

    const dayRows = await prisma.keetaDailyMetrics.findMany({
      where: { tenantId, date: { gte: seriesStart, lte: seriesEnd } },
      select: {
        date: true, acceptedTasks: true, deliveredTasks: true, cancelledTasks: true,
        onTimeRate: true, driverId: true, validDay: true,
      },
    });

    type DayAgg = {
      date: string;
      acceptedTasks: number;
      deliveredTasks: number;
      cancelledTasks: number;
      onlineCouriers: number;
      deliveredProp: number;
      onTimeRate: number;
      _ontimeCount: number;
      _deliveredDrivers: Set<string>;
      _drivers: Set<string>;
    };
    const byDay = new Map<string, DayAgg>();
    for (const r of dayRows) {
      const key = r.date.toISOString().slice(0, 10);
      let agg = byDay.get(key);
      if (!agg) {
        agg = {
          date: key, acceptedTasks: 0, deliveredTasks: 0, cancelledTasks: 0,
          onlineCouriers: 0, deliveredProp: 0, onTimeRate: 0,
          _ontimeCount: 0, _deliveredDrivers: new Set(), _drivers: new Set(),
        };
        byDay.set(key, agg);
      }
      agg.acceptedTasks += r.acceptedTasks || 0;
      agg.deliveredTasks += r.deliveredTasks || 0;
      agg.cancelledTasks += r.cancelledTasks || 0;
      agg._drivers.add(r.driverId);
      if ((r.deliveredTasks || 0) > 0) agg._deliveredDrivers.add(r.driverId);
      if (r.onTimeRate != null) {
        agg.onTimeRate += Number(r.onTimeRate);
        agg._ontimeCount += 1;
      }
    }

    const series = Array.from(byDay.values()).map((a) => ({
      date: a.date,
      acceptedTasks: a.acceptedTasks,
      deliveredTasks: a.deliveredTasks,
      cancelledTasks: a.cancelledTasks,
      onlineCouriers: a._drivers.size,
      deliveredProp: a._drivers.size > 0 ? Number((a._deliveredDrivers.size / a._drivers.size).toFixed(4)) : 0,
      onTimeRate: a._ontimeCount > 0 ? Number((a.onTimeRate / a._ontimeCount).toFixed(4)) : 0,
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Delta helper: (today - ref) / ref  → percentage rounded 2dp.
    const deltaPct = (today: number, ref: number): number | null => {
      if (ref === 0 || ref == null) return null;
      return Number((((today - ref) / ref) * 100).toFixed(2));
    };

    const todayKey = seriesEnd.toISOString().slice(0, 10);
    const yesterdayDate = new Date(seriesEnd);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yKey = yesterdayDate.toISOString().slice(0, 10);
    const wowDate = new Date(seriesEnd);
    wowDate.setDate(wowDate.getDate() - 7);
    const wKey = wowDate.toISOString().slice(0, 10);
    const ZERO = { date: "", acceptedTasks: 0, deliveredTasks: 0, cancelledTasks: 0, onlineCouriers: 0, deliveredProp: 0, onTimeRate: 0 };
    const today = series.find((s) => s.date === todayKey) ?? series[series.length - 1] ?? ZERO;
    const yesterday = series.find((s) => s.date === yKey) ?? ZERO;
    const wow = series.find((s) => s.date === wKey) ?? ZERO;

    const card = (field: keyof typeof today) => ({
      value: (today as any)[field] as number,
      dodPct: deltaPct((today as any)[field] as number, (yesterday as any)[field] as number),
      wowPct: deltaPct((today as any)[field] as number, (wow as any)[field] as number),
    });

    res.json({
      totalDrivers: distinctDrivers.length,
      validDayCount,
      invalidDayCount,
      avgOnTimeRate: aggregates._avg.onTimeRate || 0,
      avgDeliveryMinutes: aggregates._avg.avgDeliveryMinutes || 0,
      totalDeliveredTasks: aggregates._sum.deliveredTasks || 0,
      totalAcceptedTasks: aggregates._sum.acceptedTasks || 0,
      // F8 additions
      cards: {
        acceptedTasks: card("acceptedTasks"),
        deliveredTasks: card("deliveredTasks"),
        deliveredProp: card("deliveredProp"),
        cancelledTasks: card("cancelledTasks"),
        onlineCouriers: card("onlineCouriers"),
        onTimeRateDaily: card("onTimeRate"),
      },
      trend: { series },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /metrics/:id - Single record with driver
router.get("/metrics/:id", async (req: Request, res: Response) => {
  try {
    const record = await prisma.keetaDailyMetrics.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { driver: true },
    });
    if (!record) { res.status(404).json({ error: "Metrics record not found" }); return; }
    res.json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /metrics - Create
router.post("/metrics", async (req: Request, res: Response) => {
  try {
    const record = await prisma.keetaDailyMetrics.create({
      data: { ...req.body, tenantId: req.user!.tenantId },
    });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /metrics/:id - Update
router.put("/metrics/:id", async (req: Request, res: Response) => {
  try {
    const allowed = [
      "date", "courierPlatformId", "supervisorName", "vehicleType",
      "onShift", "validDay", "onlineTime", "validOnlineTime", "peakOnlineMinutes",
      "acceptedTasks", "restaurantArrivals", "deliveredTasks", "largeOrdersCompleted",
      "cancelledTasks", "rejectedTasks", "rejectedByCourier", "rejectedAuto",
      "cancellationRate", "completionRate", "onTimeRate", "largeOrderOnTimeRate",
      "avgDeliveryMinutes", "over55minProportion", "overdueOrders", "severelyOverdue", "source",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const result = await prisma.keetaDailyMetrics.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data,
    });
    if (result.count === 0) { res.status(404).json({ error: "Metrics record not found" }); return; }
    const updated = await prisma.keetaDailyMetrics.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Driver Summary ──────────────────────────────────────────────────────────

// GET /drivers/summary - Keeta driver stats
router.get("/drivers/summary", async (req: Request, res: Response) => {
  try {
    const summary = await getAdapter("KEETA").getDriverSummary(req.user!.tenantId);
    res.json({
      activeDriverCount: summary.activeDrivers ?? 0,
      totalDrivers: summary.totalDrivers ?? 0,
      avgDeliveriesPerDay: summary.avgDeliveriesPerDay ?? 0,
      avgValidDayRate: (summary.extra?.avgValidDayRate as number) ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Overview ─────────────────────────────────────────────────────────────────

// GET /overview - Today's Keeta overview (drivers + metrics + attendance)
router.get("/overview", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const companyId = req.query.companyId as string | undefined;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Keeta dates are stored with a day offset due to UTC, so include yesterday too
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const driverWhere: any = { tenantId, platform: "KEETA", status: "ACTIVE" };
    if (companyId) driverWhere.companyId = companyId;
    const metricsWhere: any = { tenantId, date: { gte: yesterday, lt: todayEnd } };
    if (companyId) metricsWhere.driverId = { in: await prisma.driver.findMany({ where: driverWhere, select: { id: true } }).then(d => d.map(x => x.id)) };
    const attWhere: any = { tenantId, date: { gte: todayStart, lt: todayEnd }, driver: { platform: "KEETA" } };
    if (companyId) attWhere.driver = { platform: "KEETA" as any, companyId };

    const [drivers, todayMetrics, todayAttendance, driversOnLeave] = await Promise.all([
      prisma.driver.findMany({
        where: driverWhere,
        select: {
          id: true, name: true, phone: true, utr: true, zone: true, status: true,
          companyId: true, company: { select: { name: true } },
          aiScores: { orderBy: { date: "desc" }, take: 1, select: { compositeScore: true, trend: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.keetaDailyMetrics.findMany({
        where: metricsWhere,
        select: {
          driverId: true, deliveredTasks: true, acceptedTasks: true, cancelledTasks: true,
          onlineTime: true, validOnlineTime: true, validDay: true,
          completionRate: true, onTimeRate: true, avgDeliveryMinutes: true, cancellationRate: true,
        },
      }),
      prisma.attendanceRecord.findMany({
        where: attWhere,
        select: { driverId: true, status: true, lateMinutes: true },
      }),
      prisma.leaveRequest.count({
        where: { tenantId, status: "APPROVED", startDate: { lte: todayStart }, endDate: { gte: todayStart }, driver: { platform: "KEETA" } },
      }),
    ]);

    const metricsByDriver = new Map<string, any>();
    for (const m of todayMetrics) metricsByDriver.set(m.driverId, m);
    const attendanceByDriver = new Map<string, string>();
    for (const a of todayAttendance) attendanceByDriver.set(a.driverId, a.status);

    const driverRows = drivers.map((d: any) => {
      const m = metricsByDriver.get(d.id);
      const score = d.aiScores[0] || null;
      return {
        id: d.id, name: d.name, phone: d.phone, utr: d.utr, zone: d.zone,
        company: d.company.name, companyId: d.companyId,
        darbGrade: score?.compositeScore || null, gradeTrend: score?.trend || null,
        deliveries: m?.deliveredTasks || 0,
        accepted: m?.acceptedTasks || 0,
        cancelled: m?.cancelledTasks || 0,
        onlineMinutes: m?.onlineTime || 0,
        validDay: m?.validDay || false,
        completionRate: m ? Number(m.completionRate || 0) : null,
        onTimeRate: m ? Number(m.onTimeRate || 0) : null,
        avgDeliveryMinutes: m ? Number(m.avgDeliveryMinutes || 0) : null,
        attendance: attendanceByDriver.get(d.id) || null,
        hasMetrics: !!m,
      };
    });

    driverRows.sort((a: any, b: any) => (b.darbGrade || 0) - (a.darbGrade || 0));
    driverRows.forEach((d: any, i: number) => d.rank = i + 1);

    const totalDeliveries = driverRows.reduce((s: number, d: any) => s + d.deliveries, 0);
    const validDays = driverRows.filter((d: any) => d.validDay).length;
    const presentCount = driverRows.filter((d: any) => d.attendance === "PRESENT").length;
    const lateCount = driverRows.filter((d: any) => d.attendance === "LATE").length;
    const absentCount = driverRows.filter((d: any) => d.attendance === "ABSENT").length;
    const driversWithMetrics = driverRows.filter((d: any) => d.hasMetrics && d.completionRate !== null);
    const avgCompletionRate = driversWithMetrics.length > 0
      ? Math.round(driversWithMetrics.reduce((s: number, d: any) => s + d.completionRate, 0) / driversWithMetrics.length * 100) / 100
      : null;
    const avgOnTimeRate = driversWithMetrics.length > 0
      ? Math.round(driversWithMetrics.reduce((s: number, d: any) => s + d.onTimeRate, 0) / driversWithMetrics.length * 100) / 100
      : null;

    res.json({
      drivers: driverRows,
      summary: {
        totalDrivers: drivers.length,
        totalDeliveries,
        validDays,
        presentCount, lateCount, absentCount,
        driversOnLeave,
        avgCompletionRate,
        avgOnTimeRate,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Import ──────────────────────────────────────────────────────────────────

// POST /import - Parse uploaded Keeta XLSX and upsert metrics
router.post("/import", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const tenantId = req.user!.tenantId;

    const buffer = fs.readFileSync(req.file.path);
    const rows = parseKeetaXlsx(buffer);

    let imported = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        if (!row.courierPlatformId) {
          errors.push(`Row missing Courier ID: ${row.firstName} ${row.lastName}`);
          continue;
        }

        const driver = await prisma.driver.findFirst({
          where: {
            tenantId,
            platformDriverId: row.courierPlatformId,
            platform: "KEETA",
          },
        });

        if (!driver) {
          errors.push(`Driver not found: ${row.courierPlatformId} (${row.firstName} ${row.lastName})`);
          continue;
        }

        await prisma.keetaDailyMetrics.upsert({
          where: {
            tenantId_driverId_date: {
              tenantId,
              driverId: driver.id,
              date: row.date,
            },
          },
          create: {
            tenantId,
            driverId: driver.id,
            date: row.date,
            courierPlatformId: row.courierPlatformId,
            supervisorName: row.supervisorName,
            vehicleType: row.vehicleType,
            onShift: row.onShift,
            validDay: row.validDay,
            onlineTime: row.onlineTime,
            validOnlineTime: row.validOnlineTime,
            peakOnlineMinutes: row.peakOnlineMinutes,
            acceptedTasks: row.acceptedTasks,
            restaurantArrivals: row.restaurantArrivals,
            deliveredTasks: row.deliveredTasks,
            largeOrdersCompleted: row.largeOrdersCompleted,
            cancelledTasks: row.cancelledTasks,
            rejectedTasks: row.rejectedTasks,
            rejectedByCourier: row.rejectedByCourier,
            rejectedAuto: row.rejectedAuto,
            cancellationRate: row.cancellationRate,
            completionRate: row.completionRate,
            onTimeRate: row.onTimeRate,
            largeOrderOnTimeRate: row.largeOrderOnTimeRate,
            avgDeliveryMinutes: row.avgDeliveryMinutes,
            over55minProportion: row.over55minProportion,
            overdueOrders: row.overdueOrders,
            severelyOverdue: row.severelyOverdue,
            source: "XLSX_IMPORT",
          },
          update: {
            courierPlatformId: row.courierPlatformId,
            supervisorName: row.supervisorName,
            vehicleType: row.vehicleType,
            onShift: row.onShift,
            validDay: row.validDay,
            onlineTime: row.onlineTime,
            validOnlineTime: row.validOnlineTime,
            peakOnlineMinutes: row.peakOnlineMinutes,
            acceptedTasks: row.acceptedTasks,
            restaurantArrivals: row.restaurantArrivals,
            deliveredTasks: row.deliveredTasks,
            largeOrdersCompleted: row.largeOrdersCompleted,
            cancelledTasks: row.cancelledTasks,
            rejectedTasks: row.rejectedTasks,
            rejectedByCourier: row.rejectedByCourier,
            rejectedAuto: row.rejectedAuto,
            cancellationRate: row.cancellationRate,
            completionRate: row.completionRate,
            onTimeRate: row.onTimeRate,
            largeOrderOnTimeRate: row.largeOrderOnTimeRate,
            avgDeliveryMinutes: row.avgDeliveryMinutes,
            over55minProportion: row.over55minProportion,
            overdueOrders: row.overdueOrders,
            severelyOverdue: row.severelyOverdue,
            source: "XLSX_IMPORT",
          },
        });

        imported++;
      } catch (rowErr: any) {
        errors.push(`Error processing ${row.courierPlatformId}: ${rowErr.message}`);
      }
    }

    res.json({ imported, total: rows.length, errors });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
