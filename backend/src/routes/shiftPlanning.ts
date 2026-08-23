/**
 * /api/shift-planning — who works where, and how many of them.
 *
 * Client request, 2026-08-06: "the driver must be assigned by hq a zone, after
 * that he can book the timing that suits him, so we need two things: in the hq
 * portal a place for assigning the zones for the driver and to put the maximum
 * number of drivers for each shift".
 *
 * Both halves live here because they are one decision made twice a month, not
 * two systems: how much of each area needs covering, and who covers it. The
 * driver app reads the result through /api/agent/shift-slots and can no longer
 * pick an area at all.
 *
 * The capacity grid is replaced wholesale on save, the same discipline as the
 * delivery plan rate grids: a per-cell PATCH means a grid can be half-written
 * when a request drops, and nothing on screen would say which half.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { SHIFT_HOURS, SHIFT_WINDOW_STARTS } from "./agent";

/** Setting the roster is set-up work, which is OPS_MANAGER and above. */
const PLANNERS = ["ADMIN", "OPS_MANAGER"];

const router = Router();
router.use(authMiddleware, tenantScope);

/**
 * Everything the planning screen draws, in one call.
 *
 * Three round trips for zones, caps and drivers would each be fast and the
 * screen still could not render until the last of them landed, so they travel
 * together.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const [zones, capacity, drivers] = await Promise.all([
      prisma.deliveryZone.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, code: true, name: true, nameAr: true },
        orderBy: { name: "asc" },
      }),
      prisma.shiftCapacity.findMany({
        where: { tenantId },
        select: { zoneId: true, dayOfWeek: true, startTime: true, maxDrivers: true },
      }),
      // Terminated drivers are left out: they cannot book anything, and a
      // roster screen that lists them is a roster screen nobody trusts.
      prisma.driver.findMany({
        where: { tenantId, status: { not: "TERMINATED" } },
        select: {
          id: true,
          name: true,
          driverCode: true,
          phone: true,
          status: true,
          assignedZoneId: true,
          fleetPartner: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
        take: 500,
      }),
    ]);

    res.json({
      hours: SHIFT_HOURS,
      windows: SHIFT_WINDOW_STARTS,
      zones,
      capacity,
      drivers,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Replace the whole capacity grid.
 *
 * A row that is not in the body is deleted, which is how "no cap on that
 * window" is expressed. Zero is a different answer and keeps its row: it means
 * Darb wants nobody in that area at that hour, and the driver app says Full
 * rather than showing an open button.
 */
router.put("/capacity", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows) { res.status(400).json({ error: "rows must be an array" }); return; }

    const zones = await prisma.deliveryZone.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const zoneIds = new Set(zones.map((z) => z.id));
    const windows = new Set<string>(SHIFT_WINDOW_STARTS);

    const clean: {
      tenantId: string;
      zoneId: string;
      dayOfWeek: number;
      startTime: string;
      maxDrivers: number;
    }[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const zoneId = String(row?.zoneId ?? "");
      const startTime = String(row?.startTime ?? "");
      const dayOfWeek = Number(row?.dayOfWeek);
      // A zone from another tenant, a window that is not one of ours, or a day
      // outside 0-6 is dropped rather than saved: the grid is generated from
      // this server's own lists, so anything else arrived by hand.
      if (!zoneIds.has(zoneId) || !windows.has(startTime)) continue;
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;
      const max = Number(row?.maxDrivers);
      if (!Number.isFinite(max) || max < 0) continue;
      // createMany below would abort the whole save on a duplicate key, so a
      // repeated cell is dropped here rather than taking the grid down with it.
      const key = `${zoneId}|${dayOfWeek}|${startTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push({ tenantId, zoneId, dayOfWeek, startTime, maxDrivers: Math.floor(max) });
    }

    await prisma.$transaction([
      prisma.shiftCapacity.deleteMany({ where: { tenantId } }),
      prisma.shiftCapacity.createMany({ data: clean }),
    ]);

    res.json({ message: "Capacity saved", count: clean.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Put one driver in a zone, or take them out of every zone.
 *
 * Null is a real value here and not a missing field: a driver between areas has
 * no assignment, and the app tells them to ask their supervisor rather than
 * offering windows they cannot have.
 */
router.patch("/drivers/:id/zone", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const raw = req.body?.zoneId;
    const zoneId = raw === null || raw === undefined || raw === "" ? null : String(raw);

    if (zoneId) {
      const zone = await prisma.deliveryZone.findFirst({
        where: { id: zoneId, tenantId, isActive: true },
        select: { id: true },
      });
      if (!zone) { res.status(400).json({ error: "Unknown area" }); return; }
    }

    // Tenant-guarded update rather than update-by-id: an id from another tenant
    // must read as not found, not as a driver quietly reassigned.
    const claimed = await prisma.driver.updateMany({
      where: { id: req.params.id, tenantId },
      data: { assignedZoneId: zoneId },
    });
    if (claimed.count === 0) { res.status(404).json({ error: "Driver not found" }); return; }

    res.json({ message: "Area saved", assignedZoneId: zoneId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
