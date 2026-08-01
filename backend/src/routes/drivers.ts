import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { sendXlsx } from "../utils/xlsxExport";
import { validateBody, createDriverSchema } from "../utils/validate";
import { rbac } from "../middleware/rbac";
import { resolveDriverDateRange, batchLoadDriverStats, resolveTalabatStatus } from "../services/driverService";
import { listSnapshotsForDriver, listMemoriesByPrefix } from "../agent";
import { explainScore } from "../services/driverFile/scoreExplainer";
import { loadDriverAuditLog } from "../services/driverFile/decisionAuditFilter";

const router = Router();
router.use(authMiddleware, tenantScope);

const MUTATORS = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];
const DESTRUCTIVE = ["ADMIN", "OPS_MANAGER"];
const toNumber = (value: unknown) => Number(value ?? 0);
const toIso = (value?: Date | string | null) => (value ? new Date(value).toISOString() : null);

/**
 * @swagger
 * /api/drivers:
 *   get:
 *     tags: [Drivers]
 *     summary: List all drivers with today's performance data
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: companyId
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated driver list with performance metrics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Driver' }
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { platform, status, companyId, zone, batchNumber, search, performanceTier } = req.query;

    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (performanceTier) {
      const vals = String(performanceTier).split(",").filter(Boolean);
      where.performanceTier = vals.length === 1 ? vals[0] : { in: vals };
    }
    if (status) {
      const vals = (status as string).split(",").filter(Boolean);
      where.status = vals.length === 1 ? vals[0] : { in: vals };
    }
    if (companyId) {
      const ids = (companyId as string).split(",").filter(Boolean);
      where.companyId = ids.length === 1 ? ids[0] : { in: ids };
    }
    if (zone) {
      const vals = (zone as string).split(",").filter(Boolean);
      where.zone = vals.length === 1 ? vals[0] : { in: vals };
    }
    if (batchNumber) {
      const vals = (batchNumber as string).split(",").filter(Boolean);
      where.batchNumber = vals.length === 1 ? vals[0] : { in: vals };
    }
    if (search) {
      where.OR = [
        // driverCode first: finance searches by the Darb driver ID
        // ("DRB-0001"), which is the standard for remittances (revision #14).
        { driverCode: { contains: search as string, mode: "insensitive" } },
        { name: { contains: search as string, mode: "insensitive" } },
        { platformDriverId: { contains: search as string, mode: "insensitive" } },
        { phone: { contains: search as string } },
      ];
    }

    const dateRange = await resolveDriverDateRange(tenantId, req.query.date as string | undefined);

    const [data, total] = await Promise.all([
      prisma.driver.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          company: { select: { name: true, platform: true } },
        },
      }),
      prisma.driver.count({ where }),
    ]);

    // Batch-load performance stats for all drivers in one pass (4 queries total, not 4*N)
    const driverIds = data.map((d) => d.id);
    const statsMap = await batchLoadDriverStats(tenantId, driverIds, dateRange);

    // How many times each driver has deposited (lifetime count of cash deposit records)
    const depositCountRows = driverIds.length
      ? await prisma.cashRecord.groupBy({
          by: ["driverId"],
          where: { tenantId, driverId: { in: driverIds }, collectionAmount: { gt: 0 } },
          _count: { _all: true },
        })
      : [];
    const depositCountMap = new Map(depositCountRows.map((r) => [r.driverId, r._count._all]));

    // Batch-load current Americana store assignments (one row per driver for the current month
    // or the latest open assignment) so the drivers list can show chain + branch.
    const americanaIds = data.filter((d) => d.platform === "AMERICANA").map((d) => d.id);
    const americanaAssignmentMap = new Map<string, { chain: string | null; storeName: string | null }>();
    if (americanaIds.length > 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const assignments = await prisma.americanaStoreAssignment.findMany({
        where: {
          tenantId,
          driverId: { in: americanaIds },
          OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
        },
        orderBy: { startDate: "desc" },
        include: { store: { include: { chain: true } } },
      });
      for (const a of assignments) {
        if (!americanaAssignmentMap.has(a.driverId)) {
          americanaAssignmentMap.set(a.driverId, {
            chain: a.store?.chain?.name ?? null,
            storeName: a.store?.name ?? null,
          });
        }
      }
    }

    const enriched = data.map((d) => {
      const stats = statsMap.get(d.id);
      const talabatStatus = resolveTalabatStatus(d.status, d.platform, stats?.talabatStatus);
      const americanaAssignment = americanaAssignmentMap.get(d.id);
      return {
        ...d,
        dailyOrders: stats?.dailyOrders ?? 0,
        totalSales: stats?.totalSales ?? null,
        cashCollected: stats?.cashCollected ?? null,
        cashDeposited: stats?.cashDeposited ?? null,
        depositCount: depositCountMap.get(d.id) ?? 0,
        uti: stats?.uti ?? 0,
        workingHours: stats?.workingHours ?? null,
        talabatStatus,
        employeeId: d.platform === "AMERICANA" ? d.platformDriverId : (d as any).employeeId,
        chain: americanaAssignment?.chain ?? null,
        storeName: americanaAssignment?.storeName ?? null,
      };
    });

    res.json(paginatedResponse(enriched, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform, companyId } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (companyId) {
      const ids = (companyId as string).split(",").filter(Boolean);
      where.companyId = ids.length === 1 ? ids[0] : { in: ids };
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const sessionWhere: any = { tenantId, date: { gte: startOfToday, lte: endOfToday } };
    if (platform) sessionWhere.driver = { platform };
    if (companyId) {
      const ids = (companyId as string).split(",").filter(Boolean);
      sessionWhere.driver = { ...sessionWhere.driver, companyId: ids.length === 1 ? ids[0] : { in: ids } };
    }

    const [total, active, inactive, suspended, drivers, todaySessions] = await Promise.all([
      prisma.driver.count({ where }),
      prisma.driver.count({ where: { ...where, status: "ACTIVE" } }),
      prisma.driver.count({ where: { ...where, status: "INACTIVE" } }),
      prisma.driver.count({ where: { ...where, status: "SUSPENDED" } }),
      prisma.driver.findMany({
        where,
        select: {
          healthCertStatus: true, workPermitStatus: true, foodHandlingCertStatus: true,
          vehicleRegStatus: true, vehicleInsuranceStatus: true, drivingLicenseStatus: true, civilIdStatus: true,
        },
      }),
      prisma.talabatSession.findMany({
        where: sessionWhere,
        select: { deliveries: true, actualHours: true },
      }),
    ]);

    let docsExpiring = 0;
    let docsMissing = 0;
    const docFields = ["healthCertStatus", "workPermitStatus", "foodHandlingCertStatus", "vehicleRegStatus", "vehicleInsuranceStatus", "drivingLicenseStatus", "civilIdStatus"] as const;
    const expiringDrivers = new Set<number>();
    const missingDrivers = new Set<number>();
    drivers.forEach((d, idx) => {
      for (const f of docFields) {
        const s = (d as any)[f];
        if (s === "EXPIRING" || s === "EXPIRED") expiringDrivers.add(idx);
        if (!s || s === "MISSING") missingDrivers.add(idx);
      }
    });
    docsExpiring = expiringDrivers.size;
    docsMissing = missingDrivers.size;

    // Calculate today's orders and avg UTR
    let totalOrdersToday = 0;
    let totalHoursToday = 0;
    for (const s of todaySessions) {
      totalOrdersToday += s.deliveries || 0;
      totalHoursToday += Number(s.actualHours || 0);
    }
    const avgUtrToday = totalHoursToday > 0
      ? Math.round((totalOrdersToday / totalHoursToday) * 10) / 10
      : 0;

    res.json({ total, active, inactive, suspended, docsExpiring, docsMissing, avgUtrToday, totalOrdersToday });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Shifts — driver online sessions for a Kuwait-local day. A "shift" is one
// CourierOnlineSession: startTime = driver went online, endTime = went offline
// (null = still online now). Registered before the "/:id" routes so "/shifts"
// is not swallowed as an id. Read-only; SUPERVISOR+ reach it via tenantScope.
router.get("/shifts", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    // Kuwait is UTC+3, no DST. Treat ?date=YYYY-MM-DD as that calendar day in
    // Kuwait local time; default to "today" in Kuwait.
    const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;
    const rawDate = String(req.query.date || "").trim();
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : new Date(Date.now() + KUWAIT_OFFSET_MS).toISOString().slice(0, 10);
    const dayStart = new Date(`${dateStr}T00:00:00.000+03:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();

    const [sessions, onlineNow] = await Promise.all([
      prisma.courierOnlineSession.findMany({
        where: { tenantId, startTime: { gte: dayStart, lt: dayEnd } },
        orderBy: { startTime: "asc" },
        select: {
          id: true,
          driverId: true,
          startTime: true,
          endTime: true,
          isOnline: true,
          availability: true,
          area: true,
          driver: { select: { name: true, phone: true } },
        },
      }),
      // Live count of drivers currently online, independent of the viewed day.
      prisma.courierOnlineSession.count({
        where: { tenantId, isOnline: true, endTime: null },
      }),
    ]);

    const byDriver = new Map<string, any>();
    for (const s of sessions) {
      const end = s.endTime ?? now;
      const durationMinutes = Math.max(0, Math.round((end.getTime() - s.startTime.getTime()) / 60000));
      let entry = byDriver.get(s.driverId);
      if (!entry) {
        entry = {
          driverId: s.driverId,
          name: s.driver?.name ?? "n/a",
          phone: s.driver?.phone ?? null,
          sessions: [] as any[],
          totalMinutes: 0,
          firstStart: s.startTime,
          lastEnd: s.endTime ?? null,
          onlineNow: false,
        };
        byDriver.set(s.driverId, entry);
      }
      const stillOnline = s.endTime == null && s.isOnline;
      entry.sessions.push({
        id: s.id,
        startTime: toIso(s.startTime),
        endTime: toIso(s.endTime),
        durationMinutes,
        area: s.area ?? null,
        isOnline: stillOnline,
        availability: s.availability,
      });
      entry.totalMinutes += durationMinutes;
      if (s.startTime < entry.firstStart) entry.firstStart = s.startTime;
      if (stillOnline) {
        entry.onlineNow = true;
        entry.lastEnd = null;
      } else if (entry.lastEnd !== null && s.endTime && new Date(entry.lastEnd) < s.endTime) {
        entry.lastEnd = s.endTime;
      }
    }

    const drivers = Array.from(byDriver.values())
      .map((d) => ({
        ...d,
        firstStart: toIso(d.firstStart),
        lastEnd: toIso(d.lastEnd),
      }))
      // Online drivers first, then most hours worked.
      .sort((a, b) => Number(b.onlineNow) - Number(a.onlineNow) || b.totalMinutes - a.totalMinutes);

    const totalMinutes = drivers.reduce((sum, d) => sum + d.totalMinutes, 0);

    res.json({
      date: dateStr,
      summary: {
        onlineNow,
        driversOnShift: drivers.length,
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      },
      drivers,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/export", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform, status, companyId } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;

    const drivers = await prisma.driver.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: "desc" },
      include: { company: { select: { name: true } } },
    });

    const rows = drivers.map((d) => ({
      Name: d.name,
      Platform: d.platform,
      "Platform ID": d.platformDriverId || "",
      Status: d.status,
      Phone: d.phone || "",
      Zone: d.zone || "",
      "Vehicle Type": d.vehicleType || "",
      Company: d.company?.name || "",
      "Hire Date": d.hireDate ? new Date(d.hireDate).toLocaleDateString() : "",
    }));

    sendXlsx(res, rows, "Drivers", "drivers-report.xlsx");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const driverId = req.params.id;

    // Verify driver belongs to tenant
    const driver = await prisma.driver.findFirst({
      where: { id: driverId, tenantId },
    });
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [sessionsThisMonth, sessionStats, pendingCash, violationEvents, keetaMetrics, keetaSessionCount] = await Promise.all([
      // Sessions this month
      prisma.talabatSession.count({
        where: { driverId, tenantId, date: { gte: startOfMonth } },
      }),
      // Avg deliveries per day (from sessions this month)
      prisma.talabatSession.aggregate({
        where: { driverId, tenantId, date: { gte: startOfMonth } },
        _sum: { deliveries: true },
        _count: { id: true },
      }),
      // Pending dues from cash records
      prisma.cashRecord.aggregate({
        where: { driverId, tenantId, status: "PENDING" },
        _sum: { pendingDues: true },
      }),
      // Violation events count (unresolved)
      prisma.talabatViolationEvent.count({
        where: { driverId, tenantId, resolved: false },
      }),
      // Keeta rates + deliveries this month
      prisma.keetaDailyMetrics.findMany({
        where: { driverId, tenantId, date: { gte: startOfMonth } },
        select: { onTimeRate: true, completionRate: true, deliveredTasks: true, validDay: true },
      }),
      prisma.keetaDailyMetrics.count({
        where: { driverId, tenantId, date: { gte: startOfMonth }, validDay: true },
      }),
    ]);

    const isKeeta = driver.platform === "KEETA";
    let avgDeliveriesPerDay: number;
    let sessionsCount: number;
    if (isKeeta) {
      sessionsCount = keetaSessionCount;
      const totalK = keetaMetrics.reduce((a, m) => a + (m.deliveredTasks || 0), 0);
      avgDeliveriesPerDay = keetaSessionCount > 0 ? totalK / keetaSessionCount : 0;
    } else {
      sessionsCount = sessionsThisMonth;
      const totalDeliveries = sessionStats._sum.deliveries || 0;
      const divisor = sessionStats._count.id || 1;
      avgDeliveriesPerDay = totalDeliveries / divisor;
    }
    const pendingDuesKd = Number(pendingCash._sum.pendingDues || 0);

    const onTimeVals = keetaMetrics.map(m => m.onTimeRate != null ? Number(m.onTimeRate) : null).filter((v): v is number => v != null);
    const completionVals = keetaMetrics.map(m => m.completionRate != null ? Number(m.completionRate) : null).filter((v): v is number => v != null);
    const onTimeRate = onTimeVals.length > 0 ? onTimeVals.reduce((a, b) => a + b, 0) / onTimeVals.length : null;
    const completionRate = completionVals.length > 0 ? completionVals.reduce((a, b) => a + b, 0) / completionVals.length : null;

    res.json({
      sessionsThisMonth: sessionsCount,
      avgDeliveriesPerDay,
      pendingDuesKd,
      violationEvents,
      onTimeRate,
      completionRate,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * R3 · Driver 360 aggregator.
 * GET /api/drivers/:id/profile?platform=TALABAT|KEETA
 *
 * Composes the tabs Driver 360 needs in a single round-trip:
 *   { overview, attendance, orders, performance, cash, violations, assets, documents }
 */
router.get("/:id/profile", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const driver = await prisma.driver.findFirst({
      where: { id, tenantId },
      include: {
        company: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
        device: { select: { id: true, imei: true, model: true, lastSeen: true, isOnline: true } },
        assignedVehicle: { select: { id: true, plateNumber: true, vehicleType: true, status: true } },
      },
    });
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      todayOrders,
      weekOrders,
      recentAttendance,
      recentLeaves,
      pendingCash,
      cashMonth,
      recentViolations,
      activeRestrictions,
      talabatMetrics,
      keetaMetrics,
      deliverooMetrics,
      americanaMonthly,
      activeSession,
    ] = await Promise.all([
      prisma.orderLog.aggregate({
        where: { tenantId, driverId: id, date: { gte: todayStart } },
        _sum: { orderCount: true, cashCollected: true, tips: true },
      }),
      prisma.orderLog.aggregate({
        where: { tenantId, driverId: id, date: { gte: weekStart } },
        _sum: { orderCount: true, cashCollected: true, tips: true },
      }),
      prisma.attendanceRecord.findMany({
        where: { tenantId, driverId: id, date: { gte: monthStart } },
        select: { id: true, date: true, status: true, lateMinutes: true },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.leaveRequest.findMany({
        where: { tenantId, driverId: id },
        select: { id: true, startDate: true, endDate: true, status: true, reason: true },
        orderBy: { startDate: "desc" },
        take: 10,
      }),
      prisma.cashRecord.aggregate({
        where: { tenantId, driverId: id, status: "PENDING" },
        _sum: { pendingDues: true },
      }),
      prisma.cashRecord.findMany({
        where: { tenantId, driverId: id, date: { gte: monthStart } },
        select: { id: true, date: true, salesAmount: true, collectionAmount: true, pendingDues: true, status: true },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.violation.findMany({
        where: { tenantId, driverId: id },
        select: { id: true, violationType: true, violationStatus: true, appealStatus: true, violationTime: true, details: true },
        orderBy: { violationTime: "desc" },
        take: 20,
      }),
      prisma.driverRestriction.findMany({
        where: { tenantId, driverId: id, OR: [{ endDate: null }, { endDate: { gte: now } }] },
        select: { id: true, type: true, startDate: true, endDate: true, reason: true },
      }),
      driver.platform === "TALABAT"
        ? prisma.talabatDailyMetrics.findMany({
            where: { tenantId, driverId: id },
            orderBy: { shiftDate: "desc" },
          })
        : Promise.resolve([]),
      driver.platform === "KEETA"
        ? prisma.keetaDailyMetrics.findMany({
            where: { tenantId, driverId: id },
            orderBy: { date: "desc" },
          })
        : Promise.resolve([]),
      driver.platform === "DELIVEROO"
        ? prisma.deliverooDailyMetrics.findMany({
            where: { tenantId, driverId: id },
            orderBy: { shiftDate: "desc" },
          })
        : Promise.resolve([]),
      driver.platform === "AMERICANA"
        ? prisma.americanaDailyOrders.findMany({
            where: { tenantId, driverId: id },
            orderBy: { month: "desc" },
            include: {
              storeRef: { select: { id: true, name: true, chain: { select: { name: true } } } },
            },
          })
        : Promise.resolve([]),
      prisma.courierOnlineSession.findFirst({
        where: { tenantId, driverId: id, isOnline: true },
        select: { id: true, startTime: true, lastGpsAt: true, area: true },
      }),
    ]);

    // Overview tab — UTR (last 7 days) computed from in-memory metrics
    const talabatWeekly = talabatMetrics.filter((m: any) => new Date(m.shiftDate) >= weekStart);
    const keetaWeekly = keetaMetrics.filter((m: any) => new Date(m.date) >= weekStart);
    const deliverooWeekly = deliverooMetrics.filter((m: any) => new Date(m.shiftDate) >= weekStart);

    // Americana — flatten monthly daily order JSON into per-day rows.
    const americanaDaily: Array<{
      id: string;
      date: string;
      orders: number;
      chainName: string | null;
      storeName: string | null;
      position: string | null;
    }> = [];
    let americanaTodayOrders = 0;
    let americanaWeekOrders = 0;
    if (driver.platform === "AMERICANA") {
      const todayKey = todayStart.toISOString().slice(0, 10);
      for (const m of americanaMonthly as any[]) {
        const monthDate: Date = m.month;
        const y = monthDate.getUTCFullYear();
        const mo = monthDate.getUTCMonth();
        const days = m.dailyOrders as Record<string, number> | null;
        if (!days || typeof days !== "object") continue;
        for (const [dayKey, val] of Object.entries(days)) {
          const d = parseInt(dayKey, 10);
          if (!Number.isFinite(d) || d < 1 || d > 31) continue;
          const orders = Number(val) || 0;
          if (orders === 0) continue;
          const dateObj = new Date(Date.UTC(y, mo, d));
          const iso = dateObj.toISOString().slice(0, 10);
          americanaDaily.push({
            id: `${m.id}-${dayKey}`,
            date: iso,
            orders,
            chainName: m.storeRef?.chain?.name ?? m.chain ?? null,
            storeName: m.storeRef?.name ?? m.storeName ?? null,
            position: m.position ?? null,
          });
          if (iso === todayKey) americanaTodayOrders += orders;
          if (dateObj >= weekStart) americanaWeekOrders += orders;
        }
      }
      americanaDaily.sort((a, b) => (a.date < b.date ? 1 : -1));
    }
    const utrThisWeek =
      driver.platform === "TALABAT" && talabatWeekly.length > 0
        ? (talabatWeekly.reduce((s, m) => s + (m.utr ?? 0), 0) / talabatWeekly.length)
        : driver.platform === "KEETA" && keetaWeekly.length > 0
          ? keetaWeekly.reduce((s, m) => s + Number(m.completionRate ?? 0), 0) / keetaWeekly.length
          : driver.platform === "DELIVEROO" && deliverooWeekly.length > 0
            ? (() => {
                const totals = deliverooWeekly.reduce(
                  (acc: { d: number; h: number }, m: any) => {
                    const buckets = Array.isArray(m.hourlyBuckets)
                      ? (m.hourlyBuckets as number[])
                      : [];
                    acc.d += m.deliveriesCount ?? 0;
                    acc.h += buckets.reduce(
                      (s: number, v: any) => s + (Number(v) > 0 ? 2 : 0),
                      0
                    );
                    return acc;
                  },
                  { d: 0, h: 0 }
                );
                return totals.h > 0 ? totals.d / totals.h : null;
              })()
            : null;

    const overview = {
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        zone: driver.zone,
        batchNumber: driver.batchNumber,
        platform: driver.platform,
        status: driver.status,
        vehicleType: driver.vehicleType,
        company: driver.company?.name ?? null,
        supervisor: driver.supervisor?.name ?? null,
        performanceTier: (driver as any).performanceTier ?? null,
        photoUrl: driver.photoUrl,
      },
      todayOrders:
        driver.platform === "AMERICANA"
          ? americanaTodayOrders
          : todayOrders._sum.orderCount ?? 0,
      todayCash: Number(todayOrders._sum.cashCollected ?? 0),
      todayTips: Number(todayOrders._sum.tips ?? 0),
      weekOrders:
        driver.platform === "AMERICANA"
          ? americanaWeekOrders
          : weekOrders._sum.orderCount ?? 0,
      weekCash: Number(weekOrders._sum.cashCollected ?? 0),
      utrThisWeek: utrThisWeek != null ? Math.round(utrThisWeek * 100) / 100 : null,
      activeSession,
    };

    // Documents — pull expiry fields off driver
    const documents = {
      healthCert: { expiry: driver.healthCertExpiry, status: driver.healthCertStatus },
      workPermit: { expiry: driver.workPermitExpiry, status: driver.workPermitStatus },
      foodHandling: { expiry: driver.foodHandlingCertExpiry, status: driver.foodHandlingCertStatus },
      vehicleReg: { expiry: driver.vehicleRegExpiry, status: driver.vehicleRegStatus },
      vehicleInsurance: { expiry: driver.vehicleInsuranceExpiry, status: driver.vehicleInsuranceStatus },
      drivingLicense: { expiry: driver.drivingLicenseExpiry, status: driver.drivingLicenseStatus },
      civilId: { expiry: driver.civilIdExpiry, status: driver.civilIdStatus },
    };

    res.json({
      overview,
      attendance: {
        records: recentAttendance,
        leaves: recentLeaves,
      },
      orders: {
        todayCount: todayOrders._sum.orderCount ?? 0,
        weekCount: weekOrders._sum.orderCount ?? 0,
      },
      performance: {
        talabatMetrics,
        keetaMetrics,
        deliverooMetrics,
        americanaDaily,
      },
      cash: {
        pendingDues: Number(pendingCash._sum.pendingDues ?? 0),
        records: cashMonth,
      },
      violations: {
        items: recentViolations,
        activeRestrictions,
      },
      assets: {
        device: driver.device,
        vehicle: driver.assignedVehicle,
      },
      documents,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Phase 3 Wave 1 — REQ-driver-file.
 *
 * GET /api/drivers/:id/file
 *
 * Single round-trip bulk endpoint for the canonical Driver File page. Returns
 * a 10-key body the frontend renders across the 8 required sections. Tenant-
 * scoped; cross-tenant requests return 404 (Pitfall 4 / T-03-01).
 *
 * Performance budget: server-time p50 < 300ms on the 8-driver design-partner-1
 * fixture (asserted by driversFile.perf.test.ts). The 8 reads run in parallel.
 */
router.get("/:id/file", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const driver = await prisma.driver.findFirst({
      where: { id, tenantId },
      include: {
        company: { select: { id: true, name: true, platform: true } },
        supervisor: { select: { id: true, name: true, phone: true, email: true } },
        device: {
          select: {
            // `Device.id` is deliberately NOT here. It is the bearer token the
            // driver-agent API authenticates with (routes/agent.ts), so
            // returning it on a staff read handed every authenticated role —
            // including CASH_COLLECTOR and VIEWER — the ability to act as any
            // driver: accept offers, mark orders delivered, move cash.
            imei: true,
            model: true,
            osVersion: true,
            agentVersion: true,
            lastSeen: true,
            batteryLevel: true,
            isOnline: true,
            status: true,
            lastLatitude: true,
            lastLongitude: true,
            sims: { select: { id: true, phoneNumber: true, carrier: true, status: true } },
          },
        },
        assignedVehicle: {
          select: {
            id: true,
            plateNumber: true,
            vehicleType: true,
            make: true,
            model: true,
            year: true,
            color: true,
            mileage: true,
            status: true,
            insuranceExpiry: true,
            registrationExpiry: true,
          },
        },
        inventory: {
          select: { id: true, itemType: true, issued: true, quantity: true, issuedDate: true, returnedDate: true },
          orderBy: { itemType: "asc" },
        },
      },
    });
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 86_400_000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000);

    const [
      batchHistory,
      latestScore,
      snapshots90d,
      attendance,
      shifts,
      recentOrders,
      todayOrders,
      weekOrders,
      cashRecords,
      pendingCash,
      recentViolations,
      penalties,
      appeals,
      restrictions,
      tickets,
      vehicleInspections,
      maintenanceRecords,
      activeSession,
      agentNotes,
      decisionAuditLog,
    ] = await Promise.all([
      prisma.driverBatchHistory.findMany({
        where: { tenantId, driverId: id },
        orderBy: { changedAt: "desc" },
        take: 50,
        select: { id: true, batchNumber: true, changedAt: true, changedBy: true },
      }),
      prisma.aiScore.findFirst({
        where: { tenantId, driverId: id },
        orderBy: { date: "desc" },
        select: {
          compositeScore: true,
          attendanceScore: true,
          deliveryScore: true,
          financialScore: true,
          equipmentScore: true,
          platformScore: true,
          trend: true,
          date: true,
        },
      }),
      listSnapshotsForDriver(tenantId, id, 90),
      prisma.attendanceRecord.findMany({
        where: { tenantId, driverId: id, date: { gte: twoWeeksAgo } },
        select: { id: true, date: true, status: true, lateMinutes: true },
        orderBy: { date: "desc" },
        take: 14,
      }),
      prisma.shift.findMany({
        where: { tenantId, driverId: id },
        select: {
          id: true,
          date: true,
          platform: true,
          zone: true,
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
          actualEnd: true,
          status: true,
          plannedHoursMinutes: true,
          actualHoursMinutes: true,
          deliveryArea: true,
        },
        orderBy: { scheduledStart: "desc" },
        take: 12,
      }),
      prisma.orderLog.findMany({
        where: { tenantId, driverId: id },
        select: {
          id: true,
          date: true,
          platform: true,
          orderCount: true,
          cashCollected: true,
          tips: true,
          totalAmount: true,
          restaurantName: true,
          arrivalTime: true,
          orderNumber: true,
          paymentSource: true,
          source: true,
        },
        orderBy: { date: "desc" },
        take: 14,
      }),
      prisma.orderLog.aggregate({
        where: { tenantId, driverId: id, date: { gte: todayStart } },
        _sum: { orderCount: true, cashCollected: true },
      }),
      prisma.orderLog.aggregate({
        where: { tenantId, driverId: id, date: { gte: weekStart } },
        _sum: { orderCount: true, cashCollected: true },
      }),
      prisma.cashRecord.findMany({
        where: { tenantId, driverId: id, date: { gte: monthStart } },
        select: { id: true, date: true, salesAmount: true, collectionAmount: true, pendingDues: true, status: true },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.cashRecord.aggregate({
        where: { tenantId, driverId: id, status: "PENDING" },
        _sum: { pendingDues: true },
      }),
      prisma.violation.findMany({
        where: { tenantId, driverId: id },
        select: { id: true, violationType: true, violationStatus: true, appealStatus: true, violationTime: true, details: true },
        orderBy: { violationTime: "desc" },
        take: 20,
      }),
      prisma.penalty.findMany({
        where: { tenantId, driverId: id },
        select: { id: true, penaltyType: true, penaltyStatus: true, penaltyValue: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.appeal.findMany({
        where: { tenantId, violation: { driverId: id } },
        select: {
          id: true,
          appealLevel: true,
          appealStatus: true,
          channel: true,
          reason: true,
          rejectionNote: true,
          appealedAt: true,
          reviewedAt: true,
          violation: { select: { id: true, violationType: true, violationTime: true } },
        },
        orderBy: { appealedAt: "desc" },
        take: 12,
      }),
      prisma.driverRestriction.findMany({
        where: { tenantId, driverId: id },
        select: { id: true, type: true, startDate: true, endDate: true, reason: true, processedAt: true },
        orderBy: { startDate: "desc" },
        take: 10,
      }),
      prisma.ticket.findMany({
        where: { tenantId, OR: [{ driverId: id }, { submitterDriverId: id }] },
        select: { id: true, ticketNumber: true, category: true, priority: true, title: true, status: true, createdAt: true, slaDeadline: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.vehicleInspection.findMany({
        where: { tenantId, driverId: id },
        select: { id: true, date: true, status: true, notes: true, deductionApplied: true },
        orderBy: { date: "desc" },
        take: 6,
      }),
      prisma.maintenanceRecord.findMany({
        where: { tenantId, driverId: id },
        select: { id: true, category: true, type: true, cost: true, vendor: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.courierOnlineSession.findFirst({
        where: { tenantId, driverId: id, isOnline: true },
        orderBy: { startTime: "desc" },
        select: { id: true, startTime: true, lastGpsAt: true, area: true },
      }).catch(() => null),
      listMemoriesByPrefix(tenantId, `note:driver:${id}:`, 50),
      loadDriverAuditLog(tenantId, id),
    ]);

    // Score explanation — only call the explainer when we have a score.
    let scoreExplanation: { text: string; cached: boolean };
    if (!latestScore) {
      scoreExplanation = { text: "Score not yet available.", cached: false };
    } else {
      scoreExplanation = await explainScore({
        tenantId,
        driverId: id,
        scoreDate: latestScore.date.toISOString().slice(0, 10),
        score: {
          compositeScore: Number(latestScore.compositeScore ?? 0),
          attendanceScore: Number(latestScore.attendanceScore ?? 0),
          deliveryScore: Number(latestScore.deliveryScore ?? 0),
          financialScore: Number(latestScore.financialScore ?? 0),
          equipmentScore: Number(latestScore.equipmentScore ?? 0),
          platformScore: Number(latestScore.platformScore ?? 0),
          trend: (latestScore.trend as "UP" | "DOWN" | "STABLE") ?? "STABLE",
        },
        recentShifts: [],
        recentViolations: recentViolations.slice(0, 10).map((v) => ({
          id: v.id,
          type: String(v.violationType),
          time: v.violationTime?.toISOString() ?? "",
        })),
      });
    }

    res.json({
      profile: {
        id: driver.id,
        name: driver.name,
        civilIdMasked: null, // civil ID number is not stored; only expiry + status
        civilIdStatus: driver.civilIdStatus,
        civilIdExpiry: toIso(driver.civilIdExpiry),
        photoUrl: driver.photoUrl,
        status: driver.status,
        platform: driver.platform,
        platformDriverId: driver.platformDriverId,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        company: driver.company ? { id: driver.company.id, name: driver.company.name, platform: driver.company.platform } : null,
        supervisor: driver.supervisor ? { id: driver.supervisor.id, name: driver.supervisor.name, phone: driver.supervisor.phone, email: driver.supervisor.email } : null,
        zone: driver.zone,
        batchNumber: driver.batchNumber,
        hireDate: toIso(driver.hireDate),
        monthlySalary: driver.monthlySalary ?? null,
        performanceTier: driver.performanceTier ?? null,
      },
      batchHistory: batchHistory.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        changedAt: toIso(b.changedAt) ?? "",
        changedBy: b.changedBy,
      })),
      liveStatus: {
        onlineNow: !!activeSession || !!driver.device?.isOnline,
        lastSeenAt: toIso(activeSession?.lastGpsAt ?? driver.device?.lastSeen ?? null),
        activeShift: activeSession
          ? { id: activeSession.id, startsAt: toIso(activeSession.startTime), area: activeSession.area }
          : null,
        area: activeSession?.area ?? driver.zone ?? null,
        device: driver.device
          ? {
              // No `id`: it is the driver-agent bearer token, not a handle.
              model: driver.device.model,
              osVersion: driver.device.osVersion,
              agentVersion: driver.device.agentVersion,
              batteryLevel: driver.device.batteryLevel,
              status: driver.device.status,
              isOnline: driver.device.isOnline,
              lastSeen: toIso(driver.device.lastSeen),
              latitude: driver.device.lastLatitude == null ? null : toNumber(driver.device.lastLatitude),
              longitude: driver.device.lastLongitude == null ? null : toNumber(driver.device.lastLongitude),
            }
          : null,
      },
      score: latestScore
        ? {
            compositeScore: latestScore.compositeScore,
            attendanceScore: latestScore.attendanceScore,
            deliveryScore: latestScore.deliveryScore,
            financialScore: latestScore.financialScore,
            equipmentScore: latestScore.equipmentScore,
            platformScore: latestScore.platformScore,
            trend: latestScore.trend,
            date: toIso(latestScore.date),
          }
        : null,
      scoreExplanation,
      snapshots90d: (snapshots90d ?? []).map((s: any) => ({
        snapshotDate: toIso(s.snapshotDate) ?? "",
        compositeScore: toNumber(s.compositeScore),
        attendanceScore: toNumber(s.attendanceScore),
        deliveryScore: toNumber(s.deliveryScore),
        financialScore: toNumber(s.financialScore),
        equipmentScore: toNumber(s.equipmentScore),
        platformScore: toNumber(s.platformScore),
        ordersCount: toNumber(s.ordersCount),
        shiftsCount: toNumber(s.shiftsCount),
        violationsCount: toNumber(s.violationsCount),
        cashOutstandingKd: toNumber(s.cashOutstandingKd),
      })),
      attendance: {
        last14Days: attendance.map((a) => ({
          ...a,
          date: toIso(a.date) ?? "",
        })),
        lateCount: attendance.filter((a) => a.status === "LATE").length,
        absentCount: attendance.filter((a) => a.status === "ABSENT").length,
      },
      shifts: {
        recent: shifts.map((shift) => ({
          ...shift,
          date: toIso(shift.date) ?? "",
          scheduledStart: toIso(shift.scheduledStart),
          scheduledEnd: toIso(shift.scheduledEnd),
          actualStart: toIso(shift.actualStart),
          actualEnd: toIso(shift.actualEnd),
        })),
      },
      orders: {
        todayCount: toNumber(todayOrders._sum.orderCount),
        todayCash: toNumber(todayOrders._sum.cashCollected),
        weekCount: toNumber(weekOrders._sum.orderCount),
        weekCash: toNumber(weekOrders._sum.cashCollected),
        recent: recentOrders.map((order) => ({
          ...order,
          date: toIso(order.date) ?? "",
          arrivalTime: toIso(order.arrivalTime),
          cashCollected: toNumber(order.cashCollected),
          tips: toNumber(order.tips),
          totalAmount: toNumber(order.totalAmount),
        })),
      },
      cash: {
        outstanding: Number(pendingCash._sum.pendingDues ?? 0),
        records: cashRecords.map((record) => ({
          ...record,
          date: toIso(record.date) ?? "",
          salesAmount: toNumber(record.salesAmount),
          collectionAmount: toNumber(record.collectionAmount),
          pendingDues: toNumber(record.pendingDues),
        })),
      },
      violations: {
        items: recentViolations.map((violation) => ({
          ...violation,
          violationTime: toIso(violation.violationTime) ?? "",
        })),
        penalties: penalties.map((penalty) => ({ ...penalty, createdAt: toIso(penalty.createdAt) ?? "" })),
        appeals: appeals.map((appeal) => ({
          ...appeal,
          appealedAt: toIso(appeal.appealedAt) ?? "",
          reviewedAt: toIso(appeal.reviewedAt),
          violation: {
            ...appeal.violation,
            violationTime: toIso(appeal.violation.violationTime) ?? "",
          },
        })),
        restrictions: restrictions.map((restriction) => ({
          ...restriction,
          startDate: toIso(restriction.startDate) ?? "",
          endDate: toIso(restriction.endDate),
          processedAt: toIso(restriction.processedAt),
          active: !restriction.endDate || restriction.endDate >= now,
        })),
      },
      documents: [
        { key: "civilId", label: "Civil ID", status: driver.civilIdStatus, expiry: toIso(driver.civilIdExpiry) },
        { key: "healthCert", label: "Health certificate", status: driver.healthCertStatus, expiry: toIso(driver.healthCertExpiry) },
        { key: "workPermit", label: "Work permit", status: driver.workPermitStatus, expiry: toIso(driver.workPermitExpiry) },
        { key: "foodHandling", label: "Food handling", status: driver.foodHandlingCertStatus, expiry: toIso(driver.foodHandlingCertExpiry) },
        { key: "vehicleReg", label: "Vehicle registration", status: driver.vehicleRegStatus, expiry: toIso(driver.vehicleRegExpiry) },
        { key: "vehicleInsurance", label: "Vehicle insurance", status: driver.vehicleInsuranceStatus, expiry: toIso(driver.vehicleInsuranceExpiry) },
        { key: "drivingLicense", label: "Driving license", status: driver.drivingLicenseStatus, expiry: toIso(driver.drivingLicenseExpiry) },
      ],
      assets: {
        vehicle: driver.assignedVehicle
          ? {
              ...driver.assignedVehicle,
              insuranceExpiry: toIso(driver.assignedVehicle.insuranceExpiry),
              registrationExpiry: toIso(driver.assignedVehicle.registrationExpiry),
            }
          : null,
        device: driver.device
          ? {
              // No `id`: it is the driver-agent bearer token, not a handle.
              imei: driver.device.imei,
              model: driver.device.model,
              osVersion: driver.device.osVersion,
              agentVersion: driver.device.agentVersion,
              lastSeen: toIso(driver.device.lastSeen),
              batteryLevel: driver.device.batteryLevel,
              isOnline: driver.device.isOnline,
              status: driver.device.status,
              latitude: driver.device.lastLatitude == null ? null : toNumber(driver.device.lastLatitude),
              longitude: driver.device.lastLongitude == null ? null : toNumber(driver.device.lastLongitude),
            }
          : null,
        sim: driver.device?.sims?.[0] ?? null,
        inventory: driver.inventory.map((item) => ({
          ...item,
          issuedDate: toIso(item.issuedDate),
          returnedDate: toIso(item.returnedDate),
        })),
        inspections: vehicleInspections.map((inspection) => ({
          ...inspection,
          date: toIso(inspection.date) ?? "",
        })),
        maintenance: maintenanceRecords.map((record) => ({
          ...record,
          createdAt: toIso(record.createdAt) ?? "",
          cost: toNumber(record.cost),
        })),
      },
      tickets: tickets.map((ticket) => ({
        ...ticket,
        createdAt: toIso(ticket.createdAt) ?? "",
        slaDeadline: toIso(ticket.slaDeadline),
      })),
      agentNotes: {
        proposals: decisionAuditLog.pending,
        observations: agentNotes,
        audit: decisionAuditLog.approved,
      },
      decisionAuditLog,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/drivers/:id/score-explanation?refresh=0|1
 *
 * Phase 3 Wave 4 — standalone endpoint for the AskDarbWhyDrawer Refresh
 * button. Reuses Wave 1's explainScore service. ?refresh=1 forces a cache
 * miss; ?refresh=0 (default) honors the 1h AgentMemory cache.
 *
 * Tenant-scoped via the existing router-level middleware. 404 on cross-tenant
 * — same Pitfall 4 mitigation as /file.
 */
router.get("/:id/score-explanation", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const refresh = req.query.refresh === "1";

    const driver = await prisma.driver.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true },
    });
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const latestScore = await prisma.aiScore.findFirst({
      where: { tenantId, driverId: id },
      orderBy: { date: "desc" },
    });
    if (!latestScore) {
      return res.json({
        text: "Score not yet available — the daily snapshot worker has not yet run for this driver.",
        cached: false,
      });
    }

    const recentViolations = await prisma.violation.findMany({
      where: { tenantId, driverId: id },
      orderBy: { violationTime: "desc" },
      take: 10,
      select: { id: true, violationType: true, violationTime: true },
    });

    const explained = await explainScore({
      tenantId,
      driverId: id,
      scoreDate: latestScore.date.toISOString().slice(0, 10),
      score: {
        compositeScore: Number(latestScore.compositeScore ?? 0),
        attendanceScore: Number(latestScore.attendanceScore ?? 0),
        deliveryScore: Number(latestScore.deliveryScore ?? 0),
        financialScore: Number(latestScore.financialScore ?? 0),
        equipmentScore: Number(latestScore.equipmentScore ?? 0),
        platformScore: Number(latestScore.platformScore ?? 0),
        trend: (latestScore.trend as "UP" | "DOWN" | "STABLE") ?? "STABLE",
      },
      recentShifts: [],
      recentViolations: recentViolations.map((v) => ({
        id: v.id,
        type: String(v.violationType),
        time: v.violationTime?.toISOString() ?? "",
      })),
      forceRefresh: refresh,
    });

    return res.json(explained);
  } catch (err: unknown) {
    const message = (err as Error)?.message ?? "Internal error";
    console.error("[driverFile] /:id/score-explanation failed:", message);
    res.status(500).json({ error: message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const driver = await prisma.driver.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        company: true,
        inventory: true,
        supervisor: { select: { id: true, name: true } },
        assignedVehicle: true,
      },
    });
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
    res.json(driver);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", rbac(...MUTATORS), validateBody(createDriverSchema.passthrough()), async (req: Request, res: Response) => {
  try {
    const { inventory, ...driverData } = req.body;

    const driver = await prisma.$transaction(async (tx) => {
      const created = await tx.driver.create({
        data: { ...driverData, tenantId: req.user!.tenantId },
      });

      if (inventory && Array.isArray(inventory) && inventory.length > 0) {
        await tx.driverInventory.createMany({
          data: inventory.map((item: { itemType: string; issued: boolean; quantity: number }) => ({
            driverId: created.id,
            itemType: item.itemType as any,
            issued: item.issued,
            quantity: item.quantity || 0,
            issuedDate: item.issued ? new Date() : null,
          })),
        });
      }

      return tx.driver.findUnique({
        where: { id: created.id },
        include: { inventory: true },
      });
    });

    res.status(201).json(driver);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const allowed = [
      "companyId", "name", "phone", "platform", "platformDriverId", "utr",
      "vehicleType", "zone", "batchNumber", "status", "hireDate", "photoUrl",
      "supervisorId", "monthlySalary",
      "healthCertExpiry", "healthCertStatus",
      "workPermitExpiry", "workPermitStatus",
      "foodHandlingCertExpiry", "foodHandlingCertStatus",
      "vehicleRegExpiry", "vehicleRegStatus",
      "vehicleInsuranceExpiry", "vehicleInsuranceStatus",
      "drivingLicenseExpiry", "drivingLicenseStatus",
      "civilIdExpiry", "civilIdStatus",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const tenantId = req.user!.tenantId;
    const existing = await prisma.driver.findFirst({
      where: { id: req.params.id, tenantId },
      select: { batchNumber: true },
    });
    if (!existing) { res.status(404).json({ error: "Driver not found" }); return; }

    const updated = await prisma.driver.update({
      where: { id: req.params.id },
      data,
    });

    // Record batch changes so the driver file can show the weekly batch timeline.
    if ("batchNumber" in data && (data.batchNumber ?? null) !== (existing.batchNumber ?? null)) {
      await prisma.driverBatchHistory.create({
        data: {
          tenantId,
          driverId: req.params.id,
          batchNumber: (data.batchNumber as string | null) ?? null,
          changedBy: req.user!.userId,
        },
      });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", rbac(...DESTRUCTIVE), async (req: Request, res: Response) => {
  try {
    await prisma.driver.deleteMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    res.json({ message: "Driver deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
