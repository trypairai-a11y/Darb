import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { parseLocalDate } from "../utils/date";

const MUTATORS = ["ADMIN", "OPS_MANAGER"];
const DESTRUCTIVE = ["ADMIN"];

const router = Router();
router.use(authMiddleware, tenantScope);

// GET /api/americana/rates
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { chainId, vehicleType } = req.query;
    const where: any = { tenantId };
    if (chainId) where.chainId = chainId as string;
    if (vehicleType) where.vehicleType = vehicleType as string;
    const rates = await prisma.americanaChainRate.findMany({
      where,
      orderBy: [{ chainId: "asc" }, { vehicleType: "asc" }, { effectiveFrom: "desc" }],
      include: {
        chain: { select: { id: true, name: true, slug: true } },
        contract: { select: { id: true, contractRef: true } },
      },
    });
    res.json(rates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/americana/rates
router.post("/", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { chainId, vehicleType, ratePerOrder, effectiveFrom, effectiveTo, contractId } = req.body;
    if (!chainId || !vehicleType || ratePerOrder == null || !effectiveFrom) {
      res.status(400).json({ error: "chainId, vehicleType, ratePerOrder, effectiveFrom required" });
      return;
    }
    const rate = await prisma.americanaChainRate.create({
      data: {
        tenantId, chainId, vehicleType,
        ratePerOrder,
        effectiveFrom: parseLocalDate(effectiveFrom),
        effectiveTo: effectiveTo ? parseLocalDate(effectiveTo) : null,
        contractId: contractId || null,
        createdBy: req.user!.userId,
      },
    });
    res.status(201).json(rate);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/americana/rates/:id
router.put("/:id", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { ratePerOrder, effectiveFrom, effectiveTo, contractId, vehicleType } = req.body;
    const data: any = {};
    if (ratePerOrder != null) data.ratePerOrder = ratePerOrder;
    if (effectiveFrom) data.effectiveFrom = parseLocalDate(effectiveFrom);
    if (effectiveTo !== undefined) data.effectiveTo = effectiveTo ? parseLocalDate(effectiveTo) : null;
    if (contractId !== undefined) data.contractId = contractId || null;
    if (vehicleType) data.vehicleType = vehicleType;
    const result = await prisma.americanaChainRate.updateMany({
      where: { id: req.params.id, tenantId },
      data,
    });
    if (result.count === 0) { res.status(404).json({ error: "Rate not found" }); return; }
    const updated = await prisma.americanaChainRate.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/americana/rates/:id
router.delete("/:id", rbac(...DESTRUCTIVE), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const result = await prisma.americanaChainRate.deleteMany({
      where: { id: req.params.id, tenantId },
    });
    if (result.count === 0) { res.status(404).json({ error: "Rate not found" }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/americana/rates/lookup?chainId=...&vehicleType=...&date=YYYY-MM-DD
router.get("/lookup/resolve", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { chainId, vehicleType, date } = req.query;
    if (!chainId || !vehicleType || !date) {
      res.status(400).json({ error: "chainId, vehicleType, date required" });
      return;
    }
    const d = parseLocalDate(date as string);
    const rate = await prisma.americanaChainRate.findFirst({
      where: {
        tenantId,
        chainId: chainId as string,
        vehicleType: vehicleType as string,
        effectiveFrom: { lte: d },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: d } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    res.json(rate ?? null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
