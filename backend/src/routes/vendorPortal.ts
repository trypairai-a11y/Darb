import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";
import { prisma } from "../config";
import { trackingUrl } from "../services/customerMessagingService";
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
import { quoteDelivery } from "../services/pricingService";
import { RefundError, requestRefund } from "../services/wallet/refundService";

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
// ADMIN is admitted here only so vendorScope can decide: it lets an admin
// read a named vendor's portal and refuses everything else. See vendorScope.
router.use(authMiddleware, tenantScope, rbac("VENDOR", "ADMIN"), vendorScope);

const DELIVERY_ORDER_STATUSES = [
  "CREATED", "REJECTED", "DISPATCHING", "NO_DRIVER", "ASSIGNED",
  "PICKED_UP", "DELIVERED", "FAILED", "CANCELLED",
] as const;

const pauseSchema = z.object({ paused: z.boolean() });

/**
 * Portal sub-role fences (client revision #9).
 *
 * OWNER is the default and behaves exactly as the portal always did, so every
 * pre-existing vendor login keeps working unchanged. The other two narrow it,
 * per the shop roles the client described:
 *   FINANCE        — the shop's accountant. Tops up the balance and checks
 *                    what orders were worth, so they read orders but never
 *                    place, cancel or refund one.
 *   ORDER_TRACKING — tracks orders and raises support requests. Pinned to one
 *                    branch when a branch was assigned, across all of them
 *                    when it was not. Never sees money.
 */
type VendorRole = "OWNER" | "FINANCE" | "ORDER_TRACKING";

function vendorRoleOf(req: Request): VendorRole {
  const role = req.user?.vendorRole;
  return role === "FINANCE" || role === "ORDER_TRACKING" ? role : "OWNER";
}

/**
 * Which branch this request is limited to, or null for the whole vendor.
 *
 * Two different things end up here. An ORDER_TRACKING login is *pinned* to its
 * own branch and cannot see past it, whatever it asks for. A vendor-wide role
 * may *choose* a branch with ?branchId=, which is what the branch pills in the
 * portal header are for: they were sending the id and nothing was reading it,
 * so picking a branch changed the highlight and nothing else.
 *
 * A chosen id is only ever used as a filter on a query already scoped to this
 * vendor, so a branch belonging to somebody else narrows the result to nothing
 * rather than widening it to their data.
 */
function scopedBranchId(req: Request): string | null {
  // A branch-scoped tracker is fenced to its own branch whatever it asks for.
  // A tracker with no branch assigned covers all of them and chooses like an
  // owner, which is the other half of how the client uses this role.
  if (vendorRoleOf(req) === "ORDER_TRACKING" && req.user?.branchId) return req.user.branchId;
  const chosen = typeof req.query.branchId === "string" ? req.query.branchId.trim() : "";
  return chosen.length > 0 ? chosen : null;
}

/** Guard a route to a set of portal sub-roles. */
function requireVendorRole(...allowed: VendorRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!allowed.includes(vendorRoleOf(req))) {
      res.status(403).json({ error: "Not permitted for this portal role" });
      return;
    }
    next();
  };
}

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
  // Revision 8 (#4): null or absent means deliver now. A future timestamp
  // parks the order in CREATED until the sweep is close enough to dispatch it,
  // which orderService already implements; the portal simply never offered it.
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const vendorCancelSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

const vendorQuoteSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  dropoff: z.object({
    lat: z.number().gte(-90).lte(90).optional(),
    lng: z.number().gte(-180).lte(180).optional(),
    zoneId: z.string().min(1).optional(),
  }),
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

    // A branch-scoped login is handed only its own branch. It used to receive
    // the whole list, so the portal drew an "All branches" pill and a pill per
    // branch for someone who was fenced to exactly one of them.
    const pinned = scopedBranchId(req);
    res.json(
      pinned ? { ...vendor, branches: vendor.branches.filter((b) => b.id === pinned) } : vendor
    );
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
    // A branch-scoped login only ever sees its own branch's orders.
    const branchId = scopedBranchId(req);
    if (branchId) where.branchId = branchId;
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
 * /api/vendor/orders/export.xlsx:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: This vendor's orders as a workbook
 *     description: >
 *       Revision 8 (#4). The portal could only ever show orders a page at a
 *       time on screen; a shop reconciling a week of deliveries against its own
 *       books needs the same fields in something it can sort and total.
 *       Honours the same branch, status and date filters as the list.
 */
router.get("/orders/export.xlsx", async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const where: any = { tenantId, vendorId: vendorId! };
    const branchId = scopedBranchId(req);
    if (branchId) where.branchId = branchId;

    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(`${req.query.to}T23:59:59.999`) : null;
    if (from || to) {
      where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }

    const orders = await prisma.deliveryOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: {
        branch: { select: { name: true } },
        driver: { select: { name: true } },
        dropoffZone: { select: { name: true } },
      },
    });

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Orders");
    sheet.columns = [
      { header: "Order", key: "orderNumber", width: 20 },
      { header: "Created", key: "createdAt", width: 20 },
      { header: "Scheduled for", key: "scheduledAt", width: 20 },
      { header: "Branch", key: "branch", width: 26 },
      { header: "Status", key: "status", width: 14 },
      { header: "Customer", key: "customerName", width: 22 },
      { header: "Phone", key: "customerPhone", width: 16 },
      { header: "Address", key: "dropoffAddress", width: 40 },
      { header: "Dropoff zone", key: "zone", width: 18 },
      { header: "Payment", key: "paymentMethod", width: 12 },
      { header: "Order total (KD)", key: "orderTotalKwd", width: 16 },
      { header: "Delivery fee (KD)", key: "deliveryFeeKwd", width: 16 },
      { header: "Driver", key: "driver", width: 22 },
      { header: "Delivered", key: "deliveredAt", width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };

    const stamp = (d: Date | null | undefined) =>
      d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) : "";

    for (const o of orders) {
      sheet.addRow({
        orderNumber: o.orderNumber,
        createdAt: stamp(o.createdAt),
        scheduledAt: stamp(o.scheduledAt),
        branch: o.branch?.name ?? "",
        status: o.status,
        customerName: o.customerName ?? "",
        customerPhone: o.customerPhone ?? "",
        dropoffAddress: o.dropoffAddress ?? "",
        zone: o.dropoffZone?.name ?? "",
        paymentMethod: o.paymentMethod,
        orderTotalKwd: Number(o.orderTotalKwd ?? 0),
        deliveryFeeKwd: Number(o.deliveryFeeKwd ?? 0),
        driver: o.driver?.name ?? "",
        deliveredAt: stamp(o.deliveredAt),
      });
    }
    // Money reads as money, not as a long float.
    for (const key of ["orderTotalKwd", "deliveryFeeKwd"]) {
      sheet.getColumn(key).numFmt = "0.000";
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="darb-orders.xlsx"');
    await wb.xlsx.write(res);
    res.end();
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
    const branchId = scopedBranchId(req);
    const order = await prisma.deliveryOrder.findFirst({
      where: {
        id: req.params.id,
        tenantId,
        vendorId: vendorId!,
        ...(branchId ? { branchId } : {}),
      },
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

    res.json({ ...order, timeline, trackingUrl: trackingUrl(order.trackingToken) });
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
  requireVendorRole("OWNER", "ORDER_TRACKING"),
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
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
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
  requireVendorRole("OWNER", "ORDER_TRACKING"),
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
  requireVendorRole("OWNER"),
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
router.get("/wallet", requireVendorRole("OWNER", "FINANCE"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const [account, vendor] = await Promise.all([
      prisma.walletAccount.findFirst({
        where: { tenantId, ownerKey: `VENDOR:${vendorId!}` },
      }),
      prisma.vendor.findFirst({
        where: { id: vendorId!, tenantId },
        select: { creditCapKwd: true },
      }),
    ]);
    // PRD §11 credit line: debt = the negative side of the payable balance.
    const balance = account?.balanceKwd ?? null;
    const debt = balance && balance.isNegative() ? balance.neg() : null;
    res.json({
      ownerKey: `VENDOR:${vendorId!}`,
      balanceKwd: fmtKwd(account?.balanceKwd),
      accountId: account?.id ?? null,
      creditCapKwd: vendor?.creditCapKwd ? fmtKwd(vendor.creditCapKwd) : null,
      creditUsedKwd: debt ? fmtKwd(debt) : "0.000",
      // Revision 8 (#5). The page showed how much credit was used but not how
      // much was left, which is the number that decides whether the next order
      // is accepted: pricingService rejects with VENDOR_CREDIT_CAP once the
      // debt passes the cap, so this is the real headroom before new orders
      // stop being taken.
      creditRemainingKwd: vendor?.creditCapKwd
        ? fmtKwd(
            vendor.creditCapKwd.minus(debt ?? 0).lessThan(0)
              ? 0
              : vendor.creditCapKwd.minus(debt ?? 0),
          )
        : null,
      creditSuspended: Boolean(
        vendor?.creditCapKwd && debt && debt.greaterThanOrEqualTo(vendor.creditCapKwd),
      ),
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
router.get("/wallet/entries", requireVendorRole("OWNER", "FINANCE"), async (req: Request, res: Response) => {
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

    // The wallet itself is one balance for the whole vendor, by design, so a
    // branch choice narrows which movements are listed rather than splitting
    // the account. Entries reach a branch through the order their transaction
    // settled; postings with no order (a payout, a correction) belong to the
    // vendor as a whole and drop out of a branch-scoped view.
    const branchId = scopedBranchId(req);
    if (branchId) {
      const branchOrders = await prisma.deliveryOrder.findMany({
        where: { tenantId, vendorId: vendorId!, branchId },
        select: { id: true },
      });
      where.transaction = { orderId: { in: branchOrders.map((o) => o.id) } };
    }

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

    // WalletTransaction carries orderId as a scalar, with no relation to
    // follow, so the order numbers come from one lookup over this page's ids.
    // Without it the client fell back to printing the raw orderId and a shop
    // reconciling its own ledger was reading UUIDs.
    const orderIds = [
      ...new Set(
        entries.map((e: any) => e.transaction?.orderId).filter((id: string | null): id is string => !!id)
      ),
    ];
    const orderNumbers = new Map<string, string>();
    if (orderIds.length > 0) {
      const orders = await prisma.deliveryOrder.findMany({
        where: { id: { in: orderIds }, tenantId, vendorId: vendorId! },
        select: { id: true, orderNumber: true },
      });
      for (const o of orders) orderNumbers.set(o.id, o.orderNumber);
    }

    const data = entries.map((e: any) => ({
      id: e.id,
      direction: e.direction,
      amountKwd: fmtKwd(e.amountKwd),
      runningBalanceKwd: fmtKwd(e.runningBalanceKwd),
      createdAt: e.createdAt,
      transaction: e.transaction
        ? {
            ...e.transaction,
            order: e.transaction.orderId
              ? { orderNumber: orderNumbers.get(e.transaction.orderId) ?? null }
              : null,
          }
        : e.transaction,
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

// ─── Zones & quote ───────────────────────────────────────────────────────────
//
// The order form needs the zone list and a fee quote, but VENDOR tokens are
// contained to /api/vendor by blockVendorOutsideAllowlist and cannot reach
// /api/zones. These mirror the staff endpoints with the vendor's own scope
// applied, rather than widening the containment allowlist.

/**
 * @swagger
 * /api/vendor/zones:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: Active delivery zones, for the dropoff picker
 *     responses:
 *       200:
 *         description: Active zones (id, code, name, nameAr, polygon)
 */
router.get("/zones", async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const zones = await prisma.deliveryZone.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
      // No `color` column on DeliveryZone — the map falls back to its own
      // palette by index, same as the staff /api/zones list.
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        polygon: true,
        bbox: true,
        isActive: true,
      },
    });
    res.json(zones);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/vendor/quote:
 *   post:
 *     tags: [Vendor Portal]
 *     summary: Quote the delivery fee for a dropoff from one of the vendor's branches
 *     responses:
 *       200:
 *         description: "{ ok: true, feeKwd, zones… } or { ok: false, reason }"
 *       404:
 *         description: Branch does not belong to this vendor
 */
router.post("/quote", validateBody(vendorQuoteSchema), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const input = req.body as z.infer<typeof vendorQuoteSchema>;

    // A vendor may only quote from its own branches.
    const branch = await prisma.vendorBranch.findFirst({
      where: { id: input.branchId, tenantId, vendorId: vendorId! },
      select: { id: true },
    });
    if (!branch) {
      res.status(404).json({ error: "Branch not found" });
      return;
    }

    // Shape the argument explicitly — validateBody guarantees both fields, but
    // z.infer reports them optional under ts-jest's strict:false compile.
    const result = await quoteDelivery(tenantId, {
      branchId: input.branchId,
      dropoff: input.dropoff ?? {},
    });
    // `in` rather than discriminating on `result.ok`: ts-jest compiles with
    // strict:false, which widens the ok:true/ok:false literals and collapses
    // the union, so discriminant narrowing fails there even though tsc is fine.
    if ("reason" in result) {
      res.json({ ok: false, reason: result.reason });
      return;
    }
    res.json({
      ok: true,
      pickupZoneId: result.pickupZoneId,
      dropoffZoneId: result.dropoffZoneId,
      feeKwd: result.feeKwd.toFixed(3),
      pickupZone: result.pickupZone,
      dropoffZone: result.dropoffZone,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Refunds (PRD §11 — merchant approves/raises, Darb processes) ──────────

/**
 * @swagger
 * /api/vendor/orders/{id}/refund-request:
 *   post:
 *     tags: [Vendor Portal]
 *     summary: Raise a full-order refund request for a DELIVERED order
 */
router.post("/orders/:id/refund-request", async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId, userId } = req.user!;
    const reason =
      typeof (req.body as { reason?: unknown })?.reason === "string"
        ? String((req.body as { reason: string }).reason)
        : "";
    const refund = await requestRefund({
      tenantId,
      vendorId: vendorId!,
      orderId: req.params.id,
      reason,
      requestedById: userId,
    });
    res.status(201).json(refund);
  } catch (err: any) {
    if (err?.code === "P2002") {
      res.status(409).json({ error: "A refund request already exists for this order" });
      return;
    }
    if (err instanceof RefundError) { res.status(400).json({ error: err.message }); return; }
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/vendor/refunds:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: The vendor's own refund requests
 */
router.get("/refunds", async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const rows = await prisma.refund.findMany({
      where: { tenantId, vendorId: vendorId! },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { order: { select: { id: true, orderNumber: true } } },
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/vendor/statements:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: The vendor's monthly netting statements
 */
router.get("/statements", requireVendorRole("OWNER", "FINANCE"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const rows = await prisma.vendorStatement.findMany({
      where: { tenantId, vendorId: vendorId! },
      orderBy: { periodStart: "desc" },
      take: 24,
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ─── Team (revision 8, edit 7) ───────────────────────────────────────────────

/**
 * The shop's own team.
 *
 * The Darb side has always been able to create a shop's portal users; the shop
 * could not. That made Darb the bottleneck for something a shop owner should
 * do themselves: hiring an accountant, or giving a new branch supervisor a
 * login for their branch only.
 *
 * OWNER only, and everything is fenced to the owner's own vendor, so this
 * cannot become a way to read or touch another shop's team. Password rules and
 * hashing match the Darb-side flow exactly.
 */
const vendorTeamUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(120),
  phone: z.string().max(30).optional(),
  vendorRole: z.enum(["OWNER", "FINANCE", "ORDER_TRACKING"]),
  branchId: z.string().min(1).optional().nullable(),
});

router.get("/team", requireVendorRole("OWNER"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const users = await prisma.user.findMany({
      where: { tenantId, vendorId: vendorId!, role: "VENDOR" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, email: true, name: true, phone: true, vendorRole: true,
        branchId: true, isActive: true, createdAt: true,
        branch: { select: { id: true, name: true } },
      },
    });
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/team",
  requireVendorRole("OWNER"),
  validateBody(vendorTeamUserSchema),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, vendorId, userId } = req.user!;
      const { email, password, name, phone, vendorRole, branchId } = req.body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) { res.status(400).json({ error: "Email already registered" }); return; }

      // A branch-scoped login must point at a branch of THIS shop, or an owner
      // could fence their tracker to somebody else's branch.
      if (branchId) {
        const branch = await prisma.vendorBranch.findFirst({
          where: { id: branchId, tenantId, vendorId: vendorId! },
          select: { id: true },
        });
        if (!branch) { res.status(400).json({ error: "Branch does not belong to this shop" }); return; }
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: {
          tenantId,
          email,
          passwordHash,
          name,
          phone,
          role: "VENDOR",
          vendorId: vendorId!,
          vendorRole,
          // Owner and finance are shop-wide, so they carry no branch even if
          // one was posted. Only a tracker can be pinned, and only optionally:
          // a tracker with no branch covers all of them.
          branchId: vendorRole === "ORDER_TRACKING" ? (branchId ?? null) : null,
        },
        select: {
          id: true, email: true, name: true, phone: true, vendorRole: true,
          branchId: true, isActive: true, createdAt: true,
        },
      });
      res.status(201).json(user);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.patch("/team/:id", requireVendorRole("OWNER"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId, userId } = req.user!;
    if (req.params.id === userId) {
      // An owner disabling themselves locks the shop out of its own portal.
      res.status(400).json({ error: "You cannot change your own access" });
      return;
    }
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId, vendorId: vendorId!, role: "VENDOR" },
      select: { id: true },
    });
    if (!target) { res.status(404).json({ error: "User not found" }); return; }

    const data: any = {};
    if (typeof req.body.isActive === "boolean") data.isActive = req.body.isActive;
    if (typeof req.body.vendorRole === "string") {
      if (!["OWNER", "FINANCE", "ORDER_TRACKING"].includes(req.body.vendorRole)) {
        res.status(400).json({ error: "Unknown role" }); return;
      }
      data.vendorRole = req.body.vendorRole;
      if (req.body.vendorRole !== "ORDER_TRACKING") data.branchId = null;
    }
    if ("branchId" in req.body) {
      const bid = req.body.branchId || null;
      if (bid) {
        const branch = await prisma.vendorBranch.findFirst({
          where: { id: bid, tenantId, vendorId: vendorId! }, select: { id: true },
        });
        if (!branch) { res.status(400).json({ error: "Branch does not belong to this shop" }); return; }
      }
      data.branchId = bid;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true, email: true, name: true, phone: true, vendorRole: true,
        branchId: true, isActive: true, createdAt: true,
      },
    });
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Analytics (PRD §7 Data Analytics tab — order-derived v1) ───────────────

/**
 * @swagger
 * /api/vendor/analytics:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: Order-derived analytics (totals, repeat buyers, top customers, by-day)
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: branchId
 *         schema: { type: string }
 */
router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const to = typeof req.query.to === "string" ? new Date(`${req.query.to}T23:59:59.999`) : new Date();
    const from =
      typeof req.query.from === "string"
        ? new Date(`${req.query.from}T00:00:00.000`)
        : new Date(to.getTime() - 30 * 86_400_000);
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;

    const where: any = {
      tenantId,
      vendorId: vendorId!,
      status: "DELIVERED",
      deliveredAt: { gte: from, lte: to },
      ...(branchId ? { branchId } : {}),
    };

    const orders = await prisma.deliveryOrder.findMany({
      where,
      select: {
        orderTotalKwd: true,
        customerPhone: true,
        customerName: true,
        deliveredAt: true,
      },
      take: 10_000,
    });

    let revenue = 0;
    const byCustomer = new Map<string, { name: string | null; orders: number; totalKwd: number }>();
    const byDay = new Map<string, { orders: number; totalKwd: number }>();
    for (const o of orders) {
      const total = Number(o.orderTotalKwd);
      revenue += total;
      if (o.customerPhone) {
        const c = byCustomer.get(o.customerPhone) ?? { name: o.customerName, orders: 0, totalKwd: 0 };
        c.orders += 1;
        c.totalKwd += total;
        if (!c.name && o.customerName) c.name = o.customerName;
        byCustomer.set(o.customerPhone, c);
      }
      const day = o.deliveredAt ? o.deliveredAt.toISOString().slice(0, 10) : "unknown";
      const d = byDay.get(day) ?? { orders: 0, totalKwd: 0 };
      d.orders += 1;
      d.totalKwd += total;
      byDay.set(day, d);
    }

    const repeatBuyers = [...byCustomer.values()].filter((c) => c.orders >= 2).length;
    const topCustomers = [...byCustomer.entries()]
      .sort((a, b) => b[1].totalKwd - a[1].totalKwd)
      .slice(0, 10)
      .map(([phone, c]) => ({
        phone,
        name: c.name,
        orders: c.orders,
        totalKwd: c.totalKwd.toFixed(3),
      }));

    res.json({
      from,
      to,
      branchId: branchId ?? null,
      ordersTotal: orders.length,
      revenueKwd: revenue.toFixed(3),
      avgOrderValueKwd: orders.length > 0 ? (revenue / orders.length).toFixed(3) : "0.000",
      uniqueCustomers: byCustomer.size,
      repeatBuyers,
      topCustomers,
      byDay: [...byDay.entries()]
        .filter(([day]) => day !== "unknown")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, d]) => ({ day, orders: d.orders, totalKwd: d.totalKwd.toFixed(3) })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
