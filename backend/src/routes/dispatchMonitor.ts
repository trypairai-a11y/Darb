// Darb 2.0 — /api/dispatch (plan §A8). Staff live-ops surface:
//   GET /positions — bootstrap snapshot for the ops live map (driver markers)
//   GET /overview  — jeopardy rail + stalled drivers + GPS-stale + zone loads
//
// Read-only; all queries tenant-scoped. Follows routes/keetaMonitor.ts
// conventions (authMiddleware + tenantScope, try/catch → { error }).

import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { haversineMeters } from "../utils/geo";
import { resolveZone } from "../services/zoneService";

const router = Router();
router.use(authMiddleware, tenantScope);

/** Order statuses that count as "active" for jeopardy/zone-load purposes. */
const ACTIVE_STATUSES = ["DISPATCHING", "ASSIGNED", "PICKED_UP"] as const;

/** availability values that mean "on shift" (everything but OFFLINE). */
const NON_OFFLINE = ["ONLINE", "BUSY"];

const GPS_STALE_DEFAULT_SEC = 180;

/** Bounds — keep the point-in-zone + LocationLog fan-out queries small. */
const MAX_SESSIONS_FOR_ZONE_RESOLUTION = 200;
const MAX_STALLED_DRIVER_CHECKS = 50;
const STALLED_SPAN_MS = 3 * 60_000;
const STALLED_MOVEMENT_METERS = 50;

type SessionRow = {
  driverId: string;
  availability: string;
  lastGpsAt: Date | null;
  lastGpsLat: unknown;
  lastGpsLng: unknown;
  startTime: Date;
  driver: { id: string; name: string; phone: string | null; vehicleType: string | null };
};

/** Latest non-offline session per driver (a driver may have stale old rows). */
function latestSessionPerDriver(sessions: SessionRow[]): SessionRow[] {
  const byDriver = new Map<string, SessionRow>();
  for (const s of sessions) {
    const current = byDriver.get(s.driverId);
    const sAt = s.lastGpsAt?.getTime() ?? s.startTime.getTime();
    const cAt = current ? (current.lastGpsAt?.getTime() ?? current.startTime.getTime()) : -1;
    if (!current || sAt > cAt) byDriver.set(s.driverId, s);
  }
  return [...byDriver.values()];
}

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * @swagger
 * /api/dispatch/positions:
 *   get:
 *     tags: [Dispatch Monitor]
 *     summary: Live driver position snapshot (bootstrap for the ops map)
 */
router.get("/positions", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const sessions = (await prisma.courierOnlineSession.findMany({
      where: { tenantId, availability: { in: NON_OFFLINE } },
      include: {
        driver: { select: { id: true, name: true, phone: true, vehicleType: true } },
      },
    })) as unknown as SessionRow[];

    const unique = latestSessionPerDriver(sessions);
    const driverIds = unique.map((s) => s.driverId);

    // Active order per driver — one grouped query, not N+1.
    const activeOrders = driverIds.length
      ? await prisma.deliveryOrder.findMany({
          where: {
            tenantId,
            driverId: { in: driverIds },
            status: { in: ["ASSIGNED", "PICKED_UP"] },
          },
          select: { id: true, driverId: true },
        })
      : [];
    const activeOrderByDriver = new Map(
      activeOrders.map((o) => [o.driverId as string, o.id]),
    );

    const positions = unique.map((s) => ({
      driverId: s.driverId,
      name: s.driver.name,
      phone: s.driver.phone,
      vehicleType: s.driver.vehicleType,
      lat: toNum(s.lastGpsLat),
      lng: toNum(s.lastGpsLng),
      heading: null as null,
      at: s.lastGpsAt,
      status: s.availability,
      hasActiveOrder: activeOrderByDriver.has(s.driverId),
      activeOrderId: activeOrderByDriver.get(s.driverId) ?? null,
    }));

    res.json(positions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/dispatch/overview:
 *   get:
 *     tags: [Dispatch Monitor]
 *     summary: Ops control-room overview (jeopardy, stalled, GPS-stale, zone loads)
 */
router.get("/overview", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const now = Date.now();

    const [settings, activeOrders, sessions, zones] = await Promise.all([
      prisma.fulfillmentSettings.findUnique({
        where: { tenantId },
        select: { gpsStaleAfterSec: true },
      }),
      prisma.deliveryOrder.findMany({
        where: { tenantId, status: { in: [...ACTIVE_STATUSES] } },
        orderBy: { slaDeadline: "asc" },
        take: 500,
        include: {
          vendor: { select: { id: true, name: true } },
          driver: { select: { id: true, name: true, phone: true } },
          pickupZone: { select: { id: true, code: true, name: true } },
          dropoffZone: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.courierOnlineSession.findMany({
        where: { tenantId, availability: { in: NON_OFFLINE } },
        include: {
          driver: { select: { id: true, name: true, phone: true, vehicleType: true } },
        },
      }) as unknown as Promise<SessionRow[]>,
      prisma.deliveryZone.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      }),
    ]);

    const gpsStaleAfterSec = settings?.gpsStaleAfterSec ?? GPS_STALE_DEFAULT_SEC;
    const uniqueSessions = latestSessionPerDriver(sessions);

    // ── Jeopardy: active orders by SLA deadline ascending ──────────────────
    const jeopardy = activeOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      slaDeadline: o.slaDeadline,
      slaRemainingSec: o.slaDeadline
        ? Math.round((o.slaDeadline.getTime() - now) / 1000)
        : null,
      vendor: o.vendor ? { id: o.vendor.id, name: o.vendor.name } : null,
      driver: o.driver ? { id: o.driver.id, name: o.driver.name } : null,
      pickupZone: o.pickupZone,
      dropoffZone: o.dropoffZone,
      createdAt: o.createdAt,
    }));

    // ── Stalled drivers: ASSIGNED/PICKED_UP order, latest 3 GPS points span
    //    >3 min with total movement <50m (bounded fan-out) ─────────────────
    const enRoute = activeOrders.filter(
      (o) => o.driverId && (o.status === "ASSIGNED" || o.status === "PICKED_UP"),
    );
    const stalledDrivers: Array<Record<string, unknown>> = [];
    for (const o of enRoute.slice(0, MAX_STALLED_DRIVER_CHECKS)) {
      const points = await prisma.locationLog.findMany({
        where: { driverId: o.driverId as string },
        orderBy: { capturedAt: "desc" },
        take: 3,
        select: { latitude: true, longitude: true, capturedAt: true },
      });
      if (points.length < 3) continue;
      const spanMs =
        points[0].capturedAt.getTime() - points[2].capturedAt.getTime();
      if (spanMs <= STALLED_SPAN_MS) continue;
      let moved = 0;
      for (let i = 0; i < points.length - 1; i++) {
        moved += haversineMeters(
          Number(points[i].latitude), Number(points[i].longitude),
          Number(points[i + 1].latitude), Number(points[i + 1].longitude),
        );
      }
      if (moved >= STALLED_MOVEMENT_METERS) continue;
      stalledDrivers.push({
        driverId: o.driverId,
        driverName: o.driver?.name ?? null,
        driverPhone: o.driver?.phone ?? null,
        orderId: o.id,
        orderNumber: o.orderNumber,
        orderStatus: o.status,
        lastPointAt: points[0].capturedAt,
        movedMeters: Math.round(moved),
        spanSec: Math.round(spanMs / 1000),
      });
    }

    // ── GPS-stale sessions ────────────────────────────────────────────────
    const gpsStale = uniqueSessions
      .filter(
        (s) =>
          !s.lastGpsAt || now - s.lastGpsAt.getTime() > gpsStaleAfterSec * 1000,
      )
      .map((s) => ({
        driverId: s.driverId,
        name: s.driver.name,
        phone: s.driver.phone,
        availability: s.availability,
        lastGpsAt: s.lastGpsAt,
        ageSec: s.lastGpsAt ? Math.round((now - s.lastGpsAt.getTime()) / 1000) : null,
      }));

    // ── Zone loads ────────────────────────────────────────────────────────
    // Online drivers per zone: resolve each session's last GPS point-in-zone
    // (acceptable at seed scale; capped).
    const onlineDriversByZone = new Map<string, number>();
    for (const s of uniqueSessions.slice(0, MAX_SESSIONS_FOR_ZONE_RESOLUTION)) {
      const lat = toNum(s.lastGpsLat);
      const lng = toNum(s.lastGpsLng);
      if (lat == null || lng == null) continue;
      const zone = await resolveZone(tenantId, lat, lng);
      if (!zone) continue;
      onlineDriversByZone.set(zone.id, (onlineDriversByZone.get(zone.id) ?? 0) + 1);
    }

    // Active orders + SLA remaining per pickup zone (single in-memory pass).
    const ordersByZone = new Map<string, { count: number; slaRemainingSecs: number[] }>();
    for (const o of activeOrders) {
      if (!o.pickupZoneId) continue;
      const entry = ordersByZone.get(o.pickupZoneId) ?? { count: 0, slaRemainingSecs: [] };
      entry.count++;
      if (o.slaDeadline) {
        entry.slaRemainingSecs.push(Math.round((o.slaDeadline.getTime() - now) / 1000));
      }
      ordersByZone.set(o.pickupZoneId, entry);
    }

    const zoneLoads = zones.map((z) => {
      const orders = ordersByZone.get(z.id);
      const activeCount = orders?.count ?? 0;
      const onlineDrivers = onlineDriversByZone.get(z.id) ?? 0;
      const slaSecs = orders?.slaRemainingSecs ?? [];
      return {
        zoneId: z.id,
        code: z.code,
        name: z.name,
        activeOrders: activeCount,
        onlineDrivers,
        loadRatio: activeCount / Math.max(1, onlineDrivers),
        avgSlaRemainingSec: slaSecs.length
          ? Math.round(slaSecs.reduce((a, b) => a + b, 0) / slaSecs.length)
          : null,
      };
    });

    res.json({ jeopardy, stalledDrivers, gpsStale, zoneLoads });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
