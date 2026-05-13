import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { parseLocalDate, parseLocalDateEnd } from "../utils/date";
import { createViolationNotifications, getViolationSeverity } from "../services/notificationService";
import { rbac } from "../middleware/rbac";
import { validateBody, createTalabatSessionSchema } from "../utils/validate";
import { assertDriverNotRestricted, DriverRestrictedError } from "../utils/driverRestriction";
import { getAdapter } from "../adapters";
import { reconcilePlatformClock } from "../services/attendanceReconciliation";
import { upload } from "../utils/upload";
import { AiOcrService } from "../services/aiOcrService";
import { makeXlsxImportRoute } from "../services/ingest/xlsxRouteFactory";
import fs from "fs";

const router = Router();
router.use(authMiddleware, tenantScope);

const MUTATORS = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];

// ─── Sessions ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/talabat/sessions:
 *   get:
 *     tags: [Talabat Sessions]
 *     summary: List Talabat sessions with filters and pagination
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: zone
 *         schema: { type: string }
 *       - in: query
 *         name: driverId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: companyId
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by driver name
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated session list with driver info
 */
router.get("/sessions", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo, zone, driverId, status, companyId, search } = req.query;
    const where: any = { tenantId };
    if (companyId) where.driver = { companyId: companyId as string };
    if (zone) where.zone = zone;
    if (driverId) where.driverId = driverId;
    if (status) where.status = status;
    if (search) where.driver = { ...where.driver, name: { contains: search as string, mode: "insensitive" } };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }

    const [data, total] = await Promise.all([
      prisma.talabatSession.findMany({
        where, skip, take: limit,
        orderBy: { date: "desc" },
        include: { driver: { select: { id: true, name: true, platform: true } } },
      }),
      prisma.talabatSession.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/talabat/sessions/summary:
 *   get:
 *     tags: [Talabat Sessions]
 *     summary: Aggregate session stats for a date (totals, hours, zone/status breakdown)
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: Defaults to today
 *       - in: query
 *         name: companyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Summary with totalSessions, plannedHoursSum, actualHoursSum, faceFailCount, zoneBreakdown, statusBreakdown
 */
router.get("/sessions/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    startOfDay.setDate(startOfDay.getDate() - 1); // include UTC-offset dates
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { companyId } = req.query;
    const dateFilter: any = { tenantId, date: { gte: startOfDay, lte: endOfDay } };
    if (companyId) dateFilter.driver = { companyId: companyId as string };

    const [sessions, aggregates, faceFailCount, zoneBreakdown, statusBreakdown] = await Promise.all([
      prisma.talabatSession.count({ where: dateFilter }),
      prisma.talabatSession.aggregate({
        where: dateFilter,
        _sum: { plannedHours: true, actualHours: true },
        _avg: { gpsViolation: true },
      }),
      prisma.talabatSession.count({ where: { ...dateFilter, faceVerified: false } }),
      prisma.talabatSession.groupBy({
        by: ["zone"],
        where: dateFilter,
        _count: { id: true },
      }),
      prisma.talabatSession.groupBy({
        by: ["status"],
        where: dateFilter,
        _count: { id: true },
      }),
    ]);

    res.json({
      totalSessions: sessions,
      plannedHoursSum: aggregates._sum?.plannedHours || 0,
      actualHoursSum: aggregates._sum?.actualHours || 0,
      faceFailCount,
      avgGpsViolation: aggregates._avg?.gpsViolation || 0,
      zoneBreakdown: zoneBreakdown.map((z) => ({ zone: z.zone, count: z._count.id })),
      statusBreakdown: statusBreakdown.map((s) => ({ status: s.status, count: s._count.id })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/talabat/sessions/daily-overview:
 *   get:
 *     tags: [Talabat Sessions]
 *     summary: All sessions grouped by driver for a date with gap analysis
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: Defaults to today
 *     responses:
 *       200:
 *         description: Array of driver groups, each with sessions and gapMinutes between sessions
 */
router.get("/sessions/daily-overview", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    startOfDay.setDate(startOfDay.getDate() - 1);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const sessions = await prisma.talabatSession.findMany({
      where: { tenantId, date: { gte: startOfDay, lte: endOfDay } },
      orderBy: { plannedStart: "asc" },
      include: { driver: { select: { id: true, name: true, platform: true } } },
    });

    // Group by driver
    const grouped: Record<string, { driver: any; sessions: any[]; gapMinutes: number }> = {};
    for (const session of sessions) {
      const dId = session.driverId;
      if (!grouped[dId]) {
        grouped[dId] = { driver: session.driver, sessions: [], gapMinutes: 0 };
      }
      grouped[dId].sessions.push(session);
    }

    // Gap analysis: time between actualEnd of one session and actualStart of next
    for (const dId of Object.keys(grouped)) {
      const driverSessions = grouped[dId].sessions;
      let totalGap = 0;
      for (let i = 1; i < driverSessions.length; i++) {
        const prevEnd = driverSessions[i - 1].actualEnd;
        const currStart = driverSessions[i].actualStart;
        if (prevEnd && currStart) {
          const gap = (new Date(currStart).getTime() - new Date(prevEnd).getTime()) / 60000;
          if (gap > 0) totalGap += gap;
        }
      }
      grouped[dId].gapMinutes = Math.round(totalGap);
    }

    res.json(Object.values(grouped));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/talabat/sessions/{id}:
 *   get:
 *     tags: [Talabat Sessions]
 *     summary: Get a single session with driver, violation events, and delivery items
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session detail with driver, violationEvents, and deliveryItems
 *       404:
 *         description: Session not found
 */
router.get("/sessions/:id", async (req: Request, res: Response) => {
  try {
    const session = await prisma.talabatSession.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { driver: true, violationEvents: true, deliveryItems: { orderBy: { finishedAt: "desc" } } },
    });
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/talabat/sessions:
 *   post:
 *     tags: [Talabat Sessions]
 *     summary: Create a new Talabat session
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId, date]
 *             properties:
 *               driverId: { type: string }
 *               date: { type: string, format: date }
 *               zone: { type: string }
 *               plannedStart: { type: string, format: date-time }
 *               plannedEnd: { type: string, format: date-time }
 *               plannedHours: { type: number }
 *     responses:
 *       201:
 *         description: Created session
 *       403:
 *         description: Driver is restricted
 */
router.post("/sessions", rbac(...MUTATORS), validateBody(createTalabatSessionSchema.passthrough()), async (req: Request, res: Response) => {
  try {
    await assertDriverNotRestricted(req.user!.tenantId, req.body.driverId);
    const session = await prisma.talabatSession.create({
      data: { ...req.body, tenantId: req.user!.tenantId },
    });
    if (session.driverId && (session.actualStart || session.actualEnd)) {
      await reconcilePlatformClock({
        tenantId: session.tenantId,
        driverId: session.driverId,
        date: session.actualStart || session.plannedStart,
        platformClockIn: session.actualStart,
        platformClockOut: session.actualEnd,
        scheduledStart: session.plannedStart,
      }).catch((err) => { logger.warn({ err }, "talabat reconcilePlatformClock failed"); });
    }
    res.status(201).json(session);
  } catch (err: any) {
    if (err instanceof DriverRestrictedError) {
      res.status(403).json({ error: err.message, driverId: err.driverId });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/talabat/sessions/{id}:
 *   put:
 *     tags: [Talabat Sessions]
 *     summary: Update a Talabat session
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated session
 *       404:
 *         description: Session not found
 */
router.put("/sessions/:id", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const allowed = [
      "shiftId", "date", "zone", "vehicleType", "sessionCode",
      "plannedStart", "plannedEnd", "approvedStart", "approvedEnd",
      "actualStart", "actualEnd",
      "plannedHours", "approvedHours", "actualHours",
      "deliveries", "cashCollected", "tips", "distanceKm",
      "status", "faceVerified", "equipmentVerified", "gpsViolation",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const session = await prisma.talabatSession.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data,
    });
    if (session.count === 0) { res.status(404).json({ error: "Session not found" }); return; }
    const updated = await prisma.talabatSession.findUnique({ where: { id: req.params.id } });
    if (updated?.driverId && (updated.actualStart || updated.actualEnd)) {
      await reconcilePlatformClock({
        tenantId: updated.tenantId,
        driverId: updated.driverId,
        date: updated.actualStart || updated.plannedStart,
        platformClockIn: updated.actualStart,
        platformClockOut: updated.actualEnd,
        scheduledStart: updated.plannedStart,
      }).catch((err) => { logger.warn({ err }, "talabat reconcilePlatformClock failed"); });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Deliveries ────────────────────────────────────────────────────────────

// GET /deliveries - List individual deliveries with filters, paginated
router.get("/deliveries", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { driverId, sessionId, dateFrom, dateTo, status } = req.query;
    const where: any = { tenantId };
    if (driverId) where.driverId = driverId;
    if (sessionId) where.sessionId = sessionId;
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }

    const [data, total] = await Promise.all([
      prisma.talabatDelivery.findMany({
        where, skip, take: limit,
        orderBy: { finishedAt: "desc" },
        include: {
          driver: { select: { id: true, name: true, platform: true } },
          session: { select: { id: true, sessionCode: true, zone: true } },
        },
      }),
      prisma.talabatDelivery.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /deliveries/summary - Aggregate stats for deliveries
router.get("/deliveries/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo, driverId } = req.query;
    const where: any = { tenantId };
    if (driverId) where.driverId = driverId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }

    const [total, aggregates, byType] = await Promise.all([
      prisma.talabatDelivery.count({ where }),
      prisma.talabatDelivery.aggregate({
        where,
        _sum: { amount: true, tip: true, distanceKm: true },
      }),
      prisma.talabatDelivery.groupBy({
        by: ["orderType"],
        where,
        _count: { id: true },
      }),
    ]);

    res.json({
      totalDeliveries: total,
      totalAmount: Number(aggregates._sum.amount || 0),
      totalTips: Number(aggregates._sum.tip || 0),
      totalDistanceKm: Number(aggregates._sum.distanceKm || 0),
      byType: byType.map((t) => ({ type: t.orderType, count: t._count.id })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /deliveries/:id - Single delivery
router.get("/deliveries/:id", async (req: Request, res: Response) => {
  try {
    const delivery = await prisma.talabatDelivery.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { driver: true, session: true },
    });
    if (!delivery) { res.status(404).json({ error: "Delivery not found" }); return; }
    res.json(delivery);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /deliveries - Create delivery
router.post("/deliveries", async (req: Request, res: Response) => {
  try {
    const delivery = await prisma.talabatDelivery.create({
      data: { ...req.body, tenantId: req.user!.tenantId },
    });
    res.status(201).json(delivery);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /deliveries/:id - Update delivery
router.put("/deliveries/:id", async (req: Request, res: Response) => {
  try {
    const allowed = [
      "date", "platformOrderId", "shortCode", "finishedAt",
      "orderType", "amount", "tip", "distanceKm", "status",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const delivery = await prisma.talabatDelivery.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data,
    });
    if (delivery.count === 0) { res.status(404).json({ error: "Delivery not found" }); return; }
    const updated = await prisma.talabatDelivery.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Compliance ─────────────────────────────────────────────────────────────

// GET /compliance - List events with filters, paginated
router.get("/compliance", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { type, driverId, companyId, dateFrom, dateTo, resolved, search } = req.query;
    const where: any = { tenantId };
    if (type) where.type = type;
    if (driverId) where.driverId = driverId;
    if (companyId) where.driver = { ...where.driver, companyId: companyId as string };
    if (resolved !== undefined) where.resolved = resolved === "true";
    if (search) where.driver = { ...where.driver, name: { contains: search as string, mode: "insensitive" } };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.createdAt.lte = parseLocalDateEnd(dateTo as string);
    }

    const [data, total] = await Promise.all([
      prisma.talabatViolationEvent.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          driver: { select: { id: true, name: true, platform: true } },
          session: { select: { id: true, sessionCode: true, zone: true, date: true } },
        },
      }),
      prisma.talabatViolationEvent.count({ where }),
    ]);

    // Enrich SHIFT_NOT_BOOKED events with scheduled shift details
    const shiftIds = data
      .filter((e: any) => e.type === "SHIFT_NOT_BOOKED" && e.metadata?.shiftId)
      .map((e: any) => e.metadata.shiftId);
    let shiftMap: Record<string, any> = {};
    if (shiftIds.length > 0) {
      const shifts = await prisma.shift.findMany({
        where: { id: { in: shiftIds } },
        select: { id: true, zone: true, scheduledStart: true, scheduledEnd: true, status: true },
      });
      shiftMap = Object.fromEntries(shifts.map((s) => [s.id, s]));
    }
    const enriched = data.map((e: any) => {
      if (e.type === "SHIFT_NOT_BOOKED" && e.metadata?.shiftId && shiftMap[e.metadata.shiftId]) {
        return { ...e, shift: shiftMap[e.metadata.shiftId] };
      }
      return e;
    });

    res.json(paginatedResponse(enriched, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /compliance/summary - Counts by type, severity, unresolved
router.get("/compliance/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const { companyId } = req.query;
    const summaryWhere: any = { tenantId };
    if (companyId) summaryWhere.driver = { companyId: companyId as string };

    const [byType, unresolvedCount] = await Promise.all([
      prisma.talabatViolationEvent.groupBy({
        by: ["type"],
        where: summaryWhere,
        _count: { id: true },
      }),
      prisma.talabatViolationEvent.count({ where: { ...summaryWhere, resolved: false } }),
    ]);

    res.json({
      byType: byType.map((t) => ({ type: t.type, count: t._count.id })),
      unresolvedCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /compliance - Create event
router.post("/compliance", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const event = await prisma.talabatViolationEvent.create({
      data: { ...req.body, tenantId },
      include: { driver: { select: { name: true } } },
    });
    // Fire notifications
    await createViolationNotifications({
      tenantId,
      eventType: event.type,
      severity: getViolationSeverity(event.type),
      title: event.type.replace(/_/g, " "),
      message: event.description,
      sourceId: event.id,
      metadata: { driverName: (event as any).driver?.name },
    });
    res.status(201).json(event);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /compliance/:id/resolve - Mark resolved
router.put("/compliance/:id/resolve", async (req: Request, res: Response) => {
  try {
    const event = await prisma.talabatViolationEvent.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data: { resolved: true, resolvedAt: new Date(), resolvedBy: (req.user as any).id },
    });
    if (event.count === 0) { res.status(404).json({ error: "Violation event not found" }); return; }
    const updated = await prisma.talabatViolationEvent.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Driver Summary ─────────────────────────────────────────────────────────

// GET /drivers/summary - Active Talabat driver count, avg sessions/week, avg deliveries/day
router.get("/drivers/summary", async (req: Request, res: Response) => {
  try {
    const summary = await getAdapter("TALABAT").getDriverSummary(req.user!.tenantId);
    res.json({
      activeDriverCount: summary.activeDrivers ?? 0,
      avgSessionsPerWeekPerDriver: (summary.extra?.avgSessionsPerWeekPerDriver as number) ?? 0,
      avgDeliveriesPerDay: summary.avgDeliveriesPerDay ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Order Summary ──────────────────────────────────────────────────────────

// GET /orders/summary - Totals from TalabatSession with week-over-week comparison + top earners
router.get("/orders/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo } = req.query;

    const now = new Date();
    const currentEnd = dateTo ? parseLocalDateEnd(dateTo as string) : now;
    const currentStart = dateFrom
      ? parseLocalDate(dateFrom as string)
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rangeDuration = currentEnd.getTime() - currentStart.getTime();
    const prevEnd = new Date(currentStart.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - rangeDuration);

    const currentWhere = { tenantId, date: { gte: currentStart, lte: currentEnd } };
    const previousWhere = { tenantId, date: { gte: prevStart, lte: prevEnd } };

    const [current, previous, sessionsByDriver, allDrivers] = await Promise.all([
      prisma.talabatSession.aggregate({
        where: currentWhere,
        _sum: { deliveries: true, distanceKm: true, tips: true, cashCollected: true },
      }),
      prisma.talabatSession.aggregate({
        where: previousWhere,
        _sum: { deliveries: true, distanceKm: true, tips: true, cashCollected: true },
      }),
      prisma.talabatSession.groupBy({
        by: ["driverId"],
        where: currentWhere,
        _sum: { deliveries: true, cashCollected: true, tips: true },
        orderBy: { _sum: { deliveries: "desc" } },
      }),
      prisma.driver.findMany({
        where: { tenantId, platform: "TALABAT", status: "ACTIVE" },
        select: { id: true, name: true, utr: true },
      }),
    ]);

    // Merge all drivers with session data
    const sessionMap = new Map(sessionsByDriver.map((e) => [e.driverId, e]));
    const topEarners = allDrivers
      .map((d) => {
        const session = sessionMap.get(d.id);
        return {
          driverId: d.id,
          driverName: d.name || "Unknown",
          deliveries: Number(session?._sum.deliveries || 0),
          cashKd: Number(session?._sum.cashCollected || 0),
          tipsKd: Number(session?._sum.tips || 0),
          utr: d.utr || null,
        };
      })
      .sort((a, b) => b.deliveries - a.deliveries);

    const totalDeliveries = Number(current._sum.deliveries || 0);
    const totalDistanceKm = Number(current._sum.distanceKm || 0);
    const totalTips = Number(current._sum.tips || 0);
    const totalCash = Number(current._sum.cashCollected || 0);

    const prevDeliveries = Number(previous._sum.deliveries || 0);
    const prevDistanceKm = Number(previous._sum.distanceKm || 0);
    const prevTips = Number(previous._sum.tips || 0);
    const prevCash = Number(previous._sum.cashCollected || 0);

    res.json({
      thisWeek: {
        deliveries: totalDeliveries,
        distanceKm: totalDistanceKm,
        tipsKd: totalTips,
        cashKd: totalCash,
      },
      lastWeek: {
        deliveries: prevDeliveries,
        distanceKm: prevDistanceKm,
        tipsKd: prevTips,
        cashKd: prevCash,
      },
      topEarners,
      // Keep flat fields for backward compat
      totalDeliveries,
      totalDistanceKm,
      totalTips,
      totalCash,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Orders by Hour ────────────────────────────────────────────────────────

// GET /orders/hourly - Deliveries grouped by hour of day
router.get("/orders/hourly", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo } = req.query;

    const where: any = { tenantId };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo as string);
    }

    let sessions = await prisma.talabatSession.findMany({
      where,
      select: { plannedStart: true, actualStart: true, deliveries: true },
    });

    // Smart date fallback: if no sessions for the requested date, find most recent date
    if (sessions.length === 0 && (dateFrom || dateTo)) {
      const fallbackWhere: any = { tenantId };
      const latest = await prisma.talabatSession.findFirst({
        where: fallbackWhere,
        orderBy: { date: "desc" },
        select: { date: true },
      });
      if (latest) {
        const latestDate = new Date(latest.date);
        latestDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(latestDate);
        nextDay.setDate(nextDay.getDate() + 1);
        fallbackWhere.date = { gte: latestDate, lt: nextDay };
        sessions = await prisma.talabatSession.findMany({
          where: fallbackWhere,
          select: { plannedStart: true, actualStart: true, deliveries: true },
        });
      }
    }

    // Group deliveries by hour of day (use actualStart if available, else plannedStart)
    const hourlyMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourlyMap[h] = 0;

    for (const s of sessions) {
      const startTime = s.actualStart || s.plannedStart;
      if (!startTime) continue;
      const hour = new Date(startTime).getHours();
      hourlyMap[hour] += s.deliveries;
    }

    const hourly = Object.entries(hourlyMap).map(([hour, orders]) => ({
      hour: Number(hour),
      orders,
    }));

    res.json(hourly);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Enhanced Overview ─────────────────────────────────────────────────────

// GET /overview - Combined dashboard data for Talabat Overview page
router.get("/overview", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const companyId = req.query.companyId as string | undefined;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(todayStart.getTime() - 14 * 24 * 60 * 60 * 1000);
    const nextWeekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const driverWhere: any = { tenantId, platform: "TALABAT", status: "ACTIVE" };
    if (companyId) driverWhere.companyId = companyId;

    const companyFilter = companyId ? { driver: { companyId } } : {};
    const companyPlatformFilter = companyId ? { driver: { companyId, platform: "TALABAT" as any } } : { driver: { platform: "TALABAT" as any } };

    const [
      drivers,
      todayOrders,
      todayCash,
      todayAttendance,
      todayViolations,
      recentAlerts,
      todaySessions,
      sessionsByZone,
      sessionsByStatus,
      violationsByType,
      unresolvedViolations,
      violationsPerDriver,
      thisWeekOrders,
      lastWeekOrders,
      hourlyData,
      weekAttendance,
      nextWeekShifts,
      overdueCashRecords,
      driversOnLeaveToday,
      restaurantOrders,
      todayMetrics,
      shiftSettings,
    ] = await Promise.all([
      // All active drivers
      prisma.driver.findMany({
        where: driverWhere,
        select: {
          id: true, name: true, phone: true, utr: true, batchNumber: true, zone: true, status: true,
          companyId: true, company: { select: { name: true } },
          aiScores: { orderBy: { date: "desc" }, take: 1, select: { compositeScore: true, trend: true } },
        },
        orderBy: { name: "asc" },
      }),
      // Today's orders
      prisma.orderLog.findMany({
        where: { tenantId, platform: "TALABAT", date: { gte: todayStart, lt: todayEnd }, ...companyFilter },
        select: { driverId: true, orderCount: true, cashCollected: true, tips: true, totalAmount: true },
      }),
      // Today's cash
      prisma.cashRecord.findMany({
        where: { tenantId, date: { gte: todayStart, lt: todayEnd }, ...companyPlatformFilter },
        select: { driverId: true, salesAmount: true, collectionAmount: true, pendingDues: true },
      }),
      // Today's attendance
      prisma.attendanceRecord.findMany({
        where: { tenantId, date: { gte: todayStart, lt: todayEnd }, ...companyPlatformFilter },
        select: { driverId: true, status: true, lateMinutes: true },
      }),
      // Today's violations
      prisma.talabatViolationEvent.findMany({
        where: { tenantId, createdAt: { gte: todayStart, lt: todayEnd }, ...companyFilter },
        select: { id: true, driverId: true, type: true, description: true, resolved: true, driver: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      // Active alerts
      prisma.alert.findMany({
        where: { tenantId, status: "ACTIVE", ...companyPlatformFilter },
        select: { id: true, type: true, severity: true, title: true, message: true, driverId: true, driver: { select: { name: true } }, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // Today's sessions count & hours
      prisma.talabatSession.aggregate({
        where: { tenantId, date: { gte: todayStart, lt: todayEnd }, ...(companyId ? { driver: { companyId } } : {}) },
        _count: { id: true },
        _sum: { plannedHours: true, actualHours: true, deliveries: true },
      }),
      // Sessions by zone (today)
      prisma.talabatSession.groupBy({
        by: ["zone"],
        where: { tenantId, date: { gte: todayStart, lt: todayEnd }, ...(companyId ? { driver: { companyId } } : {}) },
        _count: { id: true },
        _sum: { deliveries: true },
      }),
      // Sessions by status (today)
      prisma.talabatSession.groupBy({
        by: ["status"],
        where: { tenantId, date: { gte: todayStart, lt: todayEnd }, ...(companyId ? { driver: { companyId } } : {}) },
        _count: { id: true },
      }),
      // Violations by type (all unresolved)
      prisma.talabatViolationEvent.groupBy({
        by: ["type"],
        where: { tenantId, resolved: false, ...companyFilter },
        _count: { id: true },
      }),
      // Unresolved violation count
      prisma.talabatViolationEvent.count({
        where: { tenantId, resolved: false, ...companyFilter },
      }),
      // Unresolved violations per driver
      prisma.talabatViolationEvent.groupBy({
        by: ["driverId"],
        where: { tenantId, resolved: false, ...companyFilter },
        _count: { id: true },
      }),
      // This week's order totals
      prisma.talabatSession.aggregate({
        where: { tenantId, date: { gte: sevenDaysAgo, lt: todayEnd }, ...(companyId ? { driver: { companyId } } : {}) },
        _sum: { deliveries: true, cashCollected: true, tips: true, distanceKm: true },
      }),
      // Last week's order totals
      prisma.talabatSession.aggregate({
        where: { tenantId, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo }, ...(companyId ? { driver: { companyId } } : {}) },
        _sum: { deliveries: true, cashCollected: true, tips: true, distanceKm: true },
      }),
      // Hourly distribution (today's sessions)
      prisma.talabatSession.findMany({
        where: { tenantId, date: { gte: todayStart, lt: todayEnd }, ...(companyId ? { driver: { companyId } } : {}) },
        select: { plannedStart: true, actualStart: true, deliveries: true, cashCollected: true },
      }),
      // Week attendance trend (last 7 days)
      prisma.attendanceRecord.findMany({
        where: { tenantId, date: { gte: sevenDaysAgo, lt: todayEnd }, ...companyPlatformFilter },
        select: { date: true, status: true },
      }),
      // Shifts booked for next 7 days (to find unbooked drivers)
      prisma.shift.findMany({
        where: { tenantId, platform: "TALABAT", date: { gte: todayStart, lt: nextWeekEnd }, ...(companyId ? { driver: { companyId } } : {}) },
        select: { driverId: true },
      }),
      // Overdue cash: PENDING cash records older than today
      prisma.cashRecord.findMany({
        where: { tenantId, status: "PENDING", date: { lt: todayStart }, ...(companyId ? { driver: { companyId, platform: "TALABAT" as any } } : { driver: { platform: "TALABAT" as any } }) },
        select: { driverId: true, date: true, pendingDues: true, driver: { select: { name: true, zone: true } } },
        orderBy: { date: "asc" },
      }),
      // Drivers on approved leave today
      prisma.leaveRequest.count({
        where: {
          tenantId,
          status: "APPROVED",
          startDate: { lte: todayEnd },
          endDate: { gte: todayStart },
          ...(companyId ? { driver: { companyId, platform: "TALABAT" as any } } : { driver: { platform: "TALABAT" as any } }),
        },
      }),
      // Orders with restaurant + hour for time-period breakdown
      prisma.orderLog.findMany({
        where: { tenantId, platform: "TALABAT", date: { gte: todayStart, lt: todayEnd }, ...companyFilter, restaurantName: { not: null } },
        select: { restaurantName: true, orderCount: true, date: true },
      }),
      // Today's per-driver online hours (for UTR shift-eligibility filter)
      prisma.talabatDailyMetrics.findMany({
        where: { tenantId, shiftDate: { gte: todayStart, lt: todayEnd }, ...(companyId ? { driver: { companyId } } : {}) },
        select: { driverId: true, onlineHours: true, utr: true },
      }),
      // Platform shift rules (defaultHoursPerDay)
      prisma.platformSettings.findUnique({
        where: { tenantId_platform: { tenantId, platform: "TALABAT" } },
        select: { shiftRules: true },
      }),
    ]);

    // Build per-driver maps
    const ordersByDriver = new Map<string, { orders: number; cash: number; tips: number }>();
    for (const o of todayOrders) {
      const e = ordersByDriver.get(o.driverId) || { orders: 0, cash: 0, tips: 0 };
      e.orders += o.orderCount; e.cash += Number(o.cashCollected || 0); e.tips += Number(o.tips || 0);
      ordersByDriver.set(o.driverId, e);
    }
    const cashByDriver = new Map<string, { collected: number; pending: number; sales: number }>();
    for (const c of todayCash) {
      const e = cashByDriver.get(c.driverId) || { collected: 0, pending: 0, sales: 0 };
      e.collected += Number(c.collectionAmount); e.pending += Number(c.pendingDues); e.sales += Number(c.salesAmount);
      cashByDriver.set(c.driverId, e);
    }
    const attendanceByDriver = new Map<string, string>();
    for (const a of todayAttendance) attendanceByDriver.set(a.driverId, a.status);
    const alertsByDriver = new Map<string, number>();
    for (const v of violationsPerDriver) alertsByDriver.set(v.driverId, v._count.id);

    // Build driver rows
    const driverRows = drivers.map((d: any) => {
      const od = ordersByDriver.get(d.id) || { orders: 0, cash: 0, tips: 0 };
      const cd = cashByDriver.get(d.id) || { collected: 0, pending: 0, sales: 0 };
      const att = attendanceByDriver.get(d.id) || null;
      const score = d.aiScores[0] || null;
      return {
        id: d.id, name: d.name, phone: d.phone, utr: d.utr, batchNumber: d.batchNumber, zone: d.zone,
        company: d.company.name, companyId: d.companyId,
        darbGrade: score?.compositeScore || null, gradeTrend: score?.trend || null,
        todayOrders: od.orders, cashCollected: cd.collected, cashPending: cd.pending, cashSales: cd.sales,
        attendance: att, alertCount: alertsByDriver.get(d.id) || 0,
      };
    });
    driverRows.sort((a: any, b: any) => (b.darbGrade || 0) - (a.darbGrade || 0));
    driverRows.forEach((d: any, i: number) => (d as any).rank = i + 1);

    // Summary stats
    const totalOrders = driverRows.reduce((s: number, d: any) => s + d.todayOrders, 0);
    const totalCashCollected = driverRows.reduce((s: number, d: any) => s + d.cashCollected, 0);
    const totalCashPending = driverRows.reduce((s: number, d: any) => s + d.cashPending, 0);
    const presentCount = driverRows.filter((d: any) => d.attendance === "PRESENT").length;
    const lateCount = driverRows.filter((d: any) => d.attendance === "LATE").length;
    const absentCount = driverRows.filter((d: any) => d.attendance === "ABSENT").length;
    const noDataCount = drivers.length - presentCount - lateCount - absentCount;

    // Hourly distribution
    const hourlyOrders: Record<number, number> = {};
    const hourlyCash: Record<number, number> = {};
    const hourlySessions: Record<number, number> = {};
    for (let h = 0; h < 24; h++) { hourlyOrders[h] = 0; hourlyCash[h] = 0; hourlySessions[h] = 0; }
    for (const s of hourlyData) {
      const t = s.actualStart || s.plannedStart;
      if (t) {
        const h = new Date(t).getHours();
        hourlyOrders[h] += s.deliveries;
        hourlyCash[h] += Number(s.cashCollected || 0);
        hourlySessions[h] += 1;
      }
    }
    const hourly = Object.entries(hourlyOrders).map(([h, orders]) => ({
      hour: Number(h),
      orders,
      cash: Math.round(hourlyCash[Number(h)] * 1000) / 1000,
      sessions: hourlySessions[Number(h)],
    }));

    // Week-over-week comparison
    const thisWeekDeliveries = Number(thisWeekOrders._sum.deliveries || 0);
    const lastWeekDeliveries = Number(lastWeekOrders._sum.deliveries || 0);
    const weekChange = lastWeekDeliveries > 0
      ? Math.round(((thisWeekDeliveries - lastWeekDeliveries) / lastWeekDeliveries) * 100)
      : 0;

    // Week attendance trend (group by day)
    const attendanceTrend: Record<string, { present: number; late: number; absent: number }> = {};
    for (const a of weekAttendance) {
      const day = new Date(a.date).toISOString().split("T")[0];
      if (!attendanceTrend[day]) attendanceTrend[day] = { present: 0, late: 0, absent: 0 };
      if (a.status === "PRESENT") attendanceTrend[day].present++;
      else if (a.status === "LATE") attendanceTrend[day].late++;
      else if (a.status === "ABSENT") attendanceTrend[day].absent++;
    }

    // Top performers (top 5 by orders today)
    const topPerformers = [...driverRows]
      .sort((a, b) => b.todayOrders - a.todayOrders)
      .slice(0, 5)
      .filter((d) => d.todayOrders > 0);

    // UTR: average UTR of drivers who hit the default shift period today
    const shiftRules = (shiftSettings?.shiftRules as any) || {};
    const defaultHoursPerDay = Number(
      shiftRules?.MOTORCYCLE?.defaultHoursPerDay ??
      shiftRules?.CAR?.defaultHoursPerDay ??
      shiftRules?.defaultHoursPerDay ??
      12
    );
    const hoursByDriver = new Map<string, number>();
    const utrByDriver = new Map<string, number>();
    for (const m of todayMetrics) {
      if (m.onlineHours != null) hoursByDriver.set(m.driverId, Number(m.onlineHours));
      if (m.utr != null) utrByDriver.set(m.driverId, Number(m.utr));
    }
    const eligibleDrivers = driverRows.filter((d) => {
      const utrVal = utrByDriver.get(d.id) ?? (d.utr != null ? Number(d.utr) : null);
      const hours = hoursByDriver.get(d.id) ?? 0;
      return utrVal != null && hours >= defaultHoursPerDay;
    });
    const avgUtr = eligibleDrivers.length > 0
      ? Math.round((eligibleDrivers.reduce((sum, d) => sum + Number(utrByDriver.get(d.id) ?? d.utr ?? 0), 0) / eligibleDrivers.length) * 100) / 100
      : null;

    // Drivers who haven't booked any shift for the next 7 days
    const bookedDriverIds = new Set(nextWeekShifts.map((s: any) => s.driverId));
    const unbookedDrivers = drivers
      .filter((d: any) => !bookedDriverIds.has(d.id))
      .map((d: any) => ({ id: d.id, name: d.name, zone: d.zone, company: d.company.name }));

    // Overdue cash: group by driver, sum pending dues
    const overdueCashByDriver = new Map<string, { name: string; zone: string | null; totalPending: number; oldestDate: Date }>();
    for (const r of overdueCashRecords as any[]) {
      const existing = overdueCashByDriver.get(r.driverId);
      const pending = Number(r.pendingDues);
      if (existing) {
        existing.totalPending += pending;
        if (new Date(r.date) < existing.oldestDate) existing.oldestDate = new Date(r.date);
      } else {
        overdueCashByDriver.set(r.driverId, {
          name: r.driver.name,
          zone: r.driver.zone,
          totalPending: pending,
          oldestDate: new Date(r.date),
        });
      }
    }
    const overdueCashDrivers = Array.from(overdueCashByDriver.entries())
      .map(([driverId, data]) => ({ driverId, ...data, daysSince: Math.floor((todayStart.getTime() - data.oldestDate.getTime()) / (1000 * 60 * 60 * 24)) }))
      .filter((d) => d.totalPending > 0)
      .sort((a, b) => b.totalPending - a.totalPending);
    const totalOverdueCash = overdueCashDrivers.reduce((s, d) => s + d.totalPending, 0);

    res.json({
      drivers: driverRows,
      summary: {
        totalDrivers: drivers.length,
        totalOrders,
        totalCashCollected: Math.round(totalCashCollected * 1000) / 1000,
        totalCashPending: Math.round(totalCashPending * 1000) / 1000,
        presentCount, lateCount, absentCount, noDataCount,
        activeViolations: unresolvedViolations,
        activeSessions: todaySessions._count.id,
        totalSessionHours: Math.round((Number(todaySessions._sum.actualHours) || 0) * 10) / 10,
        avgOrdersPerDriver: drivers.length > 0 ? Math.round((totalOrders / drivers.length) * 10) / 10 : 0,
        shiftsNotBookedNextWeek: unbookedDrivers.length,
        driversOnLeave: driversOnLeaveToday,
        utr: avgUtr,
        weekChange,
        thisWeekDeliveries,
        lastWeekDeliveries,
      },
      violations: todayViolations,
      alerts: recentAlerts,
      zoneBreakdown: sessionsByZone.map((z: any) => ({
        zone: z.zone || "Unassigned",
        sessions: z._count.id,
        deliveries: z._sum.deliveries || 0,
      })),
      sessionStatus: sessionsByStatus.map((s: any) => ({ status: s.status, count: s._count.id })),
      violationsByType: violationsByType.map((v: any) => ({ type: v.type, count: v._count.id })),
      hourly,
      byRestaurant: (() => {
        // Aggregate totals
        const totals = new Map<string, number>();
        for (const o of restaurantOrders) {
          const name = o.restaurantName || "Unknown";
          totals.set(name, (totals.get(name) || 0) + (o.orderCount || 0));
        }
        return Array.from(totals.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([name, orders]) => ({ name, orders }));
      })(),
      byRestaurantPeriod: (() => {
        // 3 periods: morning 6-11, afternoon 12-16, evening 17-23
        const periods: Record<string, Map<string, number>> = {
          morning: new Map(),
          afternoon: new Map(),
          evening: new Map(),
        };
        for (const o of restaurantOrders) {
          const name = o.restaurantName || "Unknown";
          const hour = new Date(o.date).getHours();
          const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
          periods[period].set(name, (periods[period].get(name) || 0) + (o.orderCount || 0));
        }
        const toTop = (map: Map<string, number>) =>
          Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, orders]) => ({ name, orders }));
        return {
          morning: toTop(periods.morning),
          afternoon: toTop(periods.afternoon),
          evening: toTop(periods.evening),
        };
      })(),
      topPerformers,
      attendanceTrend: Object.entries(attendanceTrend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, ...counts })),
      unbookedNextWeek: unbookedDrivers,
      overdueCash: {
        totalAmount: Math.round(totalOverdueCash * 1000) / 1000,
        driverCount: overdueCashDrivers.length,
        drivers: overdueCashDrivers.map((d) => ({ ...d, oldestDate: d.oldestDate.toISOString() })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── R1 · Daily metrics OCR ingestion ───────────────────────────────────────

const OCR_CONFIDENCE_THRESHOLD = 0.85;

/**
 * POST /api/talabat/metrics/ingest-screenshot
 * Multipart: image (required), driverId, shiftDate? (ISO date).
 * Runs Talabat stat-screen OCR and writes a TalabatDailyMetrics row.
 * Status is PARSED if confidence ≥ 0.85, else PENDING_REVIEW (notifies Ops).
 */
router.post(
  "/metrics/ingest-screenshot",
  rbac(...MUTATORS),
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { driverId, shiftDate: shiftDateRaw } = req.body;

      if (!req.file) return res.status(400).json({ error: "image is required" });
      if (!driverId) return res.status(400).json({ error: "driverId is required" });

      const driver = await prisma.driver.findFirst({
        where: { id: driverId, tenantId, platform: "TALABAT" },
        select: { id: true, name: true },
      });
      if (!driver) return res.status(404).json({ error: "Talabat driver not found" });

      const buffer = fs.readFileSync(req.file.path);
      const extracted = await AiOcrService.extractTalabatMetrics(buffer);

      const confidence = extracted?.confidence ?? 0;
      const status =
        !extracted || confidence < OCR_CONFIDENCE_THRESHOLD ? "PENDING_REVIEW" : "PARSED";

      const shiftDate = shiftDateRaw
        ? parseLocalDate(shiftDateRaw)
        : extracted?.shiftDate
          ? parseLocalDate(extracted.shiftDate)
          : (() => {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              return d;
            })();

      const source =
        req.user!.role === "DRIVER" ? "OCR_MOBILE" : "OCR_WEB";

      const row = await prisma.talabatDailyMetrics.upsert({
        where: { tenantId_driverId_shiftDate: { tenantId, driverId, shiftDate } },
        create: {
          tenantId,
          driverId,
          shiftDate,
          utr: extracted?.utr ?? null,
          ordersCompleted: extracted?.ordersCompleted ?? null,
          onlineHours: extracted?.onlineHours ?? null,
          earnings: extracted?.earnings ?? null,
          source,
          status,
          rawImageUrl: `/uploads/${req.file.filename}`,
          ocrConfidence: confidence,
          ocrRaw: extracted as any,
        },
        update: {
          utr: extracted?.utr ?? undefined,
          ordersCompleted: extracted?.ordersCompleted ?? undefined,
          onlineHours: extracted?.onlineHours ?? undefined,
          earnings: extracted?.earnings ?? undefined,
          source,
          status,
          rawImageUrl: `/uploads/${req.file.filename}`,
          ocrConfidence: confidence,
          ocrRaw: extracted as any,
        },
      });

      if (status === "PENDING_REVIEW") {
        await createViolationNotifications({
          tenantId,
          eventType: "OCR_PENDING_REVIEW",
          severity: "MEDIUM",
          title: "Talabat shift screenshot needs review",
          message: `OCR confidence ${(confidence * 100).toFixed(0)}% for ${driver.name} — please verify`,
          sourceId: row.id,
          metadata: {
            category: "OPS_TODO",
            titleAr: "لقطة شاشة وردية طلبات بحاجة إلى مراجعة",
            bodyAr: `ثقة OCR ${(confidence * 100).toFixed(0)}% للسائق ${driver.name} — يرجى التحقق`,
            driverId,
            metricId: row.id,
          },
        }).catch((err) => { logger.warn({ err }, "talabat reconcilePlatformClock failed"); });
      }

      res.json({
        status,
        extracted,
        metricId: row.id,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── Rules ──────────────────────────────────────────────────────────────────

// POST /rules/run - Execute all rule checks
router.post("/rules/run", async (req: Request, res: Response) => {
  try {
    const { runAllRules } = await import("../services/rulesEngine");
    const results = await runAllRules(req.user!.tenantId);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 6 / REQ-ingest-adapter-layer ─────────────────────────────────────
// POST /api/talabat/import — XLSX-fallback ingest per CON-xlsx-fallback.
// Mirrors the canonical Keeta /import shape via makeXlsxImportRoute factory
// + TalabatXlsxAdapter (services/ingest/talabat/xlsx.ts).
//
// Auth + tenantScope are inherited from router.use(authMiddleware, tenantScope)
// at the top of this file. Multer's upload.single("file") writes to /tmp;
// the factory reads the buffer, dispatches to the adapter, and writes one
// IngestRun audit row.
//
// Response shape: { success: true, rowsIn, rowsOk, errors[] }.
// Failure: HTTP 400 + { error: message } when headers malformed (Pitfall 10).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/import", upload.single("file"), makeXlsxImportRoute("TALABAT"));

export default router;
