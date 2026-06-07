import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";

const router = Router();
router.use(authMiddleware, tenantScope);

// GET /api/dashboard/live-map
// Returns one row per active driver with their latest known location.
// Matches PRD §10 — powers the global Live Map page.
router.get("/live-map", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const platformFilter = req.query.platform as string | undefined;
    const staleMs = 15 * 60 * 1000;
    const freshSince = new Date(Date.now() - staleMs);

    const devices = await prisma.device.findMany({
      where: {
        tenantId,
        isOnline: true,
        lastLatitude: { not: null },
        lastLongitude: { not: null },
        lastSeen: { gte: freshSince },
        driver: {
          tenantId,
          status: "ACTIVE",
          ...(platformFilter ? { platform: platformFilter.toUpperCase() as any } : {}),
        },
      },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            platform: true,
            status: true,
            zone: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });

    const rows = devices
      .filter((d) => d.driver != null)
      .map((d) => ({
        driverId: d.driver!.id,
        driverName: d.driver!.name,
        platform: d.driver!.platform,
        status: d.driver!.status,
        zone: d.driver!.zone,
        company: d.driver!.company?.name ?? null,
        deviceId: d.id,
        lat: Number(d.lastLatitude),
        lng: Number(d.lastLongitude),
        lastSeen: d.lastSeen,
      }));

    res.json({ count: rows.length, drivers: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/overview
// Aggregated fleet KPIs for the global Overview page (PRD §6, §10).
router.get("/overview", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      driverPlatformCounts,
      activeDriversToday,
      todayOrders,
      pendingCash,
      latestScores,
      activeAlerts,
      weekOrdersByDay,
    ] = await Promise.all([
      prisma.driver.groupBy({
        by: ["platform"],
        where: { tenantId, status: "ACTIVE" },
        _count: { id: true },
      }),
      prisma.attendanceRecord.count({
        where: {
          tenantId,
          date: { gte: todayStart, lt: todayEnd },
          status: { in: ["PRESENT", "LATE"] },
        },
      }),
      prisma.orderLog.aggregate({
        where: { tenantId, date: { gte: todayStart, lt: todayEnd } },
        _sum: { orderCount: true, cashCollected: true, tips: true },
      }),
      prisma.cashRecord.aggregate({
        where: {
          tenantId,
          status: { in: ["PENDING", "PARTIALLY_PAID"] },
        },
        _sum: { pendingDues: true },
      }),
      prisma.aiScore.findMany({
        where: { tenantId, date: { gte: sevenDaysAgo } },
        orderBy: { date: "desc" },
        select: { driverId: true, compositeScore: true, date: true },
      }),
      prisma.alert.findMany({
        where: { tenantId, status: "ACTIVE" },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 10,
        select: {
          id: true, type: true, severity: true, title: true, message: true,
          createdAt: true,
          driver: { select: { id: true, name: true, platform: true } },
        },
      }),
      prisma.orderLog.groupBy({
        by: ["date"],
        where: { tenantId, date: { gte: sevenDaysAgo, lt: todayEnd } },
        _sum: { orderCount: true },
        orderBy: { date: "asc" },
      }),
    ]);

    // Fleet health = avg of most-recent score per driver in last 7 days
    const latestByDriver = new Map<string, number>();
    for (const s of latestScores) {
      if (!latestByDriver.has(s.driverId)) latestByDriver.set(s.driverId, Number(s.compositeScore));
    }
    const scoreValues = Array.from(latestByDriver.values());
    const fleetHealthScore = scoreValues.length
      ? Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10) / 10
      : null;

    const byPlatform: Record<string, number> = {};
    let totalDrivers = 0;
    for (const row of driverPlatformCounts) {
      byPlatform[row.platform] = row._count.id;
      totalDrivers += row._count.id;
    }

    const weekTrend = weekOrdersByDay.map((d) => ({
      date: new Date(d.date).toISOString().split("T")[0],
      orders: d._sum.orderCount || 0,
    }));

    res.json({
      drivers: {
        total: totalDrivers,
        activeToday: activeDriversToday,
        byPlatform,
      },
      ordersToday: todayOrders._sum.orderCount || 0,
      cashCollectedToday: Math.round(Number(todayOrders._sum.cashCollected || 0) * 1000) / 1000,
      tipsToday: Math.round(Number(todayOrders._sum.tips || 0) * 1000) / 1000,
      totalCashPending: Math.round(Number(pendingCash._sum.pendingDues || 0) * 1000) / 1000,
      fleetHealthScore,
      weekTrend,
      alerts: activeAlerts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
