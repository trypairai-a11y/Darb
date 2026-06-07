import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";

const MUTATORS = ["ADMIN", "OPS_MANAGER"];
const DESTRUCTIVE = ["ADMIN"];

const router = Router();
router.use(authMiddleware, tenantScope);

function slugify(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// GET /api/americana/chains
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { active } = req.query;
    const where: any = { tenantId };
    if (active === "true") where.active = true;
    if (active === "false") where.active = false;
    const chains = await prisma.americanaChain.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { stores: true, rates: true } } },
    });
    res.json(chains);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/americana/chains/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const chain = await prisma.americanaChain.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { stores: true, rates: true },
    });
    if (!chain) { res.status(404).json({ error: "Chain not found" }); return; }
    res.json(chain);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/americana/chains
router.post("/", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { name, slug, logoUrl, active } = req.body;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const chain = await prisma.americanaChain.create({
      data: {
        tenantId,
        name,
        slug: slug || slugify(name),
        logoUrl: logoUrl || null,
        active: active ?? true,
      },
    });
    res.status(201).json(chain);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/americana/chains/:id
router.put("/:id", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { name, slug, logoUrl, active } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (slug !== undefined) data.slug = slug;
    if (logoUrl !== undefined) data.logoUrl = logoUrl;
    if (active !== undefined) data.active = active;
    const result = await prisma.americanaChain.updateMany({
      where: { id: req.params.id, tenantId },
      data,
    });
    if (result.count === 0) { res.status(404).json({ error: "Chain not found" }); return; }
    const updated = await prisma.americanaChain.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/americana/chains/:id (soft delete)
router.delete("/:id", rbac(...DESTRUCTIVE), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const result = await prisma.americanaChain.updateMany({
      where: { id: req.params.id, tenantId },
      data: { active: false },
    });
    if (result.count === 0) { res.status(404).json({ error: "Chain not found" }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
