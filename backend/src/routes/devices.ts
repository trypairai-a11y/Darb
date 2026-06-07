import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";

const router = Router();
router.use(authMiddleware, tenantScope);

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const { platform, companyId } = req.query;
    const where: any = {
      tenantId: req.user!.tenantId,
      driver: { tenantId: req.user!.tenantId },
    };
    if (platform) where.driver.platform = platform as string;
    if (companyId) where.driver.companyId = companyId as string;

    const [total, online, lowBattery, lost] = await Promise.all([
      prisma.device.count({ where }),
      prisma.device.count({ where: { ...where, isOnline: true } }),
      prisma.device.count({ where: { ...where, batteryLevel: { lt: 20 } } }),
      prisma.device.count({ where: { ...where, status: "LOST" } }),
    ]);

    res.json({ total, online, lowBattery, lost });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const { status, search, platform, companyId } = req.query;
    const where: any = {
      tenantId: req.user!.tenantId,
      driver: { tenantId: req.user!.tenantId },
    };
    if (platform) where.driver.platform = platform as string;
    if (companyId) where.driver.companyId = companyId as string;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { imei: { contains: search as string } },
        { model: { contains: search as string, mode: "insensitive" } },
        { driver: { name: { contains: search as string, mode: "insensitive" }, tenantId: req.user!.tenantId } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.device.findMany({
        where, skip, take: limit,
        orderBy: { lastSeen: "desc" },
        include: { driver: { select: { id: true, name: true, phone: true, platform: true, zone: true } } },
      }),
      prisma.device.count({ where }),
    ]);

    const enriched = data.map((d) => ({
      ...d,
      zone: d.driver?.zone || null,
      deviceId: d.id.slice(0, 8).toUpperCase(),
      appVersion: d.agentVersion || null,
      lastLocation: d.lastLatitude && d.lastLongitude
        ? `${Number(d.lastLatitude).toFixed(4)}, ${Number(d.lastLongitude).toFixed(4)}`
        : null,
      issuedOn: d.createdAt,
    }));

    res.json(paginatedResponse(enriched, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { imei, model, osVersion, driverId } = req.body;
    if (!imei || !model || !osVersion) {
      res.status(400).json({ error: "imei, model, and osVersion are required" });
      return;
    }

    // If driverId provided, verify it belongs to this tenant
    if (driverId) {
      const driver = await prisma.driver.findFirst({
        where: { id: driverId, tenantId: req.user!.tenantId },
      });
      if (!driver) {
        res.status(400).json({ error: "Driver not found" });
        return;
      }
    }

    const device = await prisma.device.create({
      data: {
        tenantId: req.user!.tenantId,
        imei,
        model,
        osVersion,
        driverId: driverId || null,
      },
      include: { driver: { select: { id: true, name: true, phone: true, platform: true, zone: true } } },
    });

    res.status(201).json(device);
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "A device with this IMEI already exists" });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

router.get("/map", async (req: Request, res: Response) => {
  try {
    const devices = await prisma.device.findMany({
      where: {
        tenantId: req.user!.tenantId,
        isOnline: true,
        lastLatitude: { not: null },
        lastLongitude: { not: null },
        driver: { tenantId: req.user!.tenantId },
      },
      include: { driver: { select: { id: true, name: true, platform: true, status: true } } },
    });
    res.json(devices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const device = await prisma.device.findUnique({
      where: { id: req.params.id },
      include: {
        driver: true,
        commands: { orderBy: { issuedAt: "desc" }, take: 10 },
      },
    });
    if (!device) { res.status(404).json({ error: "Device not found" }); return; }
    res.json({
      ...device,
      deviceId: device.id.slice(0, 8).toUpperCase(),
      zone: device.driver?.zone || null,
      appVersion: device.agentVersion || null,
      lastLocation: device.lastLatitude && device.lastLongitude
        ? `${Number(device.lastLatitude).toFixed(4)}, ${Number(device.lastLongitude).toFixed(4)}`
        : null,
      issuedOn: device.createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/command", async (req: Request, res: Response) => {
  try {
    const command = await prisma.deviceCommand.create({
      data: {
        deviceId: req.params.id,
        command: req.body.command,
        payload: req.body.payload,
        issuedById: req.user!.userId,
      },
    });
    res.status(201).json(command);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /trail/:driverId - Location history for polyline trail
router.get("/trail/:driverId", async (req: Request, res: Response) => {
  try {
    const { hours } = req.query;
    const hoursBack = parseInt(hours as string) || 4;
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const logs = await prisma.locationLog.findMany({
      where: {
        driverId: req.params.driverId,
        capturedAt: { gte: since },
      },
      orderBy: { capturedAt: "asc" },
      select: {
        latitude: true,
        longitude: true,
        speed: true,
        capturedAt: true,
      },
      take: 500,
    });

    res.json(logs.map((l) => ({
      lat: Number(l.latitude),
      lng: Number(l.longitude),
      speed: l.speed ? Number(l.speed) : null,
      time: l.capturedAt,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
