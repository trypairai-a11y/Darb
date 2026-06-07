import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { parseLocalDate } from "../utils/date";

const MUTATORS = ["ADMIN", "OPS_MANAGER"];

const router = Router();
router.use(authMiddleware, tenantScope);

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function loadBikeWhitelist(tenantId: string): Promise<string[]> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const s = (tenant?.settings as any)?.americana;
  const list = s?.bikeAreaWhitelist;
  return Array.isArray(list) ? list : [];
}

// GET /api/americana/assignments?month=YYYY-MM&storeId=&driverId=
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { month, storeId, driverId } = req.query;
    const where: any = { tenantId };
    if (storeId) where.storeId = storeId as string;
    if (driverId) where.driverId = driverId as string;
    if (month) {
      const [y, m] = (month as string).split("-").map((v) => parseInt(v, 10));
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1);
      where.month = { gte: start, lt: end };
    }

    const assignments = await prisma.americanaStoreAssignment.findMany({
      where,
      orderBy: [{ month: "desc" }, { startDate: "desc" }],
      include: {
        driver: { select: { id: true, name: true, phone: true, vehicleType: true } },
        store: {
          select: {
            id: true, name: true, area: true,
            chain: { select: { id: true, name: true } },
          },
        },
      },
    });
    res.json(assignments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/americana/assignments
router.post("/", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      driverId, storeId, month, startDate, endDate,
      vehicleType, reasonForChange, previousAssignmentId,
    } = req.body;
    if (!driverId || !storeId || !month || !startDate || !vehicleType) {
      res.status(400).json({ error: "driverId, storeId, month, startDate, vehicleType required" });
      return;
    }

    // Load store + driver for validation
    const [driver, store, bikeWhitelist] = await Promise.all([
      prisma.driver.findFirst({ where: { id: driverId, tenantId } }),
      prisma.americanaStore.findFirst({ where: { id: storeId, tenantId } }),
      loadBikeWhitelist(tenantId),
    ]);
    if (!driver) { res.status(400).json({ error: "driver not found" }); return; }
    if (!store) { res.status(400).json({ error: "store not found" }); return; }

    // Vehicle type must match driver
    const normalized = vehicleType === "BIKE" ? "MOTORCYCLE" : vehicleType;
    if (driver.vehicleType !== normalized && driver.vehicleType !== vehicleType) {
      res.status(400).json({ error: `Driver vehicleType (${driver.vehicleType}) does not match assignment (${vehicleType})` });
      return;
    }

    // Bike radius check
    if (vehicleType === "BIKE" && bikeWhitelist.length > 0 && store.area && !bikeWhitelist.includes(store.area)) {
      res.status(400).json({ error: `Store area '${store.area}' is not in the bike whitelist` });
      return;
    }

    const monthDate = firstOfMonth(parseLocalDate(month));
    const start = parseLocalDate(startDate);

    // Auto-close any overlapping active assignment for this driver in this month
    const overlapping = await prisma.americanaStoreAssignment.findMany({
      where: {
        tenantId, driverId,
        month: monthDate,
        endDate: null,
      },
    });
    if (overlapping.length > 0) {
      await prisma.americanaStoreAssignment.updateMany({
        where: { id: { in: overlapping.map((a) => a.id) } },
        data: { endDate: new Date() },
      });
    }

    const assignment = await prisma.americanaStoreAssignment.create({
      data: {
        tenantId, driverId, storeId,
        month: monthDate,
        startDate: start,
        endDate: endDate ? parseLocalDate(endDate) : null,
        vehicleType,
        reasonForChange: reasonForChange || null,
        previousAssignmentId: previousAssignmentId || overlapping[0]?.id || null,
        createdBy: req.user!.userId,
      },
    });
    res.status(201).json(assignment);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/americana/assignments/:id
router.put("/:id", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { endDate, reasonForChange } = req.body;
    const data: any = {};
    if (endDate !== undefined) data.endDate = endDate ? parseLocalDate(endDate) : null;
    if (reasonForChange !== undefined) data.reasonForChange = reasonForChange;
    const result = await prisma.americanaStoreAssignment.updateMany({
      where: { id: req.params.id, tenantId },
      data,
    });
    if (result.count === 0) { res.status(404).json({ error: "Assignment not found" }); return; }
    const updated = await prisma.americanaStoreAssignment.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/americana/assignments/backfill-from-daily-orders
// One-time: infer assignments from existing AmericanaDailyOrders rows.
router.post("/backfill-from-daily-orders", rbac("ADMIN"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const rows = await prisma.americanaDailyOrders.findMany({
      where: { tenantId, storeId: { not: null } },
      select: { driverId: true, storeId: true, month: true, position: true },
    });
    let created = 0;
    for (const r of rows) {
      if (!r.storeId) continue;
      const vehicleType = (r.position || "").toLowerCase().includes("bike") ? "BIKE" : "CAR";
      const exists = await prisma.americanaStoreAssignment.findFirst({
        where: { tenantId, driverId: r.driverId, month: r.month },
      });
      if (exists) continue;
      await prisma.americanaStoreAssignment.create({
        data: {
          tenantId,
          driverId: r.driverId,
          storeId: r.storeId,
          month: firstOfMonth(r.month),
          startDate: firstOfMonth(r.month),
          vehicleType,
          createdBy: req.user!.userId,
        },
      });
      created++;
    }
    res.json({ created, scanned: rows.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
