import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";

const MUTATORS = ["ADMIN", "OPS_MANAGER"];
const DESTRUCTIVE = ["ADMIN"];

const router = Router();
router.use(authMiddleware, tenantScope);

// GET /api/americana/stores
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { chainId, active, area } = req.query;
    const where: any = { tenantId };
    if (chainId) where.chainId = chainId as string;
    if (area) where.area = area as string;
    if (active === "true") where.active = true;
    if (active === "false") where.active = false;

    const stores = await prisma.americanaStore.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        chain: { select: { id: true, name: true, slug: true } },
      },
    });
    res.json(stores);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/americana/stores/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const store = await prisma.americanaStore.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        chain: true,
        assignments: {
          orderBy: { month: "desc" },
          take: 50,
          include: { driver: { select: { id: true, name: true, phone: true } } },
        },
      },
    });
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    res.json(store);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/americana/stores
router.post("/", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      chainId, name, area,
      managerName, managerPhone,
      backupContactName, backupContactPhone, notes, active,
      carDailyTarget, bikeDailyTarget, carMonthlyTarget, bikeMonthlyTarget,
    } = req.body;
    if (!chainId || !name) { res.status(400).json({ error: "chainId and name required" }); return; }
    const store = await prisma.americanaStore.create({
      data: {
        tenantId, chainId, name, area,
        managerName, managerPhone,
        backupContactName, backupContactPhone, notes,
        active: active ?? true,
        carDailyTarget: carDailyTarget != null ? Number(carDailyTarget) : null,
        bikeDailyTarget: bikeDailyTarget != null ? Number(bikeDailyTarget) : null,
        carMonthlyTarget: carMonthlyTarget != null ? Number(carMonthlyTarget) : null,
        bikeMonthlyTarget: bikeMonthlyTarget != null ? Number(bikeMonthlyTarget) : null,
      },
    });
    res.status(201).json(store);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/americana/stores/:id
router.put("/:id", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const allowed = [
      "chainId", "name", "area",
      "managerName", "managerPhone",
      "backupContactName", "backupContactPhone", "notes", "active",
      "carDailyTarget", "bikeDailyTarget", "carMonthlyTarget", "bikeMonthlyTarget",
    ] as const;
    const data: Record<string, any> = {};
    for (const k of allowed) {
      if (k in req.body) {
        const v = (req.body as any)[k];
        if (k === "carDailyTarget" || k === "bikeDailyTarget" || k === "carMonthlyTarget" || k === "bikeMonthlyTarget") {
          data[k] = v == null || v === "" ? null : Number(v);
        } else {
          data[k] = v;
        }
      }
    }
    const result = await prisma.americanaStore.updateMany({
      where: { id: req.params.id, tenantId },
      data,
    });
    if (result.count === 0) { res.status(404).json({ error: "Store not found" }); return; }
    const updated = await prisma.americanaStore.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/americana/stores/:id (soft delete)
router.delete("/:id", rbac(...DESTRUCTIVE), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const result = await prisma.americanaStore.updateMany({
      where: { id: req.params.id, tenantId },
      data: { active: false },
    });
    if (result.count === 0) { res.status(404).json({ error: "Store not found" }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
