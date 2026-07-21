// Darb 2.0 PRD §9 — fleet-partner portal (/api/fleet). FLEET-role JWT only;
// fleetPartnerId always comes from the token, never the client (mirror of
// vendorPortal). Containment: middleware/fleetContainment fences FLEET
// tokens to /api/auth + /api/fleet + /api/events.

import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { getFleetScorecard } from "../services/fleetService";
import { getDriverRating } from "../services/ratingService";

const router = Router();
router.use(authMiddleware, tenantScope, rbac("FLEET"));

function fleetContext(req: Request): { tenantId: string; fleetPartnerId: string } | null {
  const { tenantId } = req.user!;
  const fleetPartnerId = (req.user as { fleetPartnerId?: string }).fleetPartnerId;
  if (!fleetPartnerId) return null;
  return { tenantId, fleetPartnerId };
}

/**
 * @swagger
 * /api/fleet/me:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet partner's own profile + commitments
 */
router.get("/me", async (req: Request, res: Response) => {
  try {
    const ctx = fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const fleet = await prisma.fleetPartner.findFirst({
      where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
      select: {
        id: true, name: true, contactName: true, contactPhone: true, contactEmail: true,
        flatFeePerOrderKwd: true, minOnlineHoursPerDay: true, minDriversOnline: true,
        disciplineStatus: true, isActive: true, createdAt: true,
      },
    });
    if (!fleet) { res.status(404).json({ error: "Fleet partner not found" }); return; }
    res.json(fleet);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Roster — the fleet's own drivers with doc statuses and ratings
 */
router.get("/drivers", async (req: Request, res: Response) => {
  try {
    const ctx = fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const drivers = await prisma.driver.findMany({
      where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
      select: {
        id: true, name: true, phone: true, status: true, vehicleType: true,
        performanceTier: true, throttledUntil: true,
        civilIdStatus: true, civilIdExpiry: true,
        drivingLicenseStatus: true, drivingLicenseExpiry: true,
        vehicleRegStatus: true, vehicleRegExpiry: true,
        healthCertStatus: true, healthCertExpiry: true,
      },
      orderBy: { name: "asc" },
    });
    const ratings = await Promise.all(
      drivers.map((d) => getDriverRating(ctx.tenantId, d.id)),
    );
    res.json(
      drivers.map((d, i) => ({
        ...d,
        rating: ratings[i],
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/scorecard:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet's own performance scorecard (default: last 30 days)
 */
router.get("/scorecard", async (req: Request, res: Response) => {
  try {
    const ctx = fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date();
    const from =
      typeof req.query.from === "string"
        ? new Date(req.query.from)
        : new Date(to.getTime() - 30 * 86_400_000);
    const scorecard = await getFleetScorecard(ctx.tenantId, ctx.fleetPartnerId, { from, to });
    res.json(scorecard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/statements:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet's monthly payout statements
 */
router.get("/statements", async (req: Request, res: Response) => {
  try {
    const ctx = fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const rows = await prisma.fleetPayoutStatement.findMany({
      where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
      orderBy: { periodStart: "desc" },
      take: 24,
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/earnings:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Per-order earnings for a month (delivered orders x flat fee)
 */
router.get("/earnings", async (req: Request, res: Response) => {
  try {
    const ctx = fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }

    const month = typeof req.query.month === "string" ? req.query.month : null;
    const m = month ? /^(\d{4})-(\d{2})$/.exec(month) : null;
    const now = new Date();
    const start = m
      ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

    const [fleet, orders] = await Promise.all([
      prisma.fleetPartner.findFirst({
        where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
        select: { flatFeePerOrderKwd: true },
      }),
      prisma.deliveryOrder.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: "DELIVERED",
          deliveredAt: { gte: start, lt: end },
          driver: { fleetPartnerId: ctx.fleetPartnerId },
        },
        select: {
          id: true, orderNumber: true, deliveredAt: true,
          driver: { select: { id: true, name: true } },
        },
        orderBy: { deliveredAt: "desc" },
        take: 1000,
      }),
    ]);

    const fee = Number(fleet?.flatFeePerOrderKwd ?? 1.1);
    res.json({
      periodStart: start,
      periodEnd: end,
      feePerOrderKwd: fee.toFixed(3),
      deliveredOrders: orders.length,
      totalKwd: (orders.length * fee).toFixed(3),
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        deliveredAt: o.deliveredAt,
        driverName: o.driver?.name ?? null,
        feeKwd: fee.toFixed(3),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
