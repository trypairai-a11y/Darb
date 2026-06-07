import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { getPagination, paginatedResponse } from "../utils/pagination";

const MUTATORS = ["ADMIN", "OPS_MANAGER"];
const DESTRUCTIVE = ["ADMIN"];
const VALID_TYPES = new Set(["ONLINE_TRAINING", "VIOLATION_RECORD", "ACCOUNT_SUSPENSION", "WARNING"]);
const VALID_STATUSES = new Set(["EFFECTIVE", "COMPLETED", "OVERTURNED"]);

const router = Router();
router.use(authMiddleware, tenantScope);

/**
 * @swagger
 * /api/penalties:
 *   get:
 *     tags: [Penalties]
 *     summary: List penalties with filters and pagination
 *     parameters:
 *       - in: query
 *         name: driverId
 *         schema: { type: string }
 *       - in: query
 *         name: penaltyType
 *         schema: { type: string, enum: [ONLINE_TRAINING, VIOLATION_RECORD, ACCOUNT_SUSPENSION, WARNING] }
 *       - in: query
 *         name: penaltyStatus
 *         schema: { type: string, enum: [EFFECTIVE, COMPLETED, OVERTURNED] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by driver name
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated penalty list with driver info and violation count
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { driverId, penaltyType, penaltyStatus, search } = req.query;

    const where: any = { tenantId };
    if (driverId) where.driverId = driverId as string;
    if (penaltyType) where.penaltyType = penaltyType as string;
    if (penaltyStatus) where.penaltyStatus = penaltyStatus as string;
    if (search) where.driver = { name: { contains: search as string, mode: "insensitive" } };

    const [data, total] = await Promise.all([
      prisma.penalty.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          driver: { select: { id: true, name: true, platform: true, vehicleType: true, platformDriverId: true } },
          _count: { select: { violations: true } },
        },
      }),
      prisma.penalty.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/penalties/{id}:
 *   get:
 *     tags: [Penalties]
 *     summary: Get a single penalty with all linked violations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Penalty detail with driver and violation history
 *       404:
 *         description: Penalty not found
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const penalty = await prisma.penalty.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        driver: { select: { id: true, name: true, platform: true, vehicleType: true, platformDriverId: true } },
        violations: {
          orderBy: { violationTime: "desc" },
          include: { driver: { select: { id: true, name: true } } },
        },
      },
    });
    if (!penalty) { res.status(404).json({ error: "Penalty not found" }); return; }
    res.json(penalty);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/penalties
 * Body: { driverId, penaltyType, penaltyStatus?, penaltyValue?, violationIds?: string[] }
 */
router.post("/", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { driverId, penaltyType, penaltyStatus, penaltyValue, violationIds } = req.body ?? {};

    if (!driverId || !penaltyType) {
      res.status(400).json({ error: "driverId and penaltyType required" });
      return;
    }
    if (!VALID_TYPES.has(penaltyType)) {
      res.status(400).json({ error: `penaltyType must be one of ${[...VALID_TYPES].join(", ")}` });
      return;
    }
    if (penaltyStatus && !VALID_STATUSES.has(penaltyStatus)) {
      res.status(400).json({ error: `penaltyStatus must be one of ${[...VALID_STATUSES].join(", ")}` });
      return;
    }

    const driver = await prisma.driver.findFirst({ where: { id: driverId, tenantId }, select: { id: true } });
    if (!driver) { res.status(400).json({ error: "driver not found" }); return; }

    const ids: string[] = Array.isArray(violationIds) ? violationIds : [];
    if (ids.length > 0) {
      const owned = await prisma.violation.count({ where: { tenantId, id: { in: ids } } });
      if (owned !== ids.length) {
        res.status(400).json({ error: "one or more violationIds are not in this tenant" });
        return;
      }
    }

    const penalty = await prisma.penalty.create({
      data: {
        tenantId,
        driverId,
        penaltyType,
        penaltyStatus: penaltyStatus || "EFFECTIVE",
        penaltyValue: penaltyValue || null,
        violations: ids.length > 0 ? { connect: ids.map((id) => ({ id })) } : undefined,
      },
      include: { violations: { select: { id: true } } },
    });
    res.status(201).json(penalty);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/penalties/:id
 * Body: { penaltyStatus?, penaltyValue?, violationIds?: string[] }
 * violationIds (when provided) replaces the full set of linked violations.
 */
router.put("/:id", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const existing = await prisma.penalty.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true },
    });
    if (!existing) { res.status(404).json({ error: "Penalty not found" }); return; }

    const { penaltyStatus, penaltyValue, violationIds } = req.body ?? {};
    if (penaltyStatus && !VALID_STATUSES.has(penaltyStatus)) {
      res.status(400).json({ error: `penaltyStatus must be one of ${[...VALID_STATUSES].join(", ")}` });
      return;
    }

    const data: Record<string, unknown> = {};
    if (penaltyStatus !== undefined) data.penaltyStatus = penaltyStatus;
    if (penaltyValue !== undefined) data.penaltyValue = penaltyValue;
    if (Array.isArray(violationIds)) {
      const owned = await prisma.violation.count({ where: { tenantId, id: { in: violationIds } } });
      if (owned !== violationIds.length) {
        res.status(400).json({ error: "one or more violationIds are not in this tenant" });
        return;
      }
      data.violations = { set: violationIds.map((id: string) => ({ id })) };
    }

    const updated = await prisma.penalty.update({
      where: { id: existing.id },
      data,
      include: { violations: { select: { id: true } } },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/penalties/:id
 * Disconnects violations and removes the penalty.
 */
router.delete("/:id", rbac(...DESTRUCTIVE), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const existing = await prisma.penalty.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true },
    });
    if (!existing) { res.status(404).json({ error: "Penalty not found" }); return; }

    await prisma.$transaction([
      prisma.penalty.update({
        where: { id: existing.id },
        data: { violations: { set: [] } },
      }),
      prisma.penalty.delete({ where: { id: existing.id } }),
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
