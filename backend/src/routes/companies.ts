import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { rbac } from "../middleware/rbac";
import { validateBody } from "../utils/validate";
import { z } from "zod";

const router = Router();
router.use(authMiddleware, tenantScope);

const MUTATORS = ["ADMIN", "OPS_MANAGER"];
const DESTRUCTIVE = ["ADMIN"];

const companySchema = z.object({
  name: z.string().min(1, "Company name is required").max(200),
  // Platform is no longer collected in the UI (revision #16 removed the column
  // and the picker). It stays on the model for the legacy platform reports, so
  // creation defaults it rather than demanding it.
  platform: z.enum(["TALABAT", "KEETA", "DELIVEROO", "AMERICANA"]).optional(),
  // Revision #21 — vendor/fleet classification.
  kind: z.enum(["FLEET", "VENDOR"]).optional(),
  // Revision #20 — the assigned internal Darb account manager.
  accountManagerId: z.string().uuid().nullish(),
  // Revision #15/#27 — commonly-owned company grouping.
  ownerGroupId: z.string().uuid().nullish(),
  contactPerson: z.string().max(200).optional(),
  contactPhone: z.string().max(20).optional(),
  contactEmail: z.string().email().max(200).optional(),
  isActive: z.boolean().optional(),
});

/**
 * @swagger
 * /api/companies:
 *   get:
 *     tags: [Companies]
 *     summary: List companies with pagination
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated company list with driver count
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const where: any = { tenantId };
    if (req.query.platform) where.platform = req.query.platform;
    if (req.query.kind) where.kind = req.query.kind;

    const [data, total] = await Promise.all([
      prisma.company.findMany({
        where, skip, take: limit,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { drivers: true } },
          accountManager: { select: { id: true, name: true } },
          ownerGroup: { select: { id: true, name: true } },
        },
      }),
      prisma.company.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/companies/{id}:
 *   get:
 *     tags: [Companies]
 *     summary: Get a single company by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Company detail with driver and vehicle counts
 *       404:
 *         description: Company not found
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const company = await prisma.company.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { _count: { select: { drivers: true, vehicles: true } } },
    });
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }
    res.json(company);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/companies:
 *   post:
 *     tags: [Companies]
 *     summary: Create a new company
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, platform]
 *             properties:
 *               name: { type: string }
 *               platform: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *               contactPerson: { type: string }
 *               contactPhone: { type: string }
 *               contactEmail: { type: string, format: email }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created company
 */
router.post("/", rbac(...MUTATORS), validateBody(companySchema.passthrough()), async (req: Request, res: Response) => {
  try {
    const company = await prisma.company.create({
      data: {
        ...req.body,
        platform: req.body.platform ?? "KEETA",
        tenantId: req.user!.tenantId,
      },
    });
    res.status(201).json(company);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/companies/{id}:
 *   put:
 *     tags: [Companies]
 *     summary: Update a company
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated company
 *       404:
 *         description: Company not found
 */
router.put("/:id", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const { name, platform, licenseCount, isActive, kind, accountManagerId, ownerGroupId } =
      req.body ?? {};
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (platform !== undefined) data.platform = platform;
    if (licenseCount !== undefined) data.licenseCount = licenseCount;
    if (isActive !== undefined) data.isActive = isActive;
    if (kind !== undefined) data.kind = kind;
    // Empty string from a cleared <select> means "unassign", not "skip".
    if (accountManagerId !== undefined) {
      if (accountManagerId) {
        // The account manager is internal Darb staff. A VENDOR or FLEET portal
        // account must never end up owning a company record.
        const manager = await prisma.user.findFirst({
          where: {
            id: accountManagerId,
            tenantId: req.user!.tenantId,
            role: { notIn: ["VENDOR", "FLEET"] },
          },
          select: { id: true },
        });
        if (!manager) {
          res.status(400).json({ error: "Account manager must be an internal Darb user" });
          return;
        }
      }
      data.accountManagerId = accountManagerId || null;
    }
    if (ownerGroupId !== undefined) data.ownerGroupId = ownerGroupId || null;
    const company = await prisma.company.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data,
    });
    if (company.count === 0) { res.status(404).json({ error: "Company not found" }); return; }
    const updated = await prisma.company.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/companies/{id}:
 *   delete:
 *     tags: [Companies]
 *     summary: Delete a company
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deletion confirmation
 */
router.delete("/:id", rbac(...DESTRUCTIVE), async (req: Request, res: Response) => {
  try {
    await prisma.company.deleteMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    res.json({ message: "Company deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
