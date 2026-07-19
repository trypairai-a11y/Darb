import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { vendorScope } from "../middleware/vendorScope";
import { validateBody } from "../utils/validate";
import { getPagination, paginatedResponse } from "../utils/pagination";
import {
  OrderNotFoundError,
  cancelOrder,
  createDeliveryOrder,
} from "../services/orderService";
import { OrderStateConflictError } from "../services/orderStateMachine";

/**
 * Vendor portal API (Darb 2.0, plan §A8 /api/vendor).
 *
 * Mounting (integration phase): server.ts mounts this at /api/vendor —
 * inside the blockVendorOutsideAllowlist allowlist.
 *
 * Every query is scoped by BOTH tenantId and vendorId taken from the signed
 * JWT (req.user), never from query/body. vendorScope guarantees vendorId is
 * present; rbac("VENDOR") guarantees the role.
 *
 * Wallet reads are DIRECT WalletAccount/WalletEntry queries by design — the
 * wallet engine (services/wallet/) is a parallel track, not imported here.
 */

const router = Router();
router.use(authMiddleware, tenantScope, rbac("VENDOR"), vendorScope);

const DELIVERY_ORDER_STATUSES = [
  "CREATED", "REJECTED", "DISPATCHING", "NO_DRIVER", "ASSIGNED",
  "PICKED_UP", "DELIVERED", "FAILED", "CANCELLED",
] as const;

const pauseSchema = z.object({ paused: z.boolean() });

/** KWD amount: number or "1.250"-style string, ≤3 decimal places. */
const kwdAmountSchema = z
  .union([z.string(), z.number()])
  .refine(
    (v) => /^\d{1,7}(\.\d{1,3})?$/.test(String(v)),
    { message: "Must be a KWD amount with up to 3 decimals" },
  );

// Mirrors orderService.CreateOrderInput minus tenantId/vendorId/source/actor
// (all derived server-side; a body vendorId is ignored by design).
const vendorCreateOrderSchema = z.object({
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
  metadata: z.record(z.unknown()).optional(),
});

const vendorCancelSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

const fmtKwd = (v: unknown) => Number(v ?? 0).toFixed(3);

// ─── Profile ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendor/me:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: Current vendor profile with branches and pause state
 */
router.get("/me", async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId!, tenantId },
      include: {
        branches: {
          orderBy: { name: "asc" },
          include: { zone: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
    res.json(vendor);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Orders ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendor/orders:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: List this vendor's delivery orders (paginated)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: CSV of DeliveryOrderStatus values, e.g. "CREATED,ASSIGNED"
 */
router.get("/orders", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    // Scope ALWAYS comes from the JWT — a ?vendorId= query param is ignored.
    const { tenantId, vendorId } = req.user!;

    const where: any = { tenantId, vendorId: vendorId! };
    if (typeof req.query.status === "string" && req.query.status.length > 0) {
      const statuses = req.query.status
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is (typeof DELIVERY_ORDER_STATUSES)[number] =>
          (DELIVERY_ORDER_STATUSES as readonly string[]).includes(s)
        );
      if (statuses.length > 0) where.status = { in: statuses };
    }

    const [data, total] = await Promise.all([
      prisma.deliveryOrder.findMany({
        where: { ...where, tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          branch: { select: { id: true, name: true } },
          driver: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.deliveryOrder.count({ where: { ...where, tenantId } }),
    ]);

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/vendor/orders/{id}:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: Order detail (must belong to this vendor) with driver + timeline
 */
router.get("/orders/:id", async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const order = await prisma.deliveryOrder.findFirst({
      where: { id: req.params.id, tenantId, vendorId: vendorId! },
      include: {
        branch: { select: { id: true, name: true, address: true, phone: true } },
        driver: { select: { id: true, name: true, phone: true } },
        pickupZone: { select: { id: true, code: true, name: true } },
        dropoffZone: { select: { id: true, code: true, name: true } },
      },
    });
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const timeline = await prisma.orderEvent.findMany({
      where: { tenantId, orderId: order.id },
      orderBy: { timestamp: "asc" },
    });

    res.json({ ...order, timeline });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/vendor/orders:
 *   post:
 *     tags: [Vendor Portal]
 *     summary: Create a delivery order (source VENDOR_PORTAL)
 *     description: >
 *       vendorId always comes from the JWT. The branch must belong to this
 *       vendor. Returns the persisted row whatever its status — a quote
 *       rejection (or paused vendor) yields a REJECTED row, not an error.
 */
router.post(
  "/orders",
  validateBody(vendorCreateOrderSchema),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, vendorId } = req.user!;
      const body = req.body as z.infer<typeof vendorCreateOrderSchema>;
      const order = await createDeliveryOrder({
        tenantId,
        source: "VENDOR_PORTAL",
        vendorId: vendorId!, // JWT-scoped — a body vendorId is ignored
        branchId: body.branchId,
        paymentMethod: body.paymentMethod,
        orderTotalKwd: body.orderTotalKwd,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        dropoffAddress: body.dropoffAddress,
        dropoff: body.dropoff,
        metadata: body.metadata,
        actor: { type: "VENDOR", id: req.user!.userId, name: req.user!.email },
      });
      res.status(201).json(order);
    } catch (err: any) {
      if (/not found/i.test(err?.message ?? "")) {
        res.status(404).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err?.message ?? "Unexpected error" });
    }
  }
);

/**
 * @swagger
 * /api/vendor/orders/{id}/cancel:
 *   post:
 *     tags: [Vendor Portal]
 *     summary: Cancel this vendor's order (pre-pickup only)
 */
router.post(
  "/orders/:id/cancel",
  validateBody(vendorCancelSchema),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, vendorId } = req.user!;
      // Vendor ownership check BEFORE touching the state machine — a foreign
      // order id must look like a plain 404.
      const owned = await prisma.deliveryOrder.findFirst({
        where: { id: req.params.id, tenantId, vendorId: vendorId! },
        select: { id: true },
      });
      if (!owned) { res.status(404).json({ error: "Order not found" }); return; }

      const order = await cancelOrder({
        tenantId,
        orderId: req.params.id,
        reason: (req.body as z.infer<typeof vendorCancelSchema>).reason,
        actor: { type: "VENDOR", id: req.user!.userId, name: req.user!.email },
        // Vendor cancel: pre-pickup only (§A2).
        allowFrom: ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED"],
      });
      res.json(order);
    } catch (err: any) {
      if (err instanceof OrderStateConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof OrderNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err?.message ?? "Unexpected error" });
    }
  }
);

// ─── Pause ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendor/pause:
 *   post:
 *     tags: [Vendor Portal]
 *     summary: Pause/resume incoming orders for this vendor
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paused]
 *             properties:
 *               paused: { type: boolean }
 */
router.post(
  "/pause",
  validateBody(pauseSchema),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, vendorId } = req.user!;
      const { paused } = req.body as { paused: boolean };

      const result = await prisma.vendor.updateMany({
        where: { id: vendorId!, tenantId },
        data: { isPaused: paused },
      });
      if (result.count === 0) { res.status(404).json({ error: "Vendor not found" }); return; }

      // NOTE(darb2-integration): DarbEventType (services/eventBus.ts) has no
      // "vendor.paused" member, and eventBus is a shared file owned by another
      // track — so no SSE event is published here. If the integration phase
      // adds the type, publish { type: "vendor.paused", tenantId,
      // payload: { vendorId, paused } } after this write.

      res.json({ ok: true, isPaused: paused });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ─── Wallet ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendor/wallet:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: Vendor wallet balance (KWD, 3dp string)
 */
router.get("/wallet", async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const account = await prisma.walletAccount.findFirst({
      where: { tenantId, ownerKey: `VENDOR:${vendorId!}` },
    });
    res.json({
      ownerKey: `VENDOR:${vendorId!}`,
      balanceKwd: fmtKwd(account?.balanceKwd),
      accountId: account?.id ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/vendor/wallet/entries:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: Vendor wallet ledger entries (paginated; monthly statements)
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: string, example: "2026-07" }
 *         description: Restrict to a calendar month (YYYY-MM)
 */
router.get("/wallet/entries", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const { tenantId, vendorId } = req.user!;

    const account = await prisma.walletAccount.findFirst({
      where: { tenantId, ownerKey: `VENDOR:${vendorId!}` },
    });
    if (!account) {
      res.json(paginatedResponse([], 0, page, limit));
      return;
    }

    const where: any = { tenantId, accountId: account.id };
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    if (month) {
      const m = /^(\d{4})-(\d{2})$/.exec(month);
      if (!m) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
      const year = Number(m[1]);
      const monthIdx = Number(m[2]) - 1;
      if (monthIdx < 0 || monthIdx > 11) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
      where.createdAt = {
        gte: new Date(Date.UTC(year, monthIdx, 1)),
        lt: new Date(Date.UTC(year, monthIdx + 1, 1)),
      };
    }

    const [entries, total] = await Promise.all([
      prisma.walletEntry.findMany({
        where: { ...where, tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          transaction: {
            select: { id: true, type: true, memo: true, orderId: true, createdAt: true },
          },
        },
      }),
      prisma.walletEntry.count({ where: { ...where, tenantId } }),
    ]);

    const data = entries.map((e: any) => ({
      id: e.id,
      direction: e.direction,
      amountKwd: fmtKwd(e.amountKwd),
      runningBalanceKwd: fmtKwd(e.runningBalanceKwd),
      createdAt: e.createdAt,
      transaction: e.transaction,
    }));

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Branches ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendor/branches:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: This vendor's branches
 */
router.get("/branches", async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const branches = await prisma.vendorBranch.findMany({
      where: { tenantId, vendorId: vendorId! },
      orderBy: { name: "asc" },
      include: { zone: { select: { id: true, code: true, name: true } } },
    });
    res.json(branches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
