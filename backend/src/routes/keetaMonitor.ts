import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";

const router = Router();
router.use(authMiddleware, tenantScope);

/**
 * @swagger
 * /api/keeta/monitor/couriers:
 *   get:
 *     tags: [Keeta Monitor]
 *     summary: List all active Keeta couriers with real-time status, GPS, and today's metrics
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Filter by courier name
 *       - in: query
 *         name: zone
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [working, idle, offline] }
 *     responses:
 *       200:
 *         description: Courier list with status breakdown summary (total, working, idle, offline)
 */
router.get("/couriers", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { search, zone, status } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all active Keeta drivers with device + shift + metrics for today
    const driverWhere: any = { tenantId, platform: "KEETA", status: "ACTIVE" };
    if (search) driverWhere.name = { contains: search as string, mode: "insensitive" };
    if (zone) driverWhere.zone = zone as string;

    const drivers = await prisma.driver.findMany({
      where: driverWhere,
      select: {
        id: true,
        name: true,
        phone: true,
        platformDriverId: true,
        vehicleType: true,
        zone: true,
        device: {
          select: {
            id: true,
            isOnline: true,
            lastSeen: true,
            lastLatitude: true,
            lastLongitude: true,
            batteryLevel: true,
          },
        },
        shifts: {
          where: { date: { gte: today }, platform: "KEETA" },
          orderBy: { scheduledStart: "asc" },
          select: {
            id: true,
            zone: true,
            scheduledStart: true,
            scheduledEnd: true,
            actualStart: true,
            actualEnd: true,
            status: true,
          },
        },
        keetaDailyMetrics: {
          where: { date: { gte: today } },
          select: {
            deliveredTasks: true,
            cancelledTasks: true,
            rejectedTasks: true,
            rejectedByCourier: true,
            onlineTime: true,
            acceptedTasks: true,
          },
          take: 1,
        },
      },
    });

    const couriers = drivers.map((d) => {
      const device = d.device;
      const todayShifts = d.shifts;
      const metrics = d.keetaDailyMetrics[0];
      const isOnline = device?.isOnline ?? false;
      const lastGpsAt = device?.lastSeen ?? null;
      const flightMode = isOnline && lastGpsAt && Date.now() - new Date(lastGpsAt).getTime() > 10 * 60 * 1000;

      let courierStatus: "working" | "idle" | "offline" = "offline";
      if (isOnline && metrics && metrics.acceptedTasks > 0) courierStatus = "working";
      else if (isOnline) courierStatus = "idle";

      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        platformDriverId: d.platformDriverId,
        vehicleType: d.vehicleType,
        zone: d.zone,
        status: courierStatus,
        isOnline,
        onlineMinutes: metrics?.onlineTime ?? 0,
        completedOrders: metrics?.deliveredTasks ?? 0,
        cancelledOrders: metrics?.cancelledTasks ?? 0,
        rejectedOrders: metrics?.rejectedTasks ?? 0,
        lastGps: device ? {
          lat: device.lastLatitude ? Number(device.lastLatitude) : null,
          lng: device.lastLongitude ? Number(device.lastLongitude) : null,
          at: device.lastSeen,
        } : null,
        batteryLevel: device?.batteryLevel ?? null,
        flightMode: !!flightMode,
        shifts: todayShifts,
      };
    });

    // Filter by status if requested
    const filtered = status
      ? couriers.filter((c) => c.status === status)
      : couriers;

    const working = couriers.filter((c) => c.status === "working").length;
    const idle = couriers.filter((c) => c.status === "idle").length;
    const offline = couriers.filter((c) => c.status === "offline").length;

    res.json({
      couriers: filtered,
      summary: { total: couriers.length, working, idle, offline },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/keeta/monitor/alerts:
 *   get:
 *     tags: [Keeta Monitor]
 *     summary: Get irregular courier alerts (scheduled-not-online, GPS failures, order rejections)
 *     responses:
 *       200:
 *         description: Three alert categories each with count and driver list
 */
// Haversine (metres) — mirrors helper in violationEngine.ts
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get("/alerts", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

    // 1. Scheduled not online: shifts today where driver's device is offline or missing
    const scheduledNotOnline = await prisma.shift.findMany({
      where: {
        tenantId,
        platform: "KEETA",
        date: { gte: today },
        status: "BOOKED",
        driver: { OR: [{ device: { isOnline: false } }, { device: { is: null } }] },
      },
      select: {
        id: true,
        zone: true,
        scheduledStart: true,
        driver: { select: { id: true, name: true, platformDriverId: true } },
      },
    });

    // 2. GPS stale: online drivers with lastSeen > 10 min ago
    const gpsStale = await prisma.device.findMany({
      where: {
        tenantId,
        driver: { tenantId, platform: "KEETA", status: "ACTIVE" },
        isOnline: true,
        lastSeen: { lt: tenMinAgo },
      },
      select: {
        lastSeen: true,
        driver: { select: { id: true, name: true, platformDriverId: true } },
      },
    });

    // 3. Order rejections ×3
    const orderRejections = await prisma.keetaDailyMetrics.findMany({
      where: {
        tenantId,
        date: { gte: today },
        rejectedTasks: { gte: 3 },
      },
      select: {
        rejectedTasks: true,
        rejectedByCourier: true,
        driver: { select: { id: true, name: true, platformDriverId: true } },
      },
    });

    // 4. Flight-mode: isOnline AND last two LocationLog entries within 50 m over ≥10 min
    const activeSessions = await prisma.courierOnlineSession.findMany({
      where: { tenantId, isOnline: true, driver: { platform: "KEETA" } },
      select: { driverId: true, driver: { select: { name: true, platformDriverId: true } } },
    });

    const flightModeDrivers: Array<{
      id: string;
      name: string;
      platformDriverId: string | null;
    }> = [];
    for (const s of activeSessions) {
      const recent = await prisma.locationLog.findMany({
        where: { driverId: s.driverId, capturedAt: { gte: tenMinAgo } },
        orderBy: { capturedAt: "desc" },
        take: 5,
        select: { latitude: true, longitude: true, capturedAt: true },
      });
      if (recent.length < 2) continue;
      const first = recent[0];
      const last = recent[recent.length - 1];
      const dist = haversineMeters(
        Number(first.latitude),
        Number(first.longitude),
        Number(last.latitude),
        Number(last.longitude)
      );
      const spanMs = first.capturedAt.getTime() - last.capturedAt.getTime();
      if (dist < 50 && spanMs >= 10 * 60 * 1000) {
        flightModeDrivers.push({
          id: s.driverId,
          name: s.driver!.name,
          platformDriverId: s.driver!.platformDriverId ?? null,
        });
      }
    }

    res.json({
      scheduledNotOnline: {
        count: scheduledNotOnline.length,
        courierIds: scheduledNotOnline.map((s) => s.driver.id),
        drivers: scheduledNotOnline,
      },
      gpsStale: {
        count: gpsStale.length,
        courierIds: gpsStale.map((d) => d.driver!.id),
        drivers: gpsStale,
      },
      rejectionsX3: {
        count: orderRejections.length,
        courierIds: orderRejections.map((m) => m.driver.id),
        drivers: orderRejections,
      },
      flightMode: {
        count: flightModeDrivers.length,
        courierIds: flightModeDrivers.map((d) => d.id),
        drivers: flightModeDrivers.map((d) => ({ driver: d })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
