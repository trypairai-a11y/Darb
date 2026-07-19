// Darb 2.0 — /api/delivery-orders (plan §A8). Staff-facing order console:
// list/filter, manual create, detail + timeline, manual assign, redispatch,
// cancel, and the REJECTED-order dropoff fix that re-enters dispatch.
// House conventions per routes/wallets.ts: authMiddleware + tenantScope on
// the router, rbac() per mutating route, getPagination/paginatedResponse,
// try/catch → { error }.

import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { validateBody } from "../utils/validate";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { parseLocalDate, parseLocalDateEnd } from "../utils/date";
import { quoteDelivery } from "../services/pricingService";
import {
  OrderActor,
  OrderStateConflictError,
  flushOrderEvents,
  publishOrderEvent,
  transitionOrder,
} from "../services/orderStateMachine";
import {
  OrderNotFoundError,
  SLA_PROMISE_MINUTES,
  assignDriverManually,
  cancelOrder,
  createDeliveryOrder,
  redispatchOrder,
} from "../services/orderService";
import { enqueueDispatchStart } from "../queues/dispatchQueue";
import { selectCandidates } from "../services/dispatch/dispatchEngine";
import { DeliveryOrderStatus } from "../generated/prisma";
import { randomInt } from "crypto";

const SUPERVISOR_PLUS = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];

const DELIVERY_ORDER_STATUSES = [
  "CREATED", "REJECTED", "DISPATCHING", "NO_DRIVER", "ASSIGNED",
  "PICKED_UP", "DELIVERED", "FAILED", "CANCELLED",
] as const;

/** Supervisor cancel: any pre-DELIVERED state (§A2). */
const SUPERVISOR_CANCELLABLE: DeliveryOrderStatus[] = [
  "CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED", "PICKED_UP",
];

/** Rejection reasons a dropoff fix can cure (§A8 PATCH /:id/dropoff). */
const DROPOFF_FIXABLE_REASONS = ["NO_COORDINATES", "OUT_OF_ZONE_DROPOFF"];

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── Schemas ────────────────────────────────────────────────────────────────

/** KWD amount: number or "1.250"-style string, ≤3 decimal places. */
const kwdAmountSchema = z
  .union([z.string(), z.number()])
  .refine(
    (v) => /^\d{1,7}(\.\d{1,3})?$/.test(String(v)),
    { message: "Must be a KWD amount with up to 3 decimals" },
  );

const createOrderSchema = z.object({
  vendorId: z.string().min(1, "Vendor is required"),
  branchId: z.string().min(1, "Branch is required"),
  paymentMethod: z.enum(["COD", "PREPAID"]),
  orderTotalKwd: kwdAmountSchema,
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(30).optional(),
  dropoffAddress: z.string().max(500).optional(),
  dropoff: z.object({
    lat: z.number().gte(-90).lte(90).optional(),
    lng: z.number().gte(-180).lte(180).optional(),
    zoneId: z.string().min(1).optional(),
  }),
  foodicsOrderId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const assignSchema = z.object({
  driverId: z.string().min(1, "Driver is required"),
});

const cancelSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

const dropoffSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  address: z.string().max(500).optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function staffActor(req: Request): OrderActor {
  return { type: "USER", id: req.user!.userId, name: req.user!.email };
}

function handleOrderError(res: Response, err: unknown): void {
  if (err instanceof OrderStateConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof OrderNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  if (/not found/i.test(message)) {
    res.status(404).json({ error: message });
    return;
  }
  res.status(500).json({ error: message });
}

// ─── List ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/delivery-orders:
 *   get:
 *     tags: [Delivery Orders]
 *     summary: List delivery orders (filters + pagination)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: CSV of DeliveryOrderStatus values
 *       - in: query
 *         name: vendorId
 *         schema: { type: string }
 *       - in: query
 *         name: driverId
 *         schema: { type: string }
 *       - in: query
 *         name: zoneId
 *         schema: { type: string }
 *         description: Matches pickup OR dropoff zone
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, example: "2026-07-01" }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, example: "2026-07-19" }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Order number / customer name / customer phone
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { skip, limit, page } = getPagination(req);
    const { vendorId, driverId, zoneId, dateFrom, dateTo, search } = req.query;

    const where: any = { tenantId };

    if (typeof req.query.status === "string" && req.query.status.length > 0) {
      const statuses = req.query.status
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is (typeof DELIVERY_ORDER_STATUSES)[number] =>
          (DELIVERY_ORDER_STATUSES as readonly string[]).includes(s),
        );
      if (statuses.length > 0) where.status = { in: statuses };
    }
    if (typeof vendorId === "string" && vendorId) where.vendorId = vendorId;
    if (typeof driverId === "string" && driverId) where.driverId = driverId;
    if (typeof zoneId === "string" && zoneId) {
      where.OR = [{ pickupZoneId: zoneId }, { dropoffZoneId: zoneId }];
    }
    if (typeof dateFrom === "string" && dateFrom) {
      where.createdAt = { ...(where.createdAt ?? {}), gte: parseLocalDate(dateFrom) };
    }
    if (typeof dateTo === "string" && dateTo) {
      where.createdAt = { ...(where.createdAt ?? {}), lte: parseLocalDateEnd(dateTo) };
    }
    if (typeof search === "string" && search.trim()) {
      const q = search.trim();
      const searchOr = [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q } },
      ];
      // Combine with a zone OR filter when both are present.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }

    const [data, total] = await Promise.all([
      prisma.deliveryOrder.findMany({
        where: { ...where, tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          vendor: { select: { name: true } },
          driver: { select: { name: true } },
        },
      }),
      prisma.deliveryOrder.count({ where: { ...where, tenantId } }),
    ]);

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Manual create ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/delivery-orders:
 *   post:
 *     tags: [Delivery Orders]
 *     summary: Manually create a delivery order (source SUPERVISOR)
 */
router.post(
  "/",
  rbac(...SUPERVISOR_PLUS),
  validateBody(createOrderSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const body = req.body as z.infer<typeof createOrderSchema>;
      const order = await createDeliveryOrder({
        tenantId,
        source: "SUPERVISOR",
        vendorId: body.vendorId,
        branchId: body.branchId,
        paymentMethod: body.paymentMethod,
        orderTotalKwd: body.orderTotalKwd,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        dropoffAddress: body.dropoffAddress,
        dropoff: body.dropoff,
        foodicsOrderId: body.foodicsOrderId,
        metadata: body.metadata,
        actor: staffActor(req),
      });
      // The row is returned whatever its status — REJECTED included; the
      // client inspects status/rejectionReason.
      res.status(201).json(order);
    } catch (err) {
      handleOrderError(res, err);
    }
  },
);

// ─── Detail ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/delivery-orders/{id}:
 *   get:
 *     tags: [Delivery Orders]
 *     summary: Full order detail with offers and timeline events
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const order = await prisma.deliveryOrder.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        vendor: { select: { id: true, name: true, code: true, phone: true } },
        branch: { select: { id: true, name: true, address: true, phone: true } },
        driver: { select: { id: true, name: true, phone: true, vehicleType: true } },
        pickupZone: { select: { id: true, code: true, name: true } },
        dropoffZone: { select: { id: true, code: true, name: true } },
        offers: {
          orderBy: [{ round: "asc" }, { offeredAt: "asc" }],
          include: { driver: { select: { id: true, name: true } } },
        },
      },
    });
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const events = await prisma.orderEvent.findMany({
      where: { tenantId, orderId: order.id },
      orderBy: { timestamp: "asc" },
    });

    res.json({ ...order, events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/delivery-orders/{id}/timeline:
 *   get:
 *     tags: [Delivery Orders]
 *     summary: OrderEvent rows for an order, ascending
 */
router.get("/:id/timeline", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const order = await prisma.deliveryOrder.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true },
    });
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const events = await prisma.orderEvent.findMany({
      where: { tenantId, orderId: order.id },
      orderBy: { timestamp: "asc" },
    });
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/delivery-orders/:id/candidates — ranked dispatch candidates for
 * the manual-assign panel. Same query the dispatch engine runs each round:
 * ONLINE + fresh GPS + vehicle constraint + no active order/offer + cash
 * ceiling + radius, sorted by distance (tiebreak longest-idle).
 * Shape: [{ driverId, name, phone, distanceKm, etaMin, activeOrders }]
 */
router.get("/:id/candidates", rbac(...SUPERVISOR_PLUS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const order = await prisma.deliveryOrder.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true },
    });
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const candidates = await selectCandidates(tenantId, order.id);
    res.json(candidates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/delivery-orders/{id}/assign:
 *   post:
 *     tags: [Delivery Orders]
 *     summary: Manually assign a driver (from NO_DRIVER or DISPATCHING)
 */
router.post(
  "/:id/assign",
  rbac(...SUPERVISOR_PLUS),
  validateBody(assignSchema),
  async (req: Request, res: Response) => {
    try {
      const order = await assignDriverManually({
        tenantId: req.user!.tenantId,
        orderId: req.params.id,
        driverId: (req.body as z.infer<typeof assignSchema>).driverId,
        actor: staffActor(req),
      });
      res.json(order);
    } catch (err) {
      handleOrderError(res, err);
    }
  },
);

/**
 * @swagger
 * /api/delivery-orders/{id}/redispatch:
 *   post:
 *     tags: [Delivery Orders]
 *     summary: Cancel open offers and restart dispatch
 */
router.post(
  "/:id/redispatch",
  rbac(...SUPERVISOR_PLUS),
  async (req: Request, res: Response) => {
    try {
      await redispatchOrder({
        tenantId: req.user!.tenantId,
        orderId: req.params.id,
        actor: staffActor(req),
      });
      res.json({ ok: true });
    } catch (err) {
      handleOrderError(res, err);
    }
  },
);

/**
 * @swagger
 * /api/delivery-orders/{id}/cancel:
 *   post:
 *     tags: [Delivery Orders]
 *     summary: Supervisor cancel (any pre-DELIVERED state)
 */
router.post(
  "/:id/cancel",
  rbac(...SUPERVISOR_PLUS),
  validateBody(cancelSchema),
  async (req: Request, res: Response) => {
    try {
      const order = await cancelOrder({
        tenantId: req.user!.tenantId,
        orderId: req.params.id,
        reason: (req.body as z.infer<typeof cancelSchema>).reason,
        actor: staffActor(req),
        allowFrom: SUPERVISOR_CANCELLABLE,
      });
      res.json(order);
    } catch (err) {
      handleOrderError(res, err);
    }
  },
);

/**
 * @swagger
 * /api/delivery-orders/{id}/dropoff:
 *   patch:
 *     tags: [Delivery Orders]
 *     summary: Fix dropoff coordinates on a REJECTED order and re-enter dispatch
 *     description: Only for REJECTED orders with NO_COORDINATES or OUT_OF_ZONE_DROPOFF.
 */
router.patch(
  "/:id/dropoff",
  rbac(...SUPERVISOR_PLUS),
  validateBody(dropoffSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { lat, lng, address } = req.body as z.infer<typeof dropoffSchema>;

      const order = await prisma.deliveryOrder.findFirst({
        where: { id: req.params.id, tenantId },
      });
      if (!order) { res.status(404).json({ error: "Order not found" }); return; }
      if (
        order.status !== "REJECTED" ||
        !order.rejectionReason ||
        !DROPOFF_FIXABLE_REASONS.includes(order.rejectionReason)
      ) {
        res.status(409).json({
          error: "Dropoff can only be fixed on REJECTED orders with NO_COORDINATES or OUT_OF_ZONE_DROPOFF",
        });
        return;
      }

      const quote = await quoteDelivery(tenantId, {
        branchId: order.branchId,
        dropoff: { lat, lng },
      });
      if (!quote.ok) {
        // Explicit narrowing — ts-jest compiles with strict:false, where the
        // `!quote.ok` discriminant doesn't narrow the union.
        res.status(422).json({
          error: (quote as Extract<typeof quote, { ok: false }>).reason,
        });
        return;
      }

      const actor = staffActor(req);
      const tx = await prisma.$transaction(async (trx) => {
        // REJECTED → CREATED with the cured coordinates + fresh quote…
        await transitionOrder(trx, {
          orderId: order.id,
          tenantId,
          from: "REJECTED",
          to: "CREATED",
          actor,
          data: {
            dropoffLat: lat,
            dropoffLng: lng,
            ...(address ? { dropoffAddress: address } : {}),
            pickupZoneId: quote.pickupZoneId,
            dropoffZoneId: quote.dropoffZoneId,
            deliveryFeeKwd: quote.feeKwd,
            rejectionReason: null,
            ...(order.podPin ? {} : { podPin: String(randomInt(0, 10_000)).padStart(4, "0") }),
            slaDeadline: new Date(Date.now() + SLA_PROMISE_MINUTES * 60_000),
          },
          eventMeta: {
            orderNumber: order.orderNumber,
            vendorId: order.vendorId,
            feeKwd: quote.feeKwd.toFixed(3),
          },
        });
        // …then straight back into dispatch.
        await transitionOrder(trx, {
          orderId: order.id,
          tenantId,
          from: "CREATED",
          to: "DISPATCHING",
          actor: { type: "SYSTEM", name: "system" },
          eventMeta: {
            orderNumber: order.orderNumber,
            vendorId: order.vendorId,
            feeKwd: quote.feeKwd.toFixed(3),
          },
        });
        return trx;
      });

      flushOrderEvents(tx);
      publishOrderEvent(tenantId, "order.created", {
        orderId: order.id,
        orderNumber: order.orderNumber,
        vendorId: order.vendorId,
        status: "DISPATCHING",
        feeKwd: quote.feeKwd.toFixed(3),
      });
      await enqueueDispatchStart(order.id, tenantId);

      const updated = await prisma.deliveryOrder.findFirst({
        where: { id: order.id, tenantId },
      });
      res.json(updated);
    } catch (err) {
      handleOrderError(res, err);
    }
  },
);

export default router;
