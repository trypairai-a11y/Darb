/**
 * Darb 2.0 PRD §12 — public customer tracking surface. Mounted at /api/track
 * BEFORE authMiddleware; the 128-bit trackingToken is the only credential.
 *
 * Response discipline: unknown token ⇒ 404 with no enumeration signal; the
 * payload is a strict safe subset — never podPin, never the customer's own
 * phone back, never fee internals beyond the tip the customer set.
 *
 * POST /:token/cancel does NOT cancel the order — it raises an OPS_TODO
 * notification for rider support (PRD §10: support acts on live orders).
 * POST /:token/tip posts the TIP wallet transaction (driver keeps 100%);
 * POST /:token/rating records the 1-5 star rating (low ratings feed the
 * driver violation ladder).
 */
import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { publishOrderEvent } from "../services/orderStateMachine";
import { postTip } from "../services/wallet/walletService";
import { RatingError, submitRating } from "../services/ratingService";

const router = Router();

const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const SUPERVISOR_ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] as const;

/** Same constant as the dispatch engine (PRD keeps the haversine ETA). */
const AVG_SPEED_KMH = 30;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// eslint-disable-next-line no-restricted-syntax -- token IS the tenant resolution; no JWT exists on this surface
export async function findOrderByToken(token: string) {
  if (!token || token.length < 16 || token.length > 64) return null;
  return prisma.deliveryOrder.findUnique({
    where: { trackingToken: token },
    include: {
      vendor: { select: { name: true, nameAr: true } },
      driver: { select: { id: true, name: true, phone: true } },
      rating: { select: { id: true } },
    },
  });
}

/**
 * @swagger
 * /api/track/{token}:
 *   get:
 *     tags: [Tracking]
 *     summary: Public co-branded tracking payload (no auth; token is the credential)
 */
router.get("/:token", readLimiter, async (req: Request, res: Response) => {
  try {
    const order = await findOrderByToken(req.params.token);
    if (!order) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Live driver position + ETA only while the order is on the road.
    let driverBlock: { firstName: string; phone: string | null } | null = null;
    let driverPosition: { lat: number; lng: number } | null = null;
    let etaMin: number | null = null;
    if (
      order.driver &&
      (order.status === "ASSIGNED" || order.status === "PICKED_UP")
    ) {
      driverBlock = {
        firstName: order.driver.name.split(" ")[0],
        phone: order.driver.phone ?? null,
      };
      const session = await prisma.courierOnlineSession.findFirst({
        where: { tenantId: order.tenantId, driverId: order.driver.id },
        orderBy: { startTime: "desc" },
        select: { lastGpsLat: true, lastGpsLng: true, lastGpsAt: true },
      });
      const lat = toNum(session?.lastGpsLat);
      const lng = toNum(session?.lastGpsLng);
      const dropLat = toNum(order.dropoffLat);
      const dropLng = toNum(order.dropoffLng);
      if (lat != null && lng != null) {
        driverPosition = { lat, lng };
        if (dropLat != null && dropLng != null) {
          etaMin = Math.max(
            1,
            Math.ceil((haversineKm(lat, lng, dropLat, dropLng) / AVG_SPEED_KMH) * 60),
          );
        }
      }
    }

    res.json({
      orderNumber: order.orderNumber,
      status: order.status,
      vendor: { name: order.vendor.name, nameAr: order.vendor.nameAr ?? null },
      driver: driverBlock,
      driverPosition,
      dropoff:
        order.dropoffLat != null && order.dropoffLng != null
          ? { lat: Number(order.dropoffLat), lng: Number(order.dropoffLng) }
          : null,
      etaMin,
      scheduledAt: order.scheduledAt,
      slaDeadline: order.slaDeadline,
      assignedAt: order.assignedAt,
      pickedUpAt: order.pickedUpAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      tipKwd: order.tipKwd ? order.tipKwd.toFixed(3) : null,
      rated: !!order.rating,
      canCancel: ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED"].includes(order.status),
    });
  } catch (err) {
    logger.error({ err }, "track: lookup failed");
    res.status(500).json({ error: "Lookup failed" });
  }
});

/**
 * @swagger
 * /api/track/{token}/cancel:
 *   post:
 *     tags: [Tracking]
 *     summary: Customer cancel request (pre-pickup) — raises an ops to-do, does not cancel
 */
router.post("/:token/cancel", writeLimiter, async (req: Request, res: Response) => {
  try {
    const order = await findOrderByToken(req.params.token);
    if (!order) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED"].includes(order.status)) {
      res.status(409).json({ error: "Order can no longer be cancelled" });
      return;
    }

    const reason =
      typeof (req.body as { reason?: unknown })?.reason === "string"
        ? String((req.body as { reason: string }).reason).slice(0, 300)
        : null;

    // eslint-disable-next-line no-restricted-syntax -- tenant comes from the order row, not a JWT
    const users = await prisma.user.findMany({
      where: {
        tenantId: order.tenantId,
        role: { in: [...SUPERVISOR_ROLES] },
        isActive: true,
      },
      select: { id: true },
    });
    if (users.length > 0) {
      // eslint-disable-next-line no-restricted-syntax -- tenant comes from the order row
      await prisma.notification.createMany({
        data: users.map((user) => ({
          tenantId: order.tenantId,
          userId: user.id,
          title: "Customer cancel request",
          message: `Customer asked to cancel order ${order.orderNumber}${reason ? `: ${reason}` : ""}. Review and cancel from the order panel.`,
          type: "CUSTOMER_CANCEL_REQUEST",
          severity: "HIGH",
          sourceId: order.id,
          category: "OPS_TODO",
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            vendorId: order.vendorId,
            ...(reason ? { reason } : {}),
          } as Prisma.InputJsonValue,
        })),
      });
    }
    publishOrderEvent(order.tenantId, "order.cancel_requested", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      vendorId: order.vendorId,
      ...(reason ? { reason } : {}),
    });

    res.json({ ok: true, message: "Cancel request sent to rider support" });
  } catch (err) {
    logger.error({ err }, "track: cancel request failed");
    res.status(500).json({ error: "Request failed" });
  }
});

/**
 * @swagger
 * /api/track/{token}/tip:
 *   post:
 *     tags: [Tracking]
 *     summary: Customer tips the driver (DELIVERED orders only; once; driver keeps 100%)
 */
router.post("/:token/tip", writeLimiter, async (req: Request, res: Response) => {
  try {
    const order = await findOrderByToken(req.params.token);
    if (!order) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (order.status !== "DELIVERED" || !order.driver) {
      res.status(409).json({ error: "Tips are only possible after delivery" });
      return;
    }

    const raw = (req.body as { amountKwd?: unknown })?.amountKwd;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 20) {
      res.status(400).json({ error: "amountKwd must be between 0.001 and 20.000" });
      return;
    }
    const tip = new Prisma.Decimal(amount.toFixed(3));

    const driverId = order.driver.id;
    const posted = await prisma.$transaction(async (tx) => {
      // Once-only guard: the tipKwd column flips from NULL exactly once.
      const guarded = await tx.deliveryOrder.updateMany({
        where: { id: order.id, tenantId: order.tenantId, status: "DELIVERED", tipKwd: null },
        data: { tipKwd: tip },
      });
      if (guarded.count === 0) return null;
      await postTip(tx, { id: order.id, tenantId: order.tenantId, driverId }, tip);
      await tx.orderEvent.create({
        data: {
          tenantId: order.tenantId,
          orderId: order.id,
          action: "order.tipped",
          description: `Customer tipped ${tip.toFixed(3)} KWD — driver keeps 100%`,
          operator: "customer",
          timestamp: new Date(),
          metadata: { tipKwd: tip.toFixed(3) } as Prisma.InputJsonValue,
        },
      });
      return true;
    });
    if (!posted) {
      res.status(409).json({ error: "This order has already been tipped" });
      return;
    }

    publishOrderEvent(order.tenantId, "order.tipped", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      vendorId: order.vendorId,
      tipKwd: tip.toFixed(3),
    });
    res.json({ ok: true, tipKwd: tip.toFixed(3) });
  } catch (err) {
    logger.error({ err }, "track: tip failed");
    res.status(500).json({ error: "Tip failed" });
  }
});

/**
 * @swagger
 * /api/track/{token}/rating:
 *   post:
 *     tags: [Tracking]
 *     summary: Rate the delivery 1-5 stars with an optional comment (once per order)
 */
router.post("/:token/rating", writeLimiter, async (req: Request, res: Response) => {
  try {
    const order = await findOrderByToken(req.params.token);
    if (!order) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const body = req.body as { stars?: unknown; comment?: unknown };
    const rating = await submitRating({
      tenantId: order.tenantId,
      orderId: order.id,
      stars: Number(body?.stars),
      comment: typeof body?.comment === "string" ? body.comment : undefined,
    });
    res.status(201).json({ ok: true, stars: rating.stars });
  } catch (err) {
    if (err instanceof RatingError) {
      res.status(err.httpStatus).json({ error: err.message });
      return;
    }
    logger.error({ err }, "track: rating failed");
    res.status(500).json({ error: "Rating failed" });
  }
});

export default router;
