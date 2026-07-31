import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import multer from "multer";
import bcrypt from "bcryptjs";
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { trackingUrl } from "../services/customerMessagingService";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { vendorScope } from "../middleware/vendorScope";
import { validateBody } from "../utils/validate";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { haversineMeters } from "../utils/geo";
import {
  OrderNotFoundError,
  cancelOrder,
  createDeliveryOrder,
} from "../services/orderService";
import { OrderStateConflictError } from "../services/orderStateMachine";
import { quoteDelivery } from "../services/pricingService";
import { RefundError, requestRefund } from "../services/wallet/refundService";
import { getVendorBranchBalances } from "../services/wallet/vendorBranchBalanceService";
import {
  TopUpError,
  cancelTopUp,
  createTopUp,
  suggestTopUp,
} from "../services/wallet/topUpService";
import {
  VENDOR_TABS,
  type VendorTab,
  effectiveVendorTabs,
  isVendorTab,
  parseVendorTabs,
} from "../services/vendorTabService";

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

// Revision 10 (#7): a branchId pauses that counter alone; absent means the
// whole account, which is what the toggle always did.
const pauseSchema = z.object({
  paused: z.boolean(),
  branchId: z.string().min(1).optional().nullable(),
});

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

/**
 * Who this caller is, read from the User row rather than from their token
 * (revision 11, #5).
 *
 * The role, the pinned branch and the tab list all used to come from three
 * different places: vendorRole and branchId off the signed JWT, tabs off the
 * row. That split is what produced the bug the client kept reporting. A token
 * is minted once and carries whatever was true that day, so an owner who
 * changed somebody from FINANCE to a Mishref-only tracker changed nothing until
 * that person's token expired: the server kept fencing them as FINANCE with no
 * branch, so /me handed back every branch and the rail drew a Wallet entry the
 * tab gate then answered 403 to. Same stale-flag hole requireSuperAdmin avoids
 * by going to the database on every request.
 *
 * One query, resolved once per request by middleware, so every helper below
 * stays synchronous and nothing pays for it twice.
 */
interface VendorIdentity {
  vendorRole: VendorRole;
  /** The one branch this login may see, or null for all of them. */
  branchId: string | null;
  tabs: VendorTab[] | null;
  /** What to sign a support message with: their name, else their login. */
  displayName: string;
}

function identityOf(req: Request): VendorIdentity | null {
  return (req as { _vendorIdentity?: VendorIdentity })._vendorIdentity ?? null;
}

/**
 * Resolve the caller's identity from their User row, once per request.
 *
 * An inspecting ADMIN is not a shop login and has no row to read here. They are
 * already fenced to read-only by vendorScope, so they get no identity and every
 * gate below stands aside for them rather than inventing an answer.
 */
async function loadVendorIdentity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== "VENDOR") { next(); return; }
    const row = await prisma.user.findFirst({
      where: { id: req.user.userId, tenantId: req.user.tenantId },
      select: { vendorRole: true, branchId: true, vendorTabs: true, name: true, email: true },
    });
    const role = row?.vendorRole ?? req.user.vendorRole;
    (req as { _vendorIdentity?: VendorIdentity })._vendorIdentity = {
      vendorRole: role === "FINANCE" || role === "ORDER_TRACKING" ? role : "OWNER",
      // Falls back to the token only when the row could not be read at all, so
      // a login whose branch was cleared is not left pinned to the old one.
      branchId: row ? (row.branchId ?? null) : (req.user.branchId ?? null),
      tabs: effectiveVendorTabs(role, row?.vendorTabs),
      displayName: row?.name?.trim() || row?.email || req.user.email,
    };
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

router.use(loadVendorIdentity);

function vendorRoleOf(req: Request): VendorRole {
  return identityOf(req)?.vendorRole ?? "OWNER";
}

/** The name to put on anything this caller writes. */
function actorNameOf(req: Request): string {
  return identityOf(req)?.displayName ?? req.user?.email ?? "";
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
  const identity = identityOf(req);
  if (identity?.vendorRole === "ORDER_TRACKING" && identity.branchId) return identity.branchId;
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

/**
 * Per-user tab access (revision 10, #6).
 *
 * Read from the row, not from the JWT — see loadVendorIdentity above, which is
 * where that row is fetched.
 */
function tabsForRequest(req: Request): VendorTab[] | null {
  return identityOf(req)?.tabs ?? null;
}

/** Guard a route to one portal tab. */
function requireVendorTab(tab: VendorTab) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tabs = tabsForRequest(req);
    if (tabs && !tabs.includes(tab)) {
      // Revision 11 (#7). The refusal names itself and names the tab. The
      // client showed a rail entry the server would not open — a /me answer
      // cached from before an owner narrowed somebody is enough to do it — and
      // the merchant got "Request failed with status code 403". With this the
      // portal can lock that one entry from the refusal itself, without having
      // to guess the tab from the URL and without confusing this with the
      // role-based 403 below, which is a different sentence about a different
      // thing.
      res
        .status(403)
        .json({ error: "This tab is not part of your access", code: "TAB_NOT_GRANTED", tab });
      return;
    }
    next();
  };
}

/** The tab list an owner posted, or undefined when they sent none. */
function readTabsInput(raw: unknown): VendorTab[] | null | undefined {
  if (raw === undefined) return undefined;
  // Explicit null resets the user back to whatever their role opens.
  if (raw === null) return null;
  if (!Array.isArray(raw)) return undefined;
  const chosen = raw.filter(isVendorTab);
  return VENDOR_TABS.filter((tab) => chosen.includes(tab));
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
    const identity = identityOf(req);
    // The *pin*, never a chosen branch: a ?branchId= on this call is the pills
    // asking for a filter, and it must not make the portal think this login is
    // fenced to one counter.
    const pinned =
      identity?.vendorRole === "ORDER_TRACKING" ? (identity.branchId ?? null) : null;
    const branches = pinned ? vendor.branches.filter((b) => b.id === pinned) : vendor.branches;
    res.json({
      ...vendor,
      branches,
      // Revision 10 (#6). The rail and the route fence both used to be derived
      // from vendorRole alone on the client, which meant a narrowed tab list
      // was invisible to the portal until the page 403'd. This is the same
      // answer the tab gate enforces, so screen and server agree.
      portalTabs: tabsForRequest(req),
      // Revision 11 (#5). The client's own view of who it is came off the JWT,
      // which is why a login whose role changed kept drawing the rail it was
      // minted with and got a 403 on click. These two are the server's answer,
      // from the row, so the rail and the branch filter agree with the gates.
      portalRole: identity?.vendorRole ?? null,
      pinnedBranchId: pinned,
    });
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
router.get("/orders", requireVendorTab("ORDERS"), async (req: Request, res: Response) => {
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
router.get("/orders/export.xlsx", requireVendorTab("ORDERS"), async (req: Request, res: Response) => {
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

// ─── Bulk import (revision 10, #1) ───────────────────────────────────────────
//
// A pharmacy with twenty deliveries waiting was re-typing the same eight fields
// twenty times. The client asked for the obvious shape: download a template,
// fill one row per order, import it back, and the orders exist.
//
// Both halves of that are here. The template is generated from THIS shop's own
// branches and the live zone list, on a second sheet, so the values a merchant
// types are values the importer can resolve. The importer validates every row
// before it creates anything, and reports per row, because a file where row 14
// has a typo should not leave the merchant guessing which orders went in.
//
// These sit ABOVE /orders/:id deliberately: Express matches in declaration
// order and "/orders/:id" would otherwise swallow "/orders/import-template.xlsx".

/**
 * How many orders one file may carry.
 *
 * Not arbitrary: each row runs a real quote and a real dispatch, and the
 * serverless function is capped at 60 seconds. Fifty rows lands comfortably
 * inside that; a shop with more splits the file, which the template says.
 */
const MAX_IMPORT_ROWS = 50;

const IMPORT_COLUMNS = [
  { header: "Branch", key: "branch", width: 28 },
  { header: "Customer name", key: "customerName", width: 24 },
  { header: "Customer phone", key: "customerPhone", width: 18 },
  { header: "Dropoff zone", key: "zone", width: 22 },
  { header: "Address", key: "address", width: 42 },
  { header: "Payment (COD or PREPAID)", key: "payment", width: 24 },
  { header: "Order total (KD)", key: "orderTotal", width: 18 },
  { header: "When to collect (blank = now)", key: "whenToCollect", width: 30 },
] as const;

// In-memory only: the serverless filesystem is read-only, and an order sheet is
// a few kilobytes. Same shape as the courier import on the admin side.
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

/** Loose match for a name typed into a spreadsheet: case and spacing forgiven. */
function normaliseName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Read one cell as trimmed text, whatever ExcelJS decided its type was. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const rich = value as { text?: string; result?: unknown; hyperlink?: string };
    if (typeof rich.text === "string") return rich.text.trim();
    if (rich.result !== undefined && rich.result !== null) return String(rich.result).trim();
    return "";
  }
  return String(value).trim();
}

/**
 * @swagger
 * /api/vendor/orders/import-template.xlsx:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: Blank bulk-order template, pre-filled with this shop's branches and the live zones
 */
router.get(
  "/orders/import-template.xlsx",
  requireVendorRole("OWNER", "ORDER_TRACKING"),
  requireVendorTab("ORDERS"),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, vendorId } = req.user!;
      const pinned = scopedBranchId(req);
      const [branches, zones] = await Promise.all([
        prisma.vendorBranch.findMany({
          where: {
            tenantId,
            vendorId: vendorId!,
            isActive: true,
            ...(pinned ? { id: pinned } : {}),
          },
          orderBy: { name: "asc" },
          select: { name: true, zone: { select: { name: true } } },
        }),
        prisma.deliveryZone.findMany({
          where: { tenantId, isActive: true },
          orderBy: { name: "asc" },
          select: { name: true, code: true },
        }),
      ]);

      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet("Orders");
      sheet.columns = IMPORT_COLUMNS.map((c) => ({ ...c }));
      sheet.getRow(1).font = { bold: true };
      // A totals column formatted as text turns "1.5" into a string the
      // importer then has to guess at. Say it is money up front.
      sheet.getColumn("orderTotal").numFmt = "0.000";

      // One filled example row, greyed, so the shape is obvious without reading
      // instructions. The importer skips it: see EXAMPLE_PHONE below.
      const example = sheet.addRow({
        branch: branches[0]?.name ?? "Your branch name",
        customerName: "Example customer",
        customerPhone: "00000000",
        zone: zones[0]?.name ?? "Salmiya",
        address: "Block 4, Street 12, House 8",
        payment: "COD",
        orderTotal: 12.5,
        whenToCollect: "",
      });
      example.font = { color: { argb: "FF9AA0A6" }, italic: true };

      const ref = wb.addWorksheet("Valid values");
      ref.columns = [
        { header: "Your branches", key: "branch", width: 32 },
        { header: "Branch zone", key: "branchZone", width: 22 },
        { header: "Delivery zones", key: "zone", width: 26 },
        { header: "Zone code", key: "zoneCode", width: 18 },
      ];
      ref.getRow(1).font = { bold: true };
      const rows = Math.max(branches.length, zones.length);
      for (let i = 0; i < rows; i++) {
        ref.addRow({
          branch: branches[i]?.name ?? "",
          branchZone: branches[i]?.zone?.name ?? "",
          zone: zones[i]?.name ?? "",
          zoneCode: zones[i]?.code ?? "",
        });
      }
      ref.addRow({});
      ref.addRow({ branch: `Up to ${MAX_IMPORT_ROWS} orders per file.` });
      ref.addRow({ branch: "Payment must read COD or PREPAID." });
      ref.addRow({
        branch: 'Leave "When to collect" blank to send the order now, or write a date and time like 2026-08-01 15:30.',
      });
      ref.addRow({ branch: "The grey example row is ignored. Delete it or type over it." });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", 'attachment; filename="darb-orders-template.xlsx"');
      await wb.xlsx.write(res);
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/** The example row's phone. A row still carrying it was never filled in. */
const EXAMPLE_PHONE = "00000000";

interface ImportRowResult {
  row: number;
  ok: boolean;
  orderNumber?: string;
  orderId?: string;
  status?: string;
  error?: string;
}

/**
 * @swagger
 * /api/vendor/orders/bulk-import:
 *   post:
 *     tags: [Vendor Portal]
 *     summary: Create many orders from a filled-in template workbook
 *     description: >
 *       multipart/form-data with one `file`. Every row is validated first; if any
 *       row is unusable nothing is created and the errors come back per row, so a
 *       merchant never ends up with half an import to reconcile by hand.
 */
router.post(
  "/orders/bulk-import",
  requireVendorRole("OWNER", "ORDER_TRACKING"),
  requireVendorTab("ORDERS"),
  importUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, vendorId } = req.user!;
      const file = (req as Request & { file?: { buffer: Buffer } }).file;
      if (!file?.buffer) {
        res.status(400).json({ error: "Attach the filled-in template as `file`" });
        return;
      }

      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
      } catch {
        res.status(400).json({ error: "That file is not a readable Excel workbook" });
        return;
      }
      const sheet = wb.getWorksheet("Orders") ?? wb.worksheets[0];
      if (!sheet) {
        res.status(400).json({ error: "The workbook has no sheets" });
        return;
      }

      const pinned = scopedBranchId(req);
      const [branches, zones] = await Promise.all([
        prisma.vendorBranch.findMany({
          where: { tenantId, vendorId: vendorId!, ...(pinned ? { id: pinned } : {}) },
          select: { id: true, name: true, nameAr: true, isActive: true },
        }),
        prisma.deliveryZone.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, name: true, nameAr: true, code: true },
        }),
      ]);

      const branchByName = new Map<string, { id: string; isActive: boolean }>();
      for (const b of branches) {
        branchByName.set(normaliseName(b.name), { id: b.id, isActive: b.isActive });
        if (b.nameAr) branchByName.set(normaliseName(b.nameAr), { id: b.id, isActive: b.isActive });
      }
      const zoneByName = new Map<string, string>();
      for (const z of zones) {
        zoneByName.set(normaliseName(z.name), z.id);
        zoneByName.set(normaliseName(z.code), z.id);
        if (z.nameAr) zoneByName.set(normaliseName(z.nameAr), z.id);
      }

      // ── Pass one: read and validate every row, create nothing ──
      interface ParsedRow {
        row: number;
        branchId: string;
        customerName?: string;
        customerPhone: string;
        zoneId: string;
        address?: string;
        paymentMethod: "COD" | "PREPAID";
        orderTotalKwd: string;
        scheduledAt?: Date;
      }
      const parsed: ParsedRow[] = [];
      const errors: ImportRowResult[] = [];
      let dataRows = 0;

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // header
        const values = IMPORT_COLUMNS.map((_c, i) => cellText(row.getCell(i + 1).value));
        // A wholly empty row is spreadsheet padding, not a mistake.
        if (values.every((v) => v === "")) return;

        const [branchName, customerName, phoneRaw, zoneName, address, paymentRaw, totalRaw, whenRaw] =
          values;
        const phone = phoneRaw.replace(/\s+/g, "");
        // The template's own grey example, left in place. Skipping it silently is
        // kinder than refusing the whole file over a row we put there.
        if (phone === EXAMPLE_PHONE && normaliseName(customerName) === "example customer") return;

        dataRows += 1;
        const fail = (message: string) => errors.push({ row: rowNumber, ok: false, error: message });

        const branch = branchByName.get(normaliseName(branchName));
        if (!branchName) fail("Branch is required");
        else if (!branch) fail(`No branch of yours is called "${branchName}"`);
        else if (!branch.isActive) fail(`Branch "${branchName}" is not active`);

        if (!phone) fail("Customer phone is required");

        const zoneId = zoneByName.get(normaliseName(zoneName));
        if (!zoneName) fail("Dropoff zone is required");
        else if (!zoneId) fail(`"${zoneName}" is not a delivery zone`);

        const payment = normaliseName(paymentRaw).toUpperCase();
        if (payment !== "COD" && payment !== "PREPAID") {
          fail(`Payment must read COD or PREPAID, not "${paymentRaw}"`);
        }

        const total = totalRaw.replace(/,/g, "");
        if (!/^\d{1,7}(\.\d{1,3})?$/.test(total)) {
          fail(`Order total "${totalRaw}" is not a KD amount with up to 3 decimals`);
        }

        let scheduledAt: Date | undefined;
        if (whenRaw) {
          const when = new Date(whenRaw);
          if (Number.isNaN(when.getTime())) {
            fail(`"${whenRaw}" is not a date and time. Use 2026-08-01 15:30, or leave it blank.`);
          } else if (when.getTime() <= Date.now()) {
            fail("When to collect is in the past. Leave it blank to send the order now.");
          } else {
            scheduledAt = when;
          }
        }

        if (branch?.id && phone && zoneId && (payment === "COD" || payment === "PREPAID")) {
          parsed.push({
            row: rowNumber,
            branchId: branch.id,
            customerName: customerName || undefined,
            customerPhone: phone,
            zoneId,
            address: address || undefined,
            paymentMethod: payment,
            orderTotalKwd: total,
            scheduledAt,
          });
        }
      });

      if (dataRows === 0) {
        res.status(400).json({ error: "The sheet has no order rows in it" });
        return;
      }
      if (dataRows > MAX_IMPORT_ROWS) {
        res.status(413).json({
          error: `That file has ${dataRows} orders. Split it into files of ${MAX_IMPORT_ROWS} or fewer and import them one at a time.`,
        });
        return;
      }
      // All or nothing. A partial import is the worst outcome here: the merchant
      // cannot tell which of their twenty deliveries are live without checking
      // the board row by row.
      if (errors.length > 0) {
        // Count ROWS, not messages. One row can fail four different ways, and
        // "10 of 2 rows need fixing" is a sentence that makes a merchant
        // distrust the rest of the report.
        const brokenRows = new Set(errors.map((e) => e.row)).size;
        res.status(422).json({
          error:
            brokenRows === 1
              ? "One row needs fixing. Nothing was imported."
              : `${brokenRows} rows need fixing. Nothing was imported.`,
          created: 0,
          rows: errors.sort((a, b) => a.row - b.row),
        });
        return;
      }

      // ── Pass two: create. Sequential on purpose — each order runs a quote and
      // enters dispatch, and firing fifty of those at once would have them
      // competing for the same drivers in an order nobody chose.
      const results: ImportRowResult[] = [];
      for (const p of parsed) {
        try {
          const order = await createDeliveryOrder({
            tenantId,
            source: "VENDOR_PORTAL",
            vendorId: vendorId!,
            branchId: p.branchId,
            paymentMethod: p.paymentMethod,
            orderTotalKwd: p.orderTotalKwd,
            customerName: p.customerName,
            customerPhone: p.customerPhone,
            dropoffAddress: p.address,
            dropoff: { zoneId: p.zoneId },
            scheduledAt: p.scheduledAt,
            actor: { type: "VENDOR", id: req.user!.userId, name: req.user!.email },
          });
          results.push({
            row: p.row,
            // A REJECTED row is a real outcome, not a failure to import: the
            // order exists and says why it was refused, same as a single entry
            // through the form.
            ok: order.status !== "REJECTED",
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            error: order.status === "REJECTED" ? (order.rejectionReason ?? undefined) : undefined,
          });
        } catch (err: any) {
          results.push({ row: p.row, ok: false, error: err?.message ?? "Could not be created" });
        }
      }

      const created = results.filter((r) => r.orderId).length;
      res.status(201).json({
        created,
        accepted: results.filter((r) => r.ok).length,
        total: parsed.length,
        rows: results,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Unexpected error" });
    }
  },
);

/** Same figure the customer's tracking page quotes, so the two agree. */
const AVG_SPEED_KMH = 30;

/**
 * The assigned driver's last GPS fix, or nulls (revision 11, #6).
 *
 * Deliberately narrow: a position only exists while the order is ASSIGNED or
 * PICKED_UP. Once it is delivered, cancelled or failed the driver is somewhere
 * else entirely, and a shop watching a stale dot would read it as the driver
 * parked outside a customer they already left. The fix's own timestamp goes out
 * with it so the client can say how old it is rather than implying "now".
 */
async function liveDriverPosition(
  // tenantId comes from the JWT like every other query on this router, not from
  // the row we just read.
  tenantId: string,
  order: {
    status: string;
    driverId: string | null;
    dropoffLat: Prisma.Decimal | null;
    dropoffLng: Prisma.Decimal | null;
  },
): Promise<{ position: { lat: number; lng: number } | null; at: string | null; etaMin: number | null }> {
  const none = { position: null, at: null, etaMin: null };
  if (!order.driverId) return none;
  if (order.status !== "ASSIGNED" && order.status !== "PICKED_UP") return none;

  const session = await prisma.courierOnlineSession.findFirst({
    where: { tenantId, driverId: order.driverId },
    orderBy: { startTime: "desc" },
    select: { lastGpsLat: true, lastGpsLng: true, lastGpsAt: true },
  });
  const lat = session?.lastGpsLat != null ? Number(session.lastGpsLat) : null;
  const lng = session?.lastGpsLng != null ? Number(session.lastGpsLng) : null;
  if (lat == null || lng == null) return none;

  let etaMin: number | null = null;
  if (order.dropoffLat != null && order.dropoffLng != null) {
    const km = haversineMeters(lat, lng, Number(order.dropoffLat), Number(order.dropoffLng)) / 1000;
    etaMin = Math.max(1, Math.ceil((km / AVG_SPEED_KMH) * 60));
  }

  return { position: { lat, lng }, at: session?.lastGpsAt?.toISOString() ?? null, etaMin };
}

/**
 * @swagger
 * /api/vendor/orders/{id}:
 *   get:
 *     tags: [Vendor Portal]
 *     summary: Order detail (must belong to this vendor) with driver + timeline
 */
router.get("/orders/:id", requireVendorTab("ORDERS"), async (req: Request, res: Response) => {
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

    // Revision 11 (#6). The merchant's map used to be a still picture of the
    // dropoff pin, which told a shop chasing a late order nothing it did not
    // already know. The driver's last fix goes on the payload the same way the
    // customer's tracking page gets it (routes/track.ts), and only while the
    // order is actually on the road: a delivered order's last GPS point is a
    // place the driver has since left.
    const live = await liveDriverPosition(tenantId, order);

    res.json({
      ...order,
      timeline,
      trackingUrl: trackingUrl(order.trackingToken),
      driverPosition: live.position,
      driverPositionAt: live.at,
      etaMin: live.etaMin,
    });
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
  requireVendorTab("ORDERS"),
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
  requireVendorTab("ORDERS"),
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
        // Vendor cancel: pre-pickup only (§A2). ARRIVED belongs in that list —
        // revision 8 (#3) inserted it between accepting and collecting and this
        // was not updated, so an order the driver was standing next to could not
        // be cancelled by the shop from anywhere. The FSM has always allowed
        // ARRIVED → CANCELLED; only this list disagreed.
        allowFrom: ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED", "ARRIVED"],
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
  requireVendorTab("SETTINGS"),
  validateBody(pauseSchema),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, vendorId } = req.user!;
      const { paused, branchId } = req.body as { paused: boolean; branchId?: string | null };

      // Revision 10 (#7). One switch used to stop the whole account, so a shop
      // with a queue at one counter had to refuse orders at every other counter
      // too. A branchId pauses that branch alone; no branchId keeps the
      // account-wide behaviour the toggle always had.
      if (branchId) {
        const result = await prisma.vendorBranch.updateMany({
          where: { id: branchId, tenantId, vendorId: vendorId! },
          data: { isPaused: paused },
        });
        if (result.count === 0) { res.status(404).json({ error: "Branch not found" }); return; }
        res.json({ ok: true, branchId, isPaused: paused });
        return;
      }

      const result = await prisma.vendor.updateMany({
        where: { id: vendorId!, tenantId },
        data: { isPaused: paused },
      });
      if (result.count === 0) { res.status(404).json({ error: "Vendor not found" }); return; }

      // Resuming the account has to clear the branch flags too, or a shop that
      // paused one counter last week and then resumed the account would find
      // that one counter still silently refusing orders with no switch showing
      // it. Pausing the account leaves them alone: they are already covered.
      if (!paused) {
        await prisma.vendorBranch.updateMany({
          where: { tenantId, vendorId: vendorId!, isPaused: true },
          data: { isPaused: false },
        });
      }

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
router.get("/wallet", requireVendorTab("WALLET"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const [account, vendor, branchBalances, suggestion] = await Promise.all([
      prisma.walletAccount.findFirst({
        where: { tenantId, ownerKey: `VENDOR:${vendorId!}` },
      }),
      prisma.vendor.findFirst({
        where: { id: vendorId!, tenantId },
        select: { creditCapKwd: true },
      }),
      // Revision 10 (#3). The card used to print the account total whichever
      // branch pill was lit, so two branches showed the identical figure while
      // the ledger under it changed. Both numbers are here now: the total for
      // "All branches", and each branch's own share.
      getVendorBranchBalances(tenantId, vendorId!),
      // Revision 10 (#2). The top-up field prefills from this rather than from
      // an empty box the merchant has to guess at.
      suggestTopUp(tenantId, vendorId!),
    ]);
    // PRD §11 credit line: debt = the negative side of the payable balance.
    const balance = account?.balanceKwd ?? null;
    const debt = balance && balance.isNegative() ? balance.neg() : null;

    const chosenBranch = scopedBranchId(req);
    res.json({
      ownerKey: `VENDOR:${vendorId!}`,
      balanceKwd: fmtKwd(account?.balanceKwd),
      accountId: account?.id ?? null,
      // The figure to show for whatever the pills are on right now. A branch
      // with no movement yet reads 0.000, not the shop's total.
      scopedBalanceKwd: chosenBranch
        ? (branchBalances.byBranch[chosenBranch] ?? "0.000")
        : branchBalances.totalKwd,
      scopedBranchId: chosenBranch,
      branchBalances: branchBalances.byBranch,
      // Payouts, top-ups and corrections belong to the shop, not to a counter.
      // Named rather than hidden, so branch figures plus this equal the total.
      unallocatedKwd: branchBalances.unallocatedKwd,
      // Revision 11 (#2). The client asked what the unallocated figure was for.
      // It is the net of every posting with no order behind it, so the card
      // lists what those postings were rather than leaving a bare number.
      unallocatedByType: branchBalances.unallocatedByType,
      suggestedTopUpKwd: suggestion.amountKwd,
      outstandingKwd: suggestion.outstandingKwd,
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
router.get("/wallet/entries", requireVendorTab("WALLET"), async (req: Request, res: Response) => {
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

// ─── Top-up (revision 10, #2) ────────────────────────────────────────────────
//
// The old flow was a modal telling the shop to make a bank transfer quoting its
// shop code, and somebody at Darb reconciling it by hand. The client asked for
// a suggested amount, an editable field, and a link that takes the payment.

const topUpSchema = z.object({ amountKwd: kwdAmountSchema });

router.post(
  "/wallet/top-up",
  requireVendorTab("WALLET"),
  validateBody(topUpSchema),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, vendorId, userId } = req.user!;
      const topUp = await createTopUp({
        tenantId,
        vendorId: vendorId!,
        amountKwd: (req.body as z.infer<typeof topUpSchema>).amountKwd as string,
        requestedById: userId,
      });
      res.status(201).json(topUp);
    } catch (err: any) {
      if (err instanceof TopUpError) { res.status(400).json({ error: err.message }); return; }
      res.status(500).json({ error: err?.message ?? "Unexpected error" });
    }
  },
);

/** The shop's own top-up history, so an unpaid link can be reopened or dropped. */
router.get("/wallet/top-ups", requireVendorTab("WALLET"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const rows = await prisma.vendorTopUp.findMany({
      where: { tenantId, vendorId: vendorId! },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, amountKwd: true, status: true, reference: true,
        paymentUrl: true, provider: true, paidAt: true, createdAt: true,
      },
    });
    res.json(
      rows.map((r) => ({ ...r, amountKwd: fmtKwd(r.amountKwd) })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/wallet/top-ups/:id/cancel", requireVendorTab("WALLET"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    // Ownership check first: a foreign id must look like a plain 404.
    const owned = await prisma.vendorTopUp.findFirst({
      where: { id: req.params.id, tenantId, vendorId: vendorId! },
      select: { id: true },
    });
    if (!owned) { res.status(404).json({ error: "Top-up not found" }); return; }

    const cancelled = await cancelTopUp(tenantId, req.params.id);
    if (!cancelled) {
      res.status(409).json({ error: "This top-up has already been paid" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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
router.post("/quote", requireVendorTab("ORDERS"), validateBody(vendorQuoteSchema), async (req: Request, res: Response) => {
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
router.post("/orders/:id/refund-request", requireVendorTab("WALLET"), async (req: Request, res: Response) => {
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
router.get("/refunds", requireVendorTab("WALLET"), async (req: Request, res: Response) => {
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
router.get("/statements", requireVendorTab("WALLET"), async (req: Request, res: Response) => {
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


// ─── Support (revision 8, edit 6) ────────────────────────────────────────────

/**
 * A shop's support requests.
 *
 * Open to all three shop roles. Order tracking especially: following
 * deliveries and reporting when one goes wrong is the whole job, and that role
 * cannot see money or settings, so support is the only channel it has.
 */
const supportTicketSchema = z.object({
  // Revision 9 (#6). The four kinds the client named. Typing a request is what
  // lets Darb route it: an order complaint and a failed payment do not go to
  // the same desk.
  type: z.enum(["ORDER", "WALLET", "TECHNICAL", "OTHER"]).default("OTHER"),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  orderId: z.string().min(1).optional().nullable(),
});

router.get("/support", requireVendorTab("SUPPORT"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    // Deliberately not branch-scoped, even for a pinned tracker: a ticket
    // belongs to the shop, and the client asked that an owner see every one of
    // them regardless of which branch the board is currently filtered to.
    const tickets = await prisma.supportTicket.findMany({
      where: {
        tenantId,
        vendorId: vendorId!,
        ...(typeof req.query.type === "string" && req.query.type ? { type: req.query.type as any } : {}),
        ...(typeof req.query.status === "string" && req.query.status
          ? { status: req.query.status as any }
          : {}),
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    // Revision 11 (#4). A shop's Support inbox is shared across its whole team,
    // so every message reading "YOU" told an owner nothing about which of their
    // people raised a request or withdrew one. createdById was already stored
    // and never surfaced; SupportTicket has no relation to User to include, so
    // the names come from one lookup over the ids on this page.
    const creatorIds = [
      ...new Set(tickets.map((tk) => tk.createdById).filter((id): id is string => !!id)),
    ];
    const creators = new Map<string, string>();
    if (creatorIds.length > 0) {
      const rows = await prisma.user.findMany({
        where: { id: { in: creatorIds }, tenantId },
        select: { id: true, name: true, email: true },
      });
      for (const u of rows) creators.set(u.id, u.name?.trim() || u.email);
    }

    res.json(
      tickets.map((tk) => ({
        ...tk,
        createdByName: tk.createdById ? (creators.get(tk.createdById) ?? null) : null,
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/support",
  requireVendorTab("SUPPORT"),
  validateBody(supportTicketSchema),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, vendorId, userId } = req.user!;
      const { type, subject, body, orderId } = req.body;

      // An order reference is only meaningful if it is this shop's order.
      if (orderId) {
        const order = await prisma.deliveryOrder.findFirst({
          where: { id: orderId, tenantId, vendorId: vendorId! },
          select: { id: true },
        });
        if (!order) { res.status(400).json({ error: "Order not found" }); return; }
      }

      const ticket = await prisma.supportTicket.create({
        data: {
          tenantId,
          vendorId: vendorId!,
          createdById: userId,
          type,
          subject,
          orderId: orderId ?? null,
          // The person's name, not their login: an owner reading the thread
          // wants to know who asked, and b@b.com does not answer that.
          messages: { create: { tenantId, author: "VENDOR", authorName: actorNameOf(req), body } },
        },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      res.status(201).json(ticket);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

/** Add a reply to a ticket this shop owns, and reopen it if Darb had answered. */
router.post("/support/:id/reply", requireVendorTab("SUPPORT"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) { res.status(400).json({ error: "Message is required" }); return; }

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id, tenantId, vendorId: vendorId! },
      select: { id: true, status: true },
    });
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    if (ticket.status === "RESOLVED" || ticket.status === "CANCELLED") {
      res.status(409).json({ error: "This request is closed. Raise a new one." });
      return;
    }

    await prisma.supportTicketMessage.create({
      data: { tenantId, ticketId: ticket.id, author: "VENDOR", authorName: actorNameOf(req), body },
    });
    // A reply from the shop puts the ball back in Darb's court.
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "OPEN" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Withdraw a request (revision 10, #5).
 *
 * A shop that raised something and then sorted it out itself had no way to say
 * so: the request sat waiting on Darb, and the only way it ever closed was
 * somebody at Darb answering a question nobody needed answering any more.
 *
 * CANCELLED rather than RESOLVED on purpose. Resolved means Darb dealt with it,
 * and folding the two together would flatter Darb's own response figures with
 * requests it never touched. A note goes on the thread so the record says who
 * withdrew it, and Darb can still read the history.
 */
router.post("/support/:id/cancel", requireVendorTab("SUPPORT"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id, tenantId, vendorId: vendorId! },
      select: { id: true, status: true },
    });
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    if (ticket.status === "RESOLVED") {
      res.status(409).json({ error: "Darb has already closed this request." });
      return;
    }
    if (ticket.status === "CANCELLED") {
      res.status(409).json({ error: "This request is already cancelled." });
      return;
    }

    // Status-guarded, same as every other transition in this codebase: two
    // people cancelling the same request at once must not both win.
    const claimed = await prisma.supportTicket.updateMany({
      where: { id: ticket.id, tenantId, vendorId: vendorId!, status: { in: ["OPEN", "ANSWERED"] } },
      data: { status: "CANCELLED" },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "This request has just changed. Reload and try again." });
      return;
    }

    await prisma.supportTicketMessage.create({
      data: {
        tenantId,
        ticketId: ticket.id,
        author: "VENDOR",
        authorName: actorNameOf(req),
        // Revision 11 (#4). The note used to say "the shop" and nothing else,
        // which on a shared inbox is exactly the question the client asked:
        // which of our people withdrew this? The name goes in the record, not
        // only on the bubble, so it survives into Darb's own view of the thread.
        body: reason
          ? `Request cancelled by ${actorNameOf(req)}: ${reason}`
          : `Request cancelled by ${actorNameOf(req)}.`,
      },
    });

    const updated = await prisma.supportTicket.findFirst({
      where: { id: ticket.id, tenantId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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
  // Revision 10 (#6). Omit to inherit the role's tabs, which is what every
  // login did before this existed. An explicit list narrows or widens it.
  vendorTabs: z.array(z.enum(VENDOR_TABS)).optional().nullable(),
});

// Revision 11 (#9). Reading the roster follows the TEAM tab alone. The OWNER
// gate that used to sit here as well made an explicit grant unusable: an owner
// ticked Team for their accountant and the screen 403'd, which is the same
// complaint as the rail entry that never appeared. Creating, editing and
// deactivating logins below stay OWNER-only, because those are the capability
// that could be turned on itself — reading who has an account is not.
router.get("/team", requireVendorTab("TEAM"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const users = await prisma.user.findMany({
      where: { tenantId, vendorId: vendorId!, role: "VENDOR" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, email: true, name: true, phone: true, vendorRole: true,
        branchId: true, isActive: true, createdAt: true, vendorTabs: true,
        branch: { select: { id: true, name: true } },
      },
    });
    // Both figures: what was actually saved (null = inherit) and what the login
    // opens today. The page needs the first to show the checkboxes honestly and
    // the second to say which tabs the person really has.
    res.json(
      users.map((u) => ({
        ...u,
        vendorTabs: parseVendorTabs(u.vendorTabs),
        effectiveTabs: effectiveVendorTabs(u.vendorRole, u.vendorTabs),
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/team",
  requireVendorRole("OWNER"),
  requireVendorTab("TEAM"),
  validateBody(vendorTeamUserSchema),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, vendorId, userId } = req.user!;
      const { email, password, name, phone, vendorRole, branchId, vendorTabs } = req.body;

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
          vendorTabs: Array.isArray(vendorTabs) ? (vendorTabs as string[]) : undefined,
        },
        select: {
          id: true, email: true, name: true, phone: true, vendorRole: true,
          branchId: true, isActive: true, createdAt: true, vendorTabs: true,
        },
      });
      res.status(201).json({
        ...user,
        vendorTabs: parseVendorTabs(user.vendorTabs),
        effectiveTabs: effectiveVendorTabs(user.vendorRole, user.vendorTabs),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.patch("/team/:id", requireVendorRole("OWNER"), requireVendorTab("TEAM"), async (req: Request, res: Response) => {
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
    // Revision 10 (#6). null resets the user to their role's own tabs; a list
    // replaces it. Absent leaves whatever is stored alone, so a PATCH that only
    // flips isActive does not quietly wipe somebody's tab list.
    if ("vendorTabs" in req.body) {
      const tabs = readTabsInput(req.body.vendorTabs);
      if (tabs !== undefined) data.vendorTabs = tabs === null ? Prisma.DbNull : tabs;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true, email: true, name: true, phone: true, vendorRole: true,
        branchId: true, isActive: true, createdAt: true, vendorTabs: true,
      },
    });
    res.json({
      ...user,
      vendorTabs: parseVendorTabs(user.vendorTabs),
      effectiveTabs: effectiveVendorTabs(user.vendorRole, user.vendorTabs),
    });
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
router.get("/analytics", requireVendorTab("GROW"), async (req: Request, res: Response) => {
  try {
    const { tenantId, vendorId } = req.user!;
    const to = typeof req.query.to === "string" ? new Date(`${req.query.to}T23:59:59.999`) : new Date();
    const from =
      typeof req.query.from === "string"
        ? new Date(`${req.query.from}T00:00:00.000`)
        : new Date(to.getTime() - 30 * 86_400_000);
    // Revision 11 (#5). This read its own ?branchId= rather than going through
    // scopedBranchId, so a tracker pinned to one counter could see the whole
    // shop's numbers here while every other screen fenced them correctly.
    const branchId = scopedBranchId(req);

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
        // Revision 10 (#4) — the handover wait. arrivedAt is stamped when the
        // driver reaches the shop, pickedUpAt when the shop hands the order
        // over, so the gap between them is the shop's own preparation time.
        arrivedAt: true,
        pickedUpAt: true,
        createdAt: true,
      },
      take: 10_000,
    });

    let revenue = 0;
    // Only orders where the driver's arrival and the handover were both stamped
    // can say anything about preparation. Historical rows predating arrivedAt
    // simply do not count towards the average rather than dragging it to zero.
    let prepMinutes = 0;
    let prepSample = 0;
    // Revision 11 (#3). arrivedAt only exists once a driver reports reaching
    // the shop, and a driver who taps picked-up straight from assigned never
    // stamps it — so on a real shop's history the card above read n/a forever
    // and the client asked for it to be filled. This is the wider measure that
    // every delivered order can answer: order placed → order left with a
    // driver. It is NOT the same number, so it is a separate field with its own
    // label rather than being averaged into the one above.
    let handoverMinutes = 0;
    let handoverSample = 0;
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
      if (o.arrivedAt && o.pickedUpAt) {
        const waited = (o.pickedUpAt.getTime() - o.arrivedAt.getTime()) / 60_000;
        // A negative gap means the two stamps landed out of order, which is a
        // data fault rather than a shop that handed over before arriving.
        if (waited >= 0) {
          prepMinutes += waited;
          prepSample += 1;
        }
      }
      if (o.pickedUpAt) {
        const elapsed = (o.pickedUpAt.getTime() - o.createdAt.getTime()) / 60_000;
        if (elapsed >= 0) {
          handoverMinutes += elapsed;
          handoverSample += 1;
        }
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
      // Revision 10 (#4). Null rather than 0 when nothing measurable happened:
      // "no data yet" and "we are handing over instantly" are different claims.
      avgPrepMinutes: prepSample > 0 ? Number((prepMinutes / prepSample).toFixed(1)) : null,
      prepSampleSize: prepSample,
      // The fallback the card falls back TO, not a replacement: order placed to
      // order collected, which every delivered order can answer.
      avgHandoverMinutes:
        handoverSample > 0 ? Number((handoverMinutes / handoverSample).toFixed(1)) : null,
      handoverSampleSize: handoverSample,
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
