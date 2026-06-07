import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";

const router = Router();
router.use(authMiddleware, tenantScope);

router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const { status, search, driverId } = req.query;
    const where: any = { tenantId: req.user!.tenantId };
    if (status) where.status = status;
    if (driverId) where.driverId = driverId as string;
    if (search) {
      where.OR = [
        { phoneNumber: { contains: search as string, mode: "insensitive" } },
        { carrier: { contains: search as string, mode: "insensitive" } },
        { driver: { name: { contains: search as string, mode: "insensitive" } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.sim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          driver: { select: { id: true, name: true, phone: true, platform: true } },
          device: { select: { id: true, imei: true, model: true } },
        },
      }),
      prisma.sim.count({ where }),
    ]);

    const enriched = data.map((s) => ({
      ...s,
      assignedDriver: s.driver,
    }));

    res.json(paginatedResponse(enriched, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { phoneNumber, carrier, status, driverId, deviceId, notes } = req.body;
    if (!phoneNumber || typeof phoneNumber !== "string" || !phoneNumber.trim()) {
      res.status(400).json({ error: "phoneNumber is required" });
      return;
    }

    if (driverId) {
      const driver = await prisma.driver.findFirst({
        where: { id: driverId, tenantId: req.user!.tenantId },
      });
      if (!driver) {
        res.status(400).json({ error: "Driver not found" });
        return;
      }
    }

    if (deviceId) {
      const device = await prisma.device.findFirst({
        where: { id: deviceId, tenantId: req.user!.tenantId },
      });
      if (!device) {
        res.status(400).json({ error: "Device not found" });
        return;
      }
    }

    const sim = await prisma.sim.create({
      data: {
        tenantId: req.user!.tenantId,
        phoneNumber: phoneNumber.trim(),
        carrier: carrier || null,
        status: status || "ACTIVE",
        driverId: driverId || null,
        deviceId: deviceId || null,
        notes: notes || null,
      },
      include: {
        driver: { select: { id: true, name: true, phone: true, platform: true } },
        device: { select: { id: true, imei: true, model: true } },
      },
    });

    res.status(201).json(sim);
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "A SIM with this phone number already exists" });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const sim = await prisma.sim.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        driver: { select: { id: true, name: true, phone: true, platform: true } },
        device: { select: { id: true, imei: true, model: true } },
      },
    });
    if (!sim) {
      res.status(404).json({ error: "SIM not found" });
      return;
    }
    res.json(sim);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.sim.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) {
      res.status(404).json({ error: "SIM not found" });
      return;
    }

    const { phoneNumber, carrier, status, driverId, deviceId, notes } = req.body;

    if (driverId) {
      const driver = await prisma.driver.findFirst({
        where: { id: driverId, tenantId: req.user!.tenantId },
      });
      if (!driver) {
        res.status(400).json({ error: "Driver not found" });
        return;
      }
    }

    if (deviceId) {
      const device = await prisma.device.findFirst({
        where: { id: deviceId, tenantId: req.user!.tenantId },
      });
      if (!device) {
        res.status(400).json({ error: "Device not found" });
        return;
      }
    }

    const updated = await prisma.sim.update({
      where: { id: existing.id },
      data: {
        ...(phoneNumber !== undefined && { phoneNumber: phoneNumber.trim() }),
        ...(carrier !== undefined && { carrier: carrier || null }),
        ...(status !== undefined && { status }),
        ...(driverId !== undefined && { driverId: driverId || null }),
        ...(deviceId !== undefined && { deviceId: deviceId || null }),
        ...(notes !== undefined && { notes: notes || null }),
      },
      include: {
        driver: { select: { id: true, name: true, phone: true, platform: true } },
        device: { select: { id: true, imei: true, model: true } },
      },
    });
    res.json(updated);
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "A SIM with this phone number already exists" });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.sim.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) {
      res.status(404).json({ error: "SIM not found" });
      return;
    }
    await prisma.sim.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
