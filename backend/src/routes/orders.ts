import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { upload } from "../utils/upload";
import { parseWhatsAppMessages } from "../services/whatsappParser";
import { sendXlsx } from "../utils/xlsxExport";
import { validateBody, createOrderSchema } from "../utils/validate";
import fs from "fs";

const router = Router();
router.use(authMiddleware, tenantScope);

import { parseLocalDate, parseLocalDateEnd } from "../utils/date";

/**
 * @swagger
 * /api/orders:
 *   get:
 *     tags: [Orders]
 *     summary: List orders with filters and pagination
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *       - in: query
 *         name: driverId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: source
 *         schema: { type: string, enum: [MANUAL, OCR, WHATSAPP, IMPORT] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated order list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { platform, driverId, dateFrom, dateTo, source, zone, search, companyId, sortBy, sortOrder, timeFrom, timeTo } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (driverId) where.driverId = driverId;
    if (source) where.source = source;
    if (companyId) where.driver = { ...where.driver, companyId: companyId as string };
    if (zone) where.driver = { ...where.driver, zone: zone as string };
    if (search) {
      where.OR = [
        { driver: { name: { contains: search as string, mode: "insensitive" } } },
        { orderNumber: { contains: search as string, mode: "insensitive" } },
      ];
    }
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }
    // Time-of-day filter on arrivalTime (HH:mm format)
    if (timeFrom || timeTo) {
      const refDate = dateFrom || dateTo;
      const refDateStr = refDate ? (refDate as string) : new Date().toISOString().split("T")[0];
      if (timeFrom) {
        const from = parseLocalDate(refDateStr);
        const [hf, mf] = (timeFrom as string).split(":").map(Number);
        from.setHours(hf, mf, 0, 0);
        where.arrivalTime = { ...where.arrivalTime, gte: from };
      }
      if (timeTo) {
        const to = dateTo ? parseLocalDateEnd(dateTo as string) : parseLocalDateEnd(refDateStr);
        const [ht, mt] = (timeTo as string).split(":").map(Number);
        to.setHours(ht, mt, 59, 999);
        where.arrivalTime = { ...where.arrivalTime, lte: to };
      }
    }

    // Sorting
    const allowedSortFields: Record<string, any> = {
      date: { date: sortOrder === "asc" ? "asc" : "desc" },
      driver: { driver: { name: sortOrder === "asc" ? "asc" : "desc" } },
      deliveries: { orderCount: sortOrder === "asc" ? "asc" : "desc" },
      cash: { cashCollected: sortOrder === "asc" ? "asc" : "desc" },
    };
    const orderBy = allowedSortFields[sortBy as string] || { date: "desc" };

    let [data, total] = await Promise.all([
      prisma.orderLog.findMany({
        where, skip, take: limit,
        orderBy,
        include: { driver: { select: { id: true, name: true, platform: true, zone: true, batchNumber: true, company: { select: { name: true } } } } },
      }),
      prisma.orderLog.count({ where }),
    ]);

    const enriched = data.map((o: any) => ({
      ...o,
      zone: o.driver?.zone || null,
      companyName: o.driver?.company?.name || null,
      batchNumber: o.driver?.batchNumber || null,
      deliveriesCount: o.orderCount,
      cashCollectedKd: o.cashCollected != null ? Number(o.cashCollected) : 0,
      orderId: o.orderNumber || (o.rawData as any)?.orderId || null,
      amount: o.totalAmount != null ? Number(o.totalAmount) : ((o.rawData as any)?.amount ?? null),
      storeName: o.restaurantName || (o.rawData as any)?.storeName || null,
      driverName: o.driver?.name || null,
      timestamp: o.arrivalTime || o.date,
      status: (o.rawData as any)?.status || "DELIVERED",
    }));

    res.json(paginatedResponse(enriched, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/orders/summary:
 *   get:
 *     tags: [Orders]
 *     summary: Aggregate order metrics (totals, cash, trends) for a date range
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: companyId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Order summary with totals, averages, and per-driver breakdown
 */
/**
 * @swagger
 * /api/orders/daily-by-platform:
 *   get:
 *     tags: [Orders]
 *     summary: Daily order counts grouped by platform and date for sparkline charts
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: companyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Array of { platform, date, orderCount } rows
 */
router.get("/daily-by-platform", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo, companyId } = req.query;
    const where: any = { tenantId };
    if (companyId) where.driver = { companyId: companyId as string };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }
    const rows = await prisma.orderLog.groupBy({
      by: ["platform", "date"],
      where,
      _sum: { orderCount: true },
    });
    res.json({
      data: rows.map((r) => ({
        platform: r.platform,
        date: r.date,
        orderCount: r._sum.orderCount || 0,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/orders/active-drivers:
 *   get:
 *     tags: [Orders]
 *     summary: Distinct driver IDs that logged orders in a date range
 */
router.get("/active-drivers", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo, companyId } = req.query;
    const where: any = { tenantId };
    if (companyId) where.driver = { companyId: companyId as string };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }
    const rows = await prisma.orderLog.groupBy({ by: ["driverId"], where });
    res.json({ driverIds: rows.map((r) => r.driverId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Most recent date that has at least one order log row for the given platform / tenant.
// Used by the Americana orders page to default the date picker to "the most recent ingested day"
// when today has no data yet.
router.get("/latest-date", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform, companyId } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (companyId) where.driver = { companyId: companyId as string };
    const latest = await prisma.orderLog.findFirst({
      where,
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (!latest) {
      res.json({ date: null });
      return;
    }
    const d = latest.date;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    res.json({ date: `${yyyy}-${mm}-${dd}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform, dateFrom, dateTo, companyId, date } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (companyId) where.driver = { companyId: companyId as string };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    } else if (date) {
      // Single-day mode (used by /americana/orders): scope the main aggregate to that day.
      where.date = { gte: parseLocalDate(date as string), lte: parseLocalDateEnd(date as string) };
    }

    const agg = await prisma.orderLog.aggregate({
      where,
      _sum: {
        orderCount: true,
        distanceKm: true,
        tips: true,
        cashCollected: true,
      },
    });

    // Calculate orders per hour from TalabatSession actual hours, fallback to OrderLog time span
    let ordersPerHour = 0;
    if (platform === "TALABAT") {
      const sessionAgg = await prisma.talabatSession.aggregate({
        where: {
          tenantId,
          ...(dateFrom || dateTo
            ? { date: { ...(dateFrom ? { gte: parseLocalDate(dateFrom as string) } : {}), ...(dateTo ? { lte: parseLocalDateEnd(dateTo as string) } : {}) } }
            : {}),
        },
        _sum: { deliveries: true, actualHours: true },
      });
      const totalHours = Number(sessionAgg._sum.actualHours || 0);
      const totalDel = Number(sessionAgg._sum.deliveries || 0);
      if (totalHours > 0) {
        ordersPerHour = Math.round((totalDel / totalHours) * 10) / 10;
      } else {
        // Fallback: estimate from order arrival times
        const ordersWithTime = await prisma.orderLog.findMany({
          where: { ...where, arrivalTime: { not: null } },
          select: { arrivalTime: true },
          orderBy: { arrivalTime: "asc" },
        });
        if (ordersWithTime.length >= 2) {
          const first = new Date(ordersWithTime[0].arrivalTime!).getTime();
          const last = new Date(ordersWithTime[ordersWithTime.length - 1].arrivalTime!).getTime();
          const spanHours = (last - first) / (1000 * 60 * 60);
          if (spanHours > 0) {
            ordersPerHour = Math.round((ordersWithTime.length / spanHours) * 10) / 10;
          }
        }
      }
    }

    // Zone breakdown + driver stats
    const driverBreakdown = await prisma.orderLog.groupBy({
      by: ["driverId"],
      where,
      _sum: { orderCount: true, cashCollected: true },
      orderBy: { _sum: { orderCount: "desc" } },
    });
    const driverIds = driverBreakdown.map((z) => z.driverId);
    const drivers = driverIds.length > 0
      ? await prisma.driver.findMany({
          where: { tenantId, id: { in: driverIds } },
          select: { id: true, name: true, zone: true },
        })
      : [];
    const driverMap = Object.fromEntries(drivers.map((d) => [d.id, d]));
    const zoneMap: Record<string, { deliveries: number; cash: number }> = {};
    for (const row of driverBreakdown) {
      const zone = driverMap[row.driverId]?.zone || "Unknown";
      if (!zoneMap[zone]) zoneMap[zone] = { deliveries: 0, cash: 0 };
      zoneMap[zone].deliveries += row._sum.orderCount || 0;
      zoneMap[zone].cash += Number(row._sum.cashCollected || 0);
    }
    const zones = Object.entries(zoneMap)
      .map(([zone, stats]) => ({ zone, ...stats }))
      .sort((a, b) => b.deliveries - a.deliveries);

    // Enhanced summary fields
    const totalDeliveries = agg._sum.orderCount || 0;
    const totalCashKd = Number(agg._sum.cashCollected || 0);
    const avgCashPerOrder = totalDeliveries > 0 ? Math.round((totalCashKd / totalDeliveries) * 1000) / 1000 : 0;

    // Peak hour from arrivalTime
    let peakHour: number | null = null;
    const ordersWithArrival = await prisma.orderLog.findMany({
      where: { ...where, arrivalTime: { not: null } },
      select: { arrivalTime: true },
    });
    if (ordersWithArrival.length > 0) {
      const hourCounts: Record<number, number> = {};
      for (const o of ordersWithArrival) {
        const h = new Date(o.arrivalTime!).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      }
      peakHour = Number(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0]);
    }

    // Top driver
    const topDriverRow = driverBreakdown[0];
    const topDriverName = topDriverRow ? (driverMap[topDriverRow.driverId]?.name || null) : null;

    // Top zone
    const topZone = zones.length > 0 ? zones[0].zone : null;

    // ── Top earners list (every driver with stats, sorted desc by orders) ──
    const topEarners = driverBreakdown
      .map((row) => {
        const d = driverMap[row.driverId];
        return {
          driverId: row.driverId,
          driverName: d?.name || "Unknown",
          deliveries: row._sum.orderCount || 0,
          cashKd: Number(row._sum.cashCollected || 0),
          tipsKd: 0,
          utr: null as number | null,
        };
      });

    // ── Week-over-week comparison block ──
    // currentRange = the requested window (or last 7 days). prevRange = same length immediately before.
    const currentEnd = dateTo ? parseLocalDateEnd(dateTo as string) : new Date();
    const currentStart = dateFrom
      ? parseLocalDate(dateFrom as string)
      : new Date(currentEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rangeMs = currentEnd.getTime() - currentStart.getTime();
    const prevEnd = new Date(currentStart.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - rangeMs);
    const prevWhere: any = { tenantId, date: { gte: prevStart, lte: prevEnd } };
    if (platform) prevWhere.platform = platform;
    if (companyId) prevWhere.driver = { companyId: companyId as string };
    const prevAgg = await prisma.orderLog.aggregate({
      where: prevWhere,
      _sum: { orderCount: true, cashCollected: true, tips: true, distanceKm: true },
    });
    const thisWeek = {
      deliveries: totalDeliveries,
      cashKd: totalCashKd,
      tipsKd: Number(agg._sum.tips || 0),
      distanceKm: Number(agg._sum.distanceKm || 0),
    };
    const lastWeek = {
      deliveries: prevAgg._sum.orderCount || 0,
      cashKd: Number(prevAgg._sum.cashCollected || 0),
      tipsKd: Number(prevAgg._sum.tips || 0),
      distanceKm: Number(prevAgg._sum.distanceKm || 0),
    };

    // ── Single-day daily comparison block (used by /americana/orders) ──
    // Returns today/yesterday counts + a 7-day rolling average leading up to the requested day.
    let todayOrders = 0, todayAmount = 0;
    let yesterdayOrders = 0, yesterdayAmount = 0;
    let avgOrders: number | null = null, avgAmount: number | null = null;
    if (date) {
      // Format a Date as YYYY-MM-DD using local fields so we don't shift days through UTC.
      const fmtLocal = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      const target = parseLocalDate(date as string);
      const yest = new Date(target);
      yest.setDate(yest.getDate() - 1);
      const yestStr = fmtLocal(yest);
      const sevenStart = new Date(target);
      sevenStart.setDate(sevenStart.getDate() - 6);
      const sevenStartStr = fmtLocal(sevenStart);

      const baseWhere: any = { tenantId };
      if (platform) baseWhere.platform = platform;
      if (companyId) baseWhere.driver = { companyId: companyId as string };

      const [todayAgg, yestAgg, weekAgg] = await Promise.all([
        prisma.orderLog.aggregate({
          where: { ...baseWhere, date: { gte: parseLocalDate(date as string), lte: parseLocalDateEnd(date as string) } },
          _sum: { orderCount: true, totalAmount: true },
        }),
        prisma.orderLog.aggregate({
          where: { ...baseWhere, date: { gte: parseLocalDate(yestStr), lte: parseLocalDateEnd(yestStr) } },
          _sum: { orderCount: true, totalAmount: true },
        }),
        prisma.orderLog.groupBy({
          by: ["date"],
          where: { ...baseWhere, date: { gte: parseLocalDate(sevenStartStr), lte: parseLocalDateEnd(date as string) } },
          _sum: { orderCount: true, totalAmount: true },
        }),
      ]);
      todayOrders = todayAgg._sum.orderCount || 0;
      todayAmount = Number(todayAgg._sum.totalAmount || 0);
      yesterdayOrders = yestAgg._sum.orderCount || 0;
      yesterdayAmount = Number(yestAgg._sum.totalAmount || 0);
      const days = weekAgg.length;
      if (days > 0) {
        const sumOrders = weekAgg.reduce((s, r) => s + (r._sum.orderCount || 0), 0);
        const sumAmount = weekAgg.reduce((s, r) => s + Number(r._sum.totalAmount || 0), 0);
        avgOrders = Math.round((sumOrders / days) * 10) / 10;
        avgAmount = Math.round((sumAmount / days) * 1000) / 1000;
      }
    }

    res.json({
      totalDeliveries,
      totalOrders: totalDeliveries,
      totalDistanceKm: Number(agg._sum.distanceKm || 0),
      totalTipsKd: Number(agg._sum.tips || 0),
      totalCashKd,
      ordersPerHour,
      avgCashPerOrder,
      peakHour,
      topDriverName,
      topZone,
      zones,
      topEarners,
      thisWeek,
      lastWeek,
      todayOrders,
      todayAmount,
      yesterdayOrders,
      yesterdayAmount,
      avgOrders,
      avgAmount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /aggregated - Orders grouped by driver + date
router.get("/aggregated", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { platform, dateFrom, dateTo, zone, search, sortBy, sortOrder } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (zone) where.driver = { ...where.driver, zone: zone as string };
    if (search) where.driver = { ...where.driver, name: { contains: search as string, mode: "insensitive" } };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }

    // Get all matching orders
    let allOrders = await prisma.orderLog.findMany({
      where,
      orderBy: { date: "desc" },
      include: { driver: { select: { id: true, name: true, platform: true, zone: true, batchNumber: true, company: { select: { name: true } } } } },
    });

    // Group by driverId + date (day)
    const groupMap = new Map<string, any>();
    for (const o of allOrders) {
      const dateKey = new Date(o.date).toISOString().split("T")[0];
      const key = `${o.driverId}_${dateKey}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          driverId: o.driverId,
          driverName: (o as any).driver?.name || "-",
          zone: (o as any).driver?.zone || null,
          date: dateKey,
          totalDeliveries: 0,
          totalCash: 0,
          orderIds: [],
          orders: [],
        });
      }
      const group = groupMap.get(key)!;
      group.totalDeliveries += o.orderCount;
      group.totalCash += Number(o.cashCollected || 0);
      group.orderIds.push(o.id);
      group.orders.push({
        id: o.id,
        orderNumber: o.orderNumber,
        arrivalTime: o.arrivalTime,
        paymentSource: o.paymentSource,
        cashCollected: o.cashCollected != null ? Number(o.cashCollected) : 0,
        deliveries: o.orderCount,
      });
    }

    let groups = Array.from(groupMap.values());

    // Sort
    const dir = sortOrder === "asc" ? 1 : -1;
    if (sortBy === "driver") groups.sort((a, b) => dir * a.driverName.localeCompare(b.driverName));
    else if (sortBy === "deliveries") groups.sort((a, b) => dir * (a.totalDeliveries - b.totalDeliveries));
    else if (sortBy === "cash") groups.sort((a, b) => dir * (a.totalCash - b.totalCash));
    else groups.sort((a, b) => dir * (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const total = groups.length;
    const paginated = groups.slice(skip, skip + limit);

    res.json(paginatedResponse(paginated, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /export-csv - Download orders as CSV
router.get("/export-csv", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform, dateFrom, dateTo, zone, search } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (zone) where.driver = { ...where.driver, zone: zone as string };
    if (search) where.driver = { ...where.driver, name: { contains: search as string, mode: "insensitive" } };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }

    const orders = await prisma.orderLog.findMany({
      where,
      orderBy: { date: "desc" },
      include: { driver: { select: { name: true, zone: true } } },
    });

    const header = "Date,Driver,Zone,Deliveries,Cash (KD),Order Number,Payment Source,Arrival Time\n";
    const rows = orders.map((o: any) => {
      const date = new Date(o.date).toISOString().split("T")[0];
      const driver = (o.driver?.name || "").replace(/,/g, " ");
      const zone = (o.driver?.zone || "").replace(/,/g, " ");
      const deliveries = o.orderCount;
      const cash = o.cashCollected != null ? Number(o.cashCollected).toFixed(3) : "0.000";
      const orderNum = (o.orderNumber || "").replace(/,/g, " ");
      const payment = o.paymentSource || "";
      const arrival = o.arrivalTime ? new Date(o.arrivalTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      return `${date},${driver},${zone},${deliveries},${cash},${orderNum},${payment},${arrival}`;
    }).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=orders-${dateFrom || "all"}.csv`);
    res.send(header + rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /export - Download orders as XLSX
router.get("/export", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform, dateFrom, dateTo, zone, search } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (zone) where.driver = { ...where.driver, zone: zone as string };
    if (search) where.driver = { ...where.driver, name: { contains: search as string, mode: "insensitive" } };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }

    const orders = await prisma.orderLog.findMany({
      where,
      orderBy: { date: "desc" },
      include: { driver: { select: { name: true, zone: true, batchNumber: true, company: { select: { name: true } } } } },
    });

    const rows = orders.map((o: any) => ({
      "Date": new Date(o.date).toLocaleDateString(),
      "Time": o.arrivalTime ? new Date(o.arrivalTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
      "Order #": o.orderNumber || "",
      "Driver Name": o.driver?.name || "",
      "Company": o.driver?.company?.name || "",
      "Batch #": o.driver?.batchNumber || "",
      "Zone": o.driver?.zone || "",
      "Payment": o.paymentSource || "",
      "Deliveries": o.orderCount,
      "Cash (KD)": o.cashCollected != null ? Number(o.cashCollected).toFixed(3) : "0.000",
    }));

    sendXlsx(res, rows, "Orders", `orders-${dateFrom || "all"}.xlsx`);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /top-restaurants - Orders grouped by restaurantName, filterable by zone
router.get("/top-restaurants", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform, dateFrom, dateTo, zone } = req.query;
    const where: any = { tenantId, restaurantName: { not: null } };
    if (platform) where.platform = platform;
    if (zone) where.driver = { zone: zone as string };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }

    const rows = await prisma.orderLog.groupBy({
      by: ["restaurantName"],
      where,
      _sum: { orderCount: true, cashCollected: true },
      _count: { id: true },
      orderBy: { _sum: { orderCount: "desc" } },
    });

    // Count distinct drivers per restaurant
    const driverPairs = await prisma.orderLog.groupBy({
      by: ["restaurantName", "driverId"],
      where,
    });
    const driversByRestaurant = new Map<string, number>();
    for (const p of driverPairs) {
      if (!p.restaurantName) continue;
      driversByRestaurant.set(p.restaurantName, (driversByRestaurant.get(p.restaurantName) || 0) + 1);
    }

    const result = rows
      .filter((r) => r.restaurantName)
      .map((r) => ({
        restaurantName: r.restaurantName!,
        orders: r._sum.orderCount || 0,
        cashKd: Number(r._sum.cashCollected || 0),
        drivers: driversByRestaurant.get(r.restaurantName!) || 0,
      }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /drivers - Distinct driver names for a platform (for dropdown)
router.get("/drivers", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;

    const drivers = await prisma.driver.findMany({
      where,
      select: { id: true, name: true, zone: true },
      orderBy: { name: "asc" },
    });

    res.json(drivers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const order = await prisma.orderLog.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { driver: true, shift: true },
    });
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/orders:
 *   post:
 *     tags: [Orders]
 *     summary: Log a new order
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId, platform, date, orderCount]
 *             properties:
 *               driverId: { type: string, format: uuid }
 *               platform: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *               date: { type: string, format: date }
 *               orderCount: { type: integer, minimum: 0 }
 *               cashCollected: { type: number, minimum: 0 }
 *               totalAmount: { type: number, minimum: 0 }
 *               tips: { type: number }
 *               source: { type: string, enum: [MANUAL, OCR, WHATSAPP, IMPORT] }
 *     responses:
 *       201:
 *         description: Order created
 *       400:
 *         description: Cash overcollection detected or validation error
 *       422:
 *         description: Validation error
 */
router.post("/", validateBody(createOrderSchema.passthrough()), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { cashCollected, totalAmount, tips, driverId } = req.body;

    // Cash overcollection check: collected should not exceed sales by more than 5%
    const sales = totalAmount ?? (cashCollected && tips ? Number(cashCollected) + Number(tips) : null);
    if (sales != null && cashCollected != null && Number(cashCollected) > Number(sales) * 1.05) {
      // Create a CRITICAL alert and still save, but warn
      await prisma.alert.create({
        data: {
          tenantId,
          type: "cash_overcollection",
          severity: "CRITICAL",
          title: "Cash Overcollection Detected",
          message: `Driver collected KD ${Number(cashCollected).toFixed(3)} but total sales were KD ${Number(sales).toFixed(3)}`,
          driverId: driverId || undefined,
          data: { cashCollected: Number(cashCollected), totalSales: Number(sales) },
        },
      });
    }

    const order = await prisma.orderLog.create({
      data: { ...req.body, tenantId },
    });
    res.status(201).json(order);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const allowed = [
      "shiftId", "date", "platform", "orderCount", "distanceKm",
      "cashCollected", "tips", "totalAmount", "orderNumber",
      "paymentSource", "restaurantName", "arrivalTime", "screenshotUrl",
      "source", "rawData",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const order = await prisma.orderLog.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data,
    });
    if (order.count === 0) { res.status(404).json({ error: "Order not found" }); return; }
    const updated = await prisma.orderLog.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.orderLog.deleteMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    res.json({ message: "Order deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Upload screenshot for OCR processing
router.post("/upload-screenshot", upload.single("screenshot"), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const { platform, driverId, date } = req.body;
    const tenantId = req.user!.tenantId;

    // Attempt OCR via AI service
    let ocrResult = null;
    let orderRecord = null;

    try {
      const { AiOcrService } = await import("../services/aiOcrService");
      const imageBuffer = fs.readFileSync(req.file.path);
      ocrResult = await AiOcrService.processScreenshot(imageBuffer, platform || "KEETA");
    } catch {
      res.json({
        message: "OCR requires ANTHROPIC_API_KEY to be configured.",
        file: req.file.filename,
        platform,
        driverId,
      });
      return;
    }

    if (!ocrResult) {
      res.json({
        message: "OCR requires ANTHROPIC_API_KEY to be configured.",
        file: req.file.filename,
        platform,
        driverId,
      });
      return;
    }

    // Create an OrderLog record from the parsed OCR data
    if (driverId) {
      // Per-platform OCR field schema — explicit mappings to avoid silent 0s
      type OcrSchema = {
        orderCountKeys: string[];
        cashKeys: string[];
        tipsKeys: string[];
        distanceKeys: string[];
      };
      const OCR_SCHEMA: Record<string, OcrSchema> = {
        KEETA:     { orderCountKeys: ["deliveries", "totalOrders", "deliveryCount"], cashKeys: ["cashCollectedKD", "cashKD", "totalAmountKD"], tipsKeys: ["tipsKD"], distanceKeys: ["distanceKm"] },
        TALABAT:   { orderCountKeys: ["deliveryCount", "deliveries", "totalOrders"], cashKeys: ["cashCollectedKD", "cashKD"], tipsKeys: ["tipsKD"], distanceKeys: ["distanceKm"] },
        AMERICANA: { orderCountKeys: ["totalOrders", "deliveryCount", "deliveries"], cashKeys: ["totalAmountKD", "cashCollectedKD"], tipsKeys: [], distanceKeys: [] },
        DELIVEROO: { orderCountKeys: ["deliveries", "deliveryCount", "totalOrders"], cashKeys: ["cashCollectedKD", "totalAmountKD"], tipsKeys: ["tipsKD"], distanceKeys: ["distanceKm"] },
      };

      const ocrPlatform = ((platform || ocrResult.platform) as string || "KEETA").toUpperCase();
      const schema = OCR_SCHEMA[ocrPlatform] || OCR_SCHEMA.KEETA;
      const ocrData = ocrResult as Record<string, any>;

      const pickFirst = (keys: string[]): any => {
        for (const k of keys) if (k in ocrData && ocrData[k] != null) return ocrData[k];
        return undefined;
      };

      const orderCount = Number(pickFirst(schema.orderCountKeys) ?? 0);
      const distanceKm = pickFirst(schema.distanceKeys);
      const cashCollected = pickFirst(schema.cashKeys);
      const tips = pickFirst(schema.tipsKeys);

      const orderDate = ocrResult.platform !== "AMERICANA" && "date" in ocrResult && ocrResult.date
        ? new Date(ocrResult.date)
        : date ? new Date(date) : new Date();

      orderRecord = await prisma.orderLog.create({
        data: {
          tenantId,
          driverId,
          date: orderDate,
          platform: platform || ocrResult.platform,
          orderCount: orderCount || 0,
          distanceKm,
          cashCollected,
          tips,
          screenshotUrl: req.file.filename,
          source: "SCREENSHOT_OCR",
          rawData: ocrResult as any,
        },
      });
    }

    res.json({
      message: "Screenshot processed successfully.",
      file: req.file.filename,
      parsed: ocrResult,
      order: orderRecord,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Import Keeta XLSX
router.post("/import-keeta", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    // XLSX parsing will be implemented with actual column mapping
    res.json({ message: "Keeta XLSX import received", file: req.file.filename });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Import Americana XLSX
router.post("/import-americana", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    res.json({ message: "Americana XLSX import received", file: req.file.filename });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Parse WhatsApp messages (preview only, no save)
router.post("/parse-whatsapp", async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Message text is required" });
      return;
    }
    const parsed = parseWhatsAppMessages(text);
    res.json({ orders: parsed, count: parsed.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Save parsed WhatsApp orders
router.post("/whatsapp-import", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { orders, platform, driverId } = req.body;

    if (!Array.isArray(orders) || orders.length === 0) {
      res.status(400).json({ error: "No orders to import" });
      return;
    }

    const created = [];
    for (const order of orders) {
      const orderDate = order.date ? new Date(order.date) : new Date();
      let arrivalTime: Date | null = null;
      if (order.date && order.arrivalTime) {
        arrivalTime = new Date(`${order.date}T${order.arrivalTime}:00`);
      }

      const record = await prisma.orderLog.create({
        data: {
          tenantId,
          driverId: order.driverId || driverId,
          date: orderDate,
          platform: platform || "TALABAT",
          orderCount: 1,
          orderNumber: order.orderNumber || null,
          paymentSource: order.paymentSource || null,
          arrivalTime,
          cashCollected: order.cashCollected != null ? order.cashCollected : null,
          source: "WHATSAPP",
          rawData: { whatsapp: order.rawText, driverName: order.driverName },
        },
      });
      created.push(record);
    }

    res.status(201).json({
      message: `${created.length} order(s) imported from WhatsApp`,
      orders: created,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
