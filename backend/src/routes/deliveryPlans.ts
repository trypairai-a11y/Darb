/**
 * /api/delivery-plans — revision 4 (#7).
 *
 * Named, reusable price lists that a merchant is assigned to from its vendor
 * profile. A plan is by zone or by kilometre, never both. Rates are replaced
 * wholesale rather than patched cell by cell: a price grid is one document in
 * the user's head, and a per-cell API turns a half-finished edit into a
 * half-priced plan.
 *
 * Blank means unserviceable throughout. A by-zone pair the client omits gets no
 * row; a by-km band the client leaves blank gets a row with a null fee. Both
 * read back as UNSERVICEABLE_PAIR in pricingService.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { validateBody } from "../utils/validate";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { Prisma } from "../generated/prisma";

const PLAN_EDITORS = ["ADMIN", "OPS_MANAGER"];

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── Schemas ────────────────────────────────────────────────────────────────

const money = z
  .union([z.number(), z.string()])
  .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, "Must be a non-negative amount");

const zoneRateSchema = z.object({
  originZoneId: z.string().uuid(),
  destZoneId: z.string().uuid(),
  feeKwd: money,
});

const kmTierSchema = z.object({
  // null = the open-ended top band ("14+ km").
  maxKm: z.union([z.number().positive(), z.string()]).nullable(),
  // null = this band is not served (the client's blank cell).
  feeKwd: money.nullable(),
});

const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["ZONE", "KM"]),
});

const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});

const ratesSchema = z.object({
  zoneRates: z.array(zoneRateSchema).optional(),
  kmTiers: z.array(kmTierSchema).optional(),
});

// ─── Serialisers ────────────────────────────────────────────────────────────

const kwd = (v: Prisma.Decimal | null | undefined) =>
  v == null ? null : new Prisma.Decimal(v as unknown as Prisma.Decimal.Value).toFixed(3);

function serialisePlan(plan: any) {
  return {
    id: plan.id,
    name: plan.name,
    type: plan.type,
    isActive: plan.isActive,
    vendorCount: plan._count?.vendors ?? 0,
    zoneRates: (plan.zoneRates ?? []).map((r: any) => ({
      originZoneId: r.originZoneId,
      destZoneId: r.destZoneId,
      feeKwd: kwd(r.feeKwd),
    })),
    kmTiers: (plan.kmTiers ?? []).map((t: any) => ({
      id: t.id,
      sortOrder: t.sortOrder,
      maxKm: t.maxKm == null ? null : Number(t.maxKm),
      feeKwd: kwd(t.feeKwd),
    })),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/delivery-plans:
 *   get:
 *     tags: [Delivery plans]
 *     summary: List delivery plans
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const where = { tenantId: req.user!.tenantId };
    const [rows, total] = await Promise.all([
      prisma.deliveryPlan.findMany({
        where,
        include: { kmTiers: { orderBy: { sortOrder: "asc" } }, _count: { select: { vendors: true } } },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.deliveryPlan.count({ where }),
    ]);
    return res.json(paginatedResponse(rows.map(serialisePlan), total, page, limit));
  } catch (error) {
    return res.status(500).json({ error: "Failed to list delivery plans" });
  }
});

/**
 * @openapi
 * /api/delivery-plans/{id}:
 *   get:
 *     tags: [Delivery plans]
 *     summary: One plan with its full rate table
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const plan = await prisma.deliveryPlan.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        zoneRates: true,
        kmTiers: { orderBy: { sortOrder: "asc" } },
        _count: { select: { vendors: true } },
      },
    });
    if (!plan) return res.status(404).json({ error: "Delivery plan not found" });
    return res.json(serialisePlan(plan));
  } catch (error) {
    return res.status(500).json({ error: "Failed to load delivery plan" });
  }
});

/**
 * @openapi
 * /api/delivery-plans:
 *   post:
 *     tags: [Delivery plans]
 *     summary: Create a delivery plan
 */
router.post(
  "/",
  rbac(...PLAN_EDITORS),
  validateBody(createPlanSchema),
  async (req: Request, res: Response) => {
    try {
      const { name, type } = req.body as z.infer<typeof createPlanSchema>;
      const plan = await prisma.deliveryPlan.create({
        data: { tenantId: req.user!.tenantId, name, type },
        include: { kmTiers: true, _count: { select: { vendors: true } } },
      });
      return res.status(201).json(serialisePlan(plan));
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({ error: "A plan with that name already exists" });
      }
      return res.status(500).json({ error: "Failed to create delivery plan" });
    }
  },
);

/**
 * @openapi
 * /api/delivery-plans/{id}:
 *   put:
 *     tags: [Delivery plans]
 *     summary: Rename or deactivate a plan
 */
router.put(
  "/:id",
  rbac(...PLAN_EDITORS),
  validateBody(updatePlanSchema),
  async (req: Request, res: Response) => {
    try {
      const body = req.body as z.infer<typeof updatePlanSchema>;
      const updated = await prisma.deliveryPlan.updateMany({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });
      if (updated.count === 0) return res.status(404).json({ error: "Delivery plan not found" });

      const plan = await prisma.deliveryPlan.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
        include: {
          zoneRates: true,
          kmTiers: { orderBy: { sortOrder: "asc" } },
          _count: { select: { vendors: true } },
        },
      });
      return res.json(serialisePlan(plan));
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({ error: "A plan with that name already exists" });
      }
      return res.status(500).json({ error: "Failed to update delivery plan" });
    }
  },
);

/**
 * @openapi
 * /api/delivery-plans/{id}/rates:
 *   put:
 *     tags: [Delivery plans]
 *     summary: Replace a plan's rate table wholesale
 */
router.put(
  "/:id/rates",
  rbac(...PLAN_EDITORS),
  validateBody(ratesSchema),
  async (req: Request, res: Response) => {
    try {
      const plan = await prisma.deliveryPlan.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
        select: { id: true, type: true },
      });
      if (!plan) return res.status(404).json({ error: "Delivery plan not found" });

      const { zoneRates, kmTiers } = req.body as z.infer<typeof ratesSchema>;
      if (plan.type === "ZONE" && !zoneRates) {
        return res.status(400).json({ error: "A by-zone plan needs zoneRates" });
      }
      if (plan.type === "KM" && !kmTiers) {
        return res.status(400).json({ error: "A by-kilometre plan needs kmTiers" });
      }

      // Replace-in-a-transaction: a plan is never half-priced, even if the
      // request dies partway through.
      await prisma.$transaction(async (tx) => {
        if (plan.type === "ZONE") {
          await tx.deliveryPlanZoneRate.deleteMany({ where: { planId: plan.id } });
          if (zoneRates!.length > 0) {
            await tx.deliveryPlanZoneRate.createMany({
              data: zoneRates!.map((r) => ({
                tenantId: req.user!.tenantId,
                planId: plan.id,
                originZoneId: r.originZoneId,
                destZoneId: r.destZoneId,
                feeKwd: new Prisma.Decimal(String(r.feeKwd)),
              })),
            });
          }
        } else {
          await tx.deliveryPlanKmTier.deleteMany({ where: { planId: plan.id } });
          if (kmTiers!.length > 0) {
            await tx.deliveryPlanKmTier.createMany({
              data: kmTiers!.map((t, i) => ({
                tenantId: req.user!.tenantId,
                planId: plan.id,
                sortOrder: i,
                maxKm: t.maxKm == null ? null : new Prisma.Decimal(String(t.maxKm)),
                feeKwd: t.feeKwd == null ? null : new Prisma.Decimal(String(t.feeKwd)),
              })),
            });
          }
        }
      });

      const fresh = await prisma.deliveryPlan.findFirst({
        where: { id: plan.id, tenantId: req.user!.tenantId },
        include: {
          zoneRates: true,
          kmTiers: { orderBy: { sortOrder: "asc" } },
          _count: { select: { vendors: true } },
        },
      });
      return res.json(serialisePlan(fresh));
    } catch (error) {
      return res.status(500).json({ error: "Failed to save plan rates" });
    }
  },
);

/**
 * @openapi
 * /api/delivery-plans/{id}:
 *   delete:
 *     tags: [Delivery plans]
 *     summary: Delete a plan no vendor is using
 */
router.delete("/:id", rbac(...PLAN_EDITORS), async (req: Request, res: Response) => {
  try {
    const plan = await prisma.deliveryPlan.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { _count: { select: { vendors: true } } },
    });
    if (!plan) return res.status(404).json({ error: "Delivery plan not found" });
    if (plan._count.vendors > 0) {
      // Deleting would silently reprice those merchants on the tenant-wide
      // fallback. Make the caller unassign them first, deliberately.
      return res.status(409).json({
        error: `${plan._count.vendors} vendor(s) are on this plan. Move them to another plan first.`,
      });
    }
    await prisma.deliveryPlan.delete({ where: { id: plan.id } });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete delivery plan" });
  }
});

export default router;
