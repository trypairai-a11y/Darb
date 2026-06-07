import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";

const router = Router();
router.use(authMiddleware, tenantScope);

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform } = req.query;
    const where: any = { tenantId };
    if (platform) {
      where.company = { platform: platform as string };
    }

    const [total, active, maintenance] = await Promise.all([
      prisma.vehicle.count({ where }),
      prisma.vehicle.count({ where: { ...where, status: "ACTIVE" } }),
      prisma.vehicle.count({ where: { ...where, status: "MAINTENANCE" } }),
    ]);

    res.json({ total, active, maintenance, nonCompliant: 0, retired: total - active - maintenance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { status, companyId, vehicleType, platform, search } = req.query;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;
    if (vehicleType) where.vehicleType = vehicleType;
    if (platform) {
      where.company = { platform: platform as string };
    }
    if (search) {
      where.OR = [
        { plateNumber: { contains: search as string, mode: "insensitive" } },
        { assignedDriver: { name: { contains: search as string, mode: "insensitive" } } },
        { driverAssignments: { some: { active: true, driver: { name: { contains: search as string, mode: "insensitive" } } } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.vehicle.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          company: { select: { name: true, platform: true } },
          assignedDriver: { select: { id: true, name: true, zone: true } },
          driverAssignments: {
            where: { active: true },
            include: { driver: { select: { id: true, name: true, zone: true, phone: true, platform: true } } },
            orderBy: { assignedAt: "asc" },
          },
        },
      }),
      prisma.vehicle.count({ where }),
    ]);

    const enriched = data.map((v) => {
      const drivers = v.driverAssignments.map((a) => a.driver);
      return {
        ...v,
        driver: v.assignedDriver,
        zone: v.assignedDriver?.zone || null,
        drivers,
        driverCount: drivers.length,
      };
    });

    res.json(paginatedResponse(enriched, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        company: true,
        assignedDriver: true,
        driverAssignments: {
          where: { active: true },
          include: { driver: { select: { id: true, name: true, zone: true, phone: true, platform: true } } },
          orderBy: { assignedAt: "asc" },
        },
        inspections: { orderBy: { date: "desc" }, take: 5 },
        maintenanceRecords: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    if (!vehicle) { res.status(404).json({ error: "Vehicle not found" }); return; }
    res.json({ ...vehicle, drivers: vehicle.driverAssignments.map((a) => a.driver) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const vehicle = await prisma.vehicle.create({
      data: { ...req.body, tenantId: req.user!.tenantId },
    });
    res.status(201).json(vehicle);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const allowed = [
      "companyId", "plateNumber", "vehicleType", "make", "model", "year",
      "color", "chassisNumber", "mileage", "fuelType", "ownerCompany",
      "driverIqama", "status", "assignedDriverId",
      "insuranceExpiry", "registrationExpiry",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const vehicle = await prisma.vehicle.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data,
    });
    if (vehicle.count === 0) { res.status(404).json({ error: "Vehicle not found" }); return; }
    const updated = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.vehicle.deleteMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    res.json({ message: "Vehicle deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Multi-driver assignment management ---

// List drivers assigned to a vehicle
router.get("/:id/drivers", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const vehicle = await prisma.vehicle.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
    if (!vehicle) { res.status(404).json({ error: "Vehicle not found" }); return; }
    const assignments = await prisma.vehicleDriverAssignment.findMany({
      where: { vehicleId: req.params.id, tenantId, active: true },
      include: { driver: { select: { id: true, name: true, zone: true, phone: true, platform: true } } },
      orderBy: { assignedAt: "asc" },
    });
    res.json(assignments.map((a) => ({ assignmentId: a.id, assignedAt: a.assignedAt, ...a.driver })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Assign one or more drivers to a vehicle (additive). Body: { driverIds: string[] } or { driverId: string }
router.post("/:id/drivers", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const vehicleId = req.params.id;
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: { id: true } });
    if (!vehicle) { res.status(404).json({ error: "Vehicle not found" }); return; }

    const body = req.body ?? {};
    const ids: string[] = Array.isArray(body.driverIds)
      ? body.driverIds
      : body.driverId ? [body.driverId] : [];
    const driverIds = [...new Set(ids.filter(Boolean))];
    if (driverIds.length === 0) { res.status(400).json({ error: "driverIds is required" }); return; }

    // Only assign drivers that belong to this tenant
    const validDrivers = await prisma.driver.findMany({
      where: { id: { in: driverIds }, tenantId }, select: { id: true },
    });
    const validIds = validDrivers.map((d) => d.id);
    if (validIds.length === 0) { res.status(400).json({ error: "No valid drivers for this tenant" }); return; }

    for (const driverId of validIds) {
      await prisma.vehicleDriverAssignment.upsert({
        where: { vehicleId_driverId: { vehicleId, driverId } },
        create: { tenantId, vehicleId, driverId, active: true, note: body.note ?? null },
        update: { active: true, unassignedAt: null, note: body.note ?? undefined },
      });
    }

    const assignments = await prisma.vehicleDriverAssignment.findMany({
      where: { vehicleId, tenantId, active: true },
      include: { driver: { select: { id: true, name: true, zone: true, phone: true, platform: true } } },
      orderBy: { assignedAt: "asc" },
    });
    res.status(201).json(assignments.map((a) => ({ assignmentId: a.id, assignedAt: a.assignedAt, ...a.driver })));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Replace the full set of drivers for a vehicle. Body: { driverIds: string[] }
router.put("/:id/drivers", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const vehicleId = req.params.id;
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: { id: true } });
    if (!vehicle) { res.status(404).json({ error: "Vehicle not found" }); return; }

    const body = req.body ?? {};
    const ids: string[] = Array.isArray(body.driverIds) ? body.driverIds : [];
    const validDrivers = await prisma.driver.findMany({
      where: { id: { in: [...new Set(ids.filter(Boolean))] }, tenantId }, select: { id: true },
    });
    const validIds = validDrivers.map((d) => d.id);

    await prisma.$transaction([
      // Deactivate anything not in the new set
      prisma.vehicleDriverAssignment.updateMany({
        where: { vehicleId, tenantId, driverId: { notIn: validIds }, active: true },
        data: { active: false, unassignedAt: new Date() },
      }),
      ...validIds.map((driverId) =>
        prisma.vehicleDriverAssignment.upsert({
          where: { vehicleId_driverId: { vehicleId, driverId } },
          create: { tenantId, vehicleId, driverId, active: true },
          update: { active: true, unassignedAt: null },
        }),
      ),
    ]);

    const assignments = await prisma.vehicleDriverAssignment.findMany({
      where: { vehicleId, tenantId, active: true },
      include: { driver: { select: { id: true, name: true, zone: true, phone: true, platform: true } } },
      orderBy: { assignedAt: "asc" },
    });
    res.json(assignments.map((a) => ({ assignmentId: a.id, assignedAt: a.assignedAt, ...a.driver })));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Unassign a single driver from a vehicle
router.delete("/:id/drivers/:driverId", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id: vehicleId, driverId } = req.params;
    const result = await prisma.vehicleDriverAssignment.updateMany({
      where: { vehicleId, driverId, tenantId, active: true },
      data: { active: false, unassignedAt: new Date() },
    });
    if (result.count === 0) { res.status(404).json({ error: "Assignment not found" }); return; }
    res.json({ message: "Driver unassigned" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
