import { Router, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { validateBody } from "../utils/validate";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { pointInBbox, Bbox } from "../utils/geo";

/**
 * Staff-facing vendor management (Darb 2.0, plan §A8 /api/vendors).
 * Mutations restricted to ADMIN/OPS_MANAGER; vendor-user creation to ADMIN.
 *
 * Wallet reads here are DIRECT WalletAccount/WalletEntry queries by design —
 * the wallet engine (services/wallet/) is a parallel track and must not be
 * imported from this file. Same for zone resolution: branch zoneId is
 * resolved inline (bbox prefilter + turf point-in-polygon) rather than via
 * zoneService (parallel track). Non-cached resolution is fine for admin ops.
 */

const MUTATE = ["ADMIN", "OPS_MANAGER"];

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const createVendorSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  nameAr: z.string().optional(),
  code: z
    .string()
    .min(2, "Code must be 2-10 characters")
    .max(10, "Code must be 2-10 characters")
    .regex(/^[A-Za-z0-9]+$/, "Code must be alphanumeric")
    .transform((s) => s.toUpperCase()),
  phone: z.string().optional(),
  // NOTE: Vendor has no email column (schema D1); contact email lives on the
  // vendor's portal User accounts (POST /:id/users).
  requiresCarOnly: z.boolean().optional(),
});

const updateVendorSchema = z.object({
  name: z.string().min(2).optional(),
  nameAr: z.string().nullable().optional(),
  code: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Za-z0-9]+$/, "Code must be alphanumeric")
    .transform((s) => s.toUpperCase())
    .optional(),
  phone: z.string().nullable().optional(),
  requiresCarOnly: z.boolean().optional(),
  isPaused: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const createBranchSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  nameAr: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  foodicsBranchId: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateBranchSchema = z.object({
  name: z.string().min(2).optional(),
  nameAr: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  foodicsBranchId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const createVendorUserSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtKwd = (v: unknown) => Number(v ?? 0).toFixed(3);

/**
 * Inline point-in-polygon zone resolution (bbox prefilter → exact turf test).
 * Intentionally NOT importing zoneService (parallel track); admin branch
 * writes are rare enough that an uncached query per save is acceptable.
 */
async function resolveZoneIdInline(
  tenantId: string,
  lat: number,
  lng: number
): Promise<string | null> {
  const zones = await prisma.deliveryZone.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, polygon: true, bbox: true },
  });
  const pt = point([lng, lat]);
  for (const zone of zones) {
    const bbox = zone.bbox as Bbox | null;
    if (bbox && !pointInBbox(lat, lng, bbox)) continue;
    try {
      if (booleanPointInPolygon(pt, zone.polygon as any)) return zone.id;
    } catch {
      // Malformed polygon JSON — skip the zone rather than failing the save.
    }
  }
  return null;
}

async function findTenantVendor(tenantId: string, id: string) {
  return prisma.vendor.findFirst({ where: { id, tenantId } });
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendors:
 *   get:
 *     tags: [Vendors]
 *     summary: List vendors (paginated) with branch count, pause + Foodics status
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Match against name, Arabic name, or code
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { search, isActive } = req.query;

    const where: any = { tenantId };
    if (typeof isActive === "string") where.isActive = isActive === "true";
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { nameAr: { contains: search as string, mode: "insensitive" } },
        { code: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.vendor.findMany({
        where: { ...where, tenantId },
        skip,
        take: limit,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { branches: true } },
          foodicsConnection: { select: { status: true } },
        },
      }),
      prisma.vendor.count({ where: { ...where, tenantId } }),
    ]);

    const data = rows.map((v: any) => {
      const { _count, foodicsConnection, ...vendor } = v;
      return {
        ...vendor,
        branchCount: _count?.branches ?? 0,
        // Tolerate absence of a FoodicsConnection row.
        foodicsConnected: foodicsConnection?.status === "CONNECTED",
      };
    });

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/vendors:
 *   post:
 *     tags: [Vendors]
 *     summary: Create a vendor (ADMIN/OPS_MANAGER)
 */
router.post(
  "/",
  rbac(...MUTATE),
  validateBody(createVendorSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const vendor = await prisma.vendor.create({
        data: { tenantId, ...req.body },
      });
      res.status(201).json(vendor);
    } catch (err: any) {
      if (err?.code === "P2002") {
        res.status(400).json({ error: "Vendor code already in use" });
        return;
      }
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/vendors/{id}:
 *   get:
 *     tags: [Vendors]
 *     summary: Vendor detail with branches, Foodics status, and wallet balance
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        branches: { orderBy: { name: "asc" } },
        foodicsConnection: {
          select: { status: true, orderTagId: true, lastEventAt: true },
        },
      },
    });
    if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

    // Direct WalletAccount read — do NOT route through the wallet service
    // (parallel track). ownerKey convention: "VENDOR:{vendorId}".
    const account = await prisma.walletAccount.findFirst({
      where: { tenantId, ownerKey: `VENDOR:${vendor.id}` },
    });

    const { foodicsConnection, ...rest } = vendor as any;
    res.json({
      ...rest,
      foodics: {
        connected: foodicsConnection?.status === "CONNECTED",
        status: foodicsConnection?.status ?? null,
        orderTagId: foodicsConnection?.orderTagId ?? null,
        lastEventAt: foodicsConnection?.lastEventAt ?? null,
      },
      wallet: {
        balanceKwd: fmtKwd(account?.balanceKwd),
        accountId: account?.id ?? null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/vendors/{id}:
 *   put:
 *     tags: [Vendors]
 *     summary: Update a vendor (ADMIN/OPS_MANAGER)
 */
router.put(
  "/:id",
  rbac(...MUTATE),
  validateBody(updateVendorSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const result = await prisma.vendor.updateMany({
        where: { id: req.params.id, tenantId },
        data: req.body,
      });
      if (result.count === 0) { res.status(404).json({ error: "Vendor not found" }); return; }
      const updated = await prisma.vendor.findFirst({
        where: { id: req.params.id, tenantId },
      });
      res.json(updated);
    } catch (err: any) {
      if (err?.code === "P2002") {
        res.status(400).json({ error: "Vendor code already in use" });
        return;
      }
      res.status(400).json({ error: err.message });
    }
  }
);

// ─── Branches ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendors/{id}/branches:
 *   get:
 *     tags: [Vendors]
 *     summary: List a vendor's branches
 */
router.get("/:id/branches", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const vendor = await findTenantVendor(tenantId, req.params.id);
    if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

    const branches = await prisma.vendorBranch.findMany({
      where: { tenantId, vendorId: vendor.id },
      orderBy: { name: "asc" },
      include: { zone: { select: { id: true, code: true, name: true } } },
    });
    res.json(branches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/vendors/{id}/branches:
 *   post:
 *     tags: [Vendors]
 *     summary: Create a branch; zoneId resolved point-in-polygon from lat/lng
 */
router.post(
  "/:id/branches",
  rbac(...MUTATE),
  validateBody(createBranchSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const vendor = await findTenantVendor(tenantId, req.params.id);
      if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

      const { lat, lng, ...rest } = req.body;
      const zoneId = await resolveZoneIdInline(tenantId, lat, lng);

      const branch = await prisma.vendorBranch.create({
        data: { tenantId, vendorId: vendor.id, lat, lng, zoneId, ...rest },
      });
      res.status(201).json(branch);
    } catch (err: any) {
      if (err?.code === "P2002") {
        res.status(400).json({ error: "foodicsBranchId already mapped to another branch" });
        return;
      }
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/vendors/branches/{branchId}:
 *   put:
 *     tags: [Vendors]
 *     summary: Update a branch; zoneId re-resolved when coordinates change
 */
router.put(
  "/branches/:branchId",
  rbac(...MUTATE),
  validateBody(updateBranchSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const branch = await prisma.vendorBranch.findFirst({
        where: { id: req.params.branchId, tenantId },
      });
      if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }

      const data: any = { ...req.body };
      if (req.body.lat !== undefined || req.body.lng !== undefined) {
        const lat = req.body.lat ?? (branch.lat === null ? null : Number(branch.lat));
        const lng = req.body.lng ?? (branch.lng === null ? null : Number(branch.lng));
        data.zoneId =
          lat === null || lng === null
            ? null
            : await resolveZoneIdInline(tenantId, lat, lng);
      }

      const updated = await prisma.vendorBranch.update({
        where: { id: branch.id },
        data,
      });
      res.json(updated);
    } catch (err: any) {
      if (err?.code === "P2002") {
        res.status(400).json({ error: "foodicsBranchId already mapped to another branch" });
        return;
      }
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/vendors/branches/{branchId}:
 *   delete:
 *     tags: [Vendors]
 *     summary: Delete a branch (fails with 400 if orders reference it)
 */
router.delete(
  "/branches/:branchId",
  rbac(...MUTATE),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const result = await prisma.vendorBranch.deleteMany({
        where: { id: req.params.branchId, tenantId },
      });
      if (result.count === 0) { res.status(404).json({ error: "Branch not found" }); return; }
      res.json({ ok: true });
    } catch (err: any) {
      if (err?.code === "P2003") {
        res.status(400).json({ error: "Branch has delivery orders and cannot be deleted" });
        return;
      }
      res.status(400).json({ error: err.message });
    }
  }
);

// ─── Vendor portal users ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendors/{id}/users:
 *   post:
 *     tags: [Vendors]
 *     summary: Create a VENDOR-role portal user for this vendor (ADMIN only)
 */
router.post(
  "/:id/users",
  rbac("ADMIN"),
  validateBody(createVendorUserSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const vendor = await findTenantVendor(tenantId, req.params.id);
      if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

      const { email, password, name, phone } = req.body;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) { res.status(400).json({ error: "Email already registered" }); return; }

      // Same hashing helper + cost as AuthService.register (bcryptjs, 12).
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: {
          tenantId,
          email,
          passwordHash,
          name,
          phone,
          role: "VENDOR",
          vendorId: vendor.id,
        },
        select: {
          id: true, email: true, name: true, phone: true, role: true,
          tenantId: true, vendorId: true, isActive: true, createdAt: true,
        },
      });
      res.status(201).json(user);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ─── Wallet ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendors/{id}/wallet:
 *   get:
 *     tags: [Vendors]
 *     summary: Vendor wallet account + recent ledger entries (KWD 3dp strings)
 */
router.get("/:id/wallet", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const vendor = await findTenantVendor(tenantId, req.params.id);
    if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

    const account = await prisma.walletAccount.findFirst({
      where: { tenantId, ownerKey: `VENDOR:${vendor.id}` },
    });
    if (!account) {
      res.json({ account: null, balanceKwd: "0.000", entries: [] });
      return;
    }

    const entries = await prisma.walletEntry.findMany({
      where: { tenantId, accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        transaction: {
          select: { id: true, type: true, memo: true, orderId: true, createdAt: true },
        },
      },
    });

    res.json({
      account: { id: account.id, ownerType: account.ownerType, ownerKey: account.ownerKey },
      balanceKwd: fmtKwd(account.balanceKwd),
      entries: entries.map((e: any) => ({
        id: e.id,
        direction: e.direction,
        amountKwd: fmtKwd(e.amountKwd),
        runningBalanceKwd: fmtKwd(e.runningBalanceKwd),
        createdAt: e.createdAt,
        transaction: e.transaction,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
