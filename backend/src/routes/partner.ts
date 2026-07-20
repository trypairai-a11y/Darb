/**
 * Darb 2.0 PRD §2 — partner order intake ("orders reach Darb ready-made,
 * through an API"). Mounted at /api/partner BEFORE authMiddleware; every
 * route carries partnerAuth (API-key) instead of a JWT.
 *
 * Contract mirrors createDeliveryOrder semantics: a rejected order still
 * returns 201 with status REJECTED + rejectionReason — the merchant system
 * inspects the status. Idempotency: externalRef is unique per vendor; a
 * replay returns the existing order with 200.
 */
import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { partnerAuth } from "../middleware/partnerAuth";
import { validateBody } from "../utils/validate";
import { createDeliveryOrder } from "../services/orderService";
import { DeliveryOrder } from "../generated/prisma";

const router = Router();

// Per-key rate limit (falls back to IP before auth resolves the key).
const partnerLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.partner?.apiKeyId ?? req.ip ?? "unknown",
});

router.use(partnerAuth, partnerLimiter);

const kwdAmountSchema = z
  .union([z.string(), z.number()])
  .refine((v) => /^\d{1,7}(\.\d{1,3})?$/.test(String(v)), {
    message: "Must be a KWD amount with up to 3 decimals",
  });

const createSchema = z.object({
  externalRef: z.string().trim().min(1).max(120),
  branchId: z.string().min(1),
  paymentMethod: z.enum(["COD", "PREPAID"]),
  orderTotalKwd: kwdAmountSchema,
  customer: z.object({
    name: z.string().max(200).optional(),
    phone: z.string().max(30).optional(),
  }),
  dropoff: z.object({
    lat: z.number().gte(-90).lte(90).optional(),
    lng: z.number().gte(-180).lte(180).optional(),
    address: z.string().max(500).optional(),
  }),
  scheduledAt: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Public-safe view of an order for the partner (no podPin, no internals). */
function partnerView(order: DeliveryOrder) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    externalRef: order.externalRef,
    status: order.status,
    rejectionReason: order.rejectionReason,
    cancelReason: order.cancelReason,
    failureReason: order.failureReason,
    deliveryFeeKwd: order.deliveryFeeKwd?.toFixed(3) ?? null,
    trackingToken: order.trackingToken,
    scheduledAt: order.scheduledAt,
    assignedAt: order.assignedAt,
    pickedUpAt: order.pickedUpAt,
    deliveredAt: order.deliveredAt,
    createdAt: order.createdAt,
  };
}

/**
 * @swagger
 * /api/partner/orders:
 *   post:
 *     tags: [Partner API]
 *     summary: Push a ready, priced order (API-key auth, idempotent on externalRef)
 */
router.post(
  "/orders",
  validateBody(createSchema),
  async (req: Request, res: Response) => {
    const { tenantId, vendorId } = req.partner!;
    const body = req.body as z.infer<typeof createSchema>;

    try {
      // Idempotency pre-check: same externalRef ⇒ return the existing order.
      const existing = await prisma.deliveryOrder.findFirst({
        where: { tenantId, vendorId, externalRef: body.externalRef },
      });
      if (existing) {
        res.status(200).json(partnerView(existing));
        return;
      }

      // Branch must belong to THIS vendor (the key's scope).
      const branch = await prisma.vendorBranch.findFirst({
        where: { id: body.branchId, tenantId, vendorId },
        select: { id: true },
      });
      if (!branch) {
        res.status(422).json({ error: "Unknown branchId for this API key's merchant" });
        return;
      }

      const order = await createDeliveryOrder({
        tenantId,
        source: "PARTNER_API",
        vendorId,
        branchId: body.branchId,
        paymentMethod: body.paymentMethod,
        orderTotalKwd: body.orderTotalKwd,
        customerName: body.customer.name,
        customerPhone: body.customer.phone,
        dropoffAddress: body.dropoff.address,
        dropoff: { lat: body.dropoff.lat, lng: body.dropoff.lng },
        externalRef: body.externalRef,
        scheduledAt: body.scheduledAt,
        metadata: body.metadata,
        actor: { type: "VENDOR", id: vendorId, name: "partner-api" },
      });
      res.status(201).json(partnerView(order));
    } catch (err) {
      // externalRef unique race: another replica created it between the
      // pre-check and the insert — fetch and return it.
      const raced = await prisma.deliveryOrder.findFirst({
        where: { tenantId, vendorId, externalRef: body.externalRef },
      });
      if (raced) {
        res.status(200).json(partnerView(raced));
        return;
      }
      logger.error({ err }, "partner order create failed");
      res.status(500).json({ error: "Order creation failed" });
    }
  },
);

/**
 * @swagger
 * /api/partner/orders/{idOrExternalRef}:
 *   get:
 *     tags: [Partner API]
 *     summary: Order status by Darb id or the merchant's externalRef
 */
router.get("/orders/:idOrExternalRef", async (req: Request, res: Response) => {
  const { tenantId, vendorId } = req.partner!;
  const key = req.params.idOrExternalRef;
  try {
    const order = await prisma.deliveryOrder.findFirst({
      where: {
        tenantId,
        vendorId,
        OR: [{ id: key }, { externalRef: key }],
      },
    });
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(partnerView(order));
  } catch (err) {
    logger.error({ err }, "partner order lookup failed");
    res.status(500).json({ error: "Lookup failed" });
  }
});

export default router;
