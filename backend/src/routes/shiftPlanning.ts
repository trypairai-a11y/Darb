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
import {
  DEFAULT_SLOT_MINUTES,
  DUTY_TARGET_MINUTES,
  SLOT_DURATIONS_MINUTES,
  isSlotDuration,
  isSlotStart,
  minutesBetween,
  normaliseStart,
} from "../services/shiftSlots";
import {
  approveShiftPlan,
  discardShiftPlan,
  generateShiftPlan,
  getShiftPlan,
  updateShiftPlanEntries,
  weekStartOf,
} from "../services/shiftPlanService";

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
        select: { zoneId: true, dayOfWeek: true, startTime: true, maxDrivers: true, durationMinutes: true },
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
      // Revision 24 (#3): the lengths a slot may be, and the duty they stack to.
      slotDurations: SLOT_DURATIONS_MINUTES,
      dutyHours: DUTY_TARGET_MINUTES / 60,
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

    const clean: {
      tenantId: string;
      zoneId: string;
      dayOfWeek: number;
      startTime: string;
      durationMinutes: number;
      maxDrivers: number;
    }[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const zoneId = String(row?.zoneId ?? "");
      const startTime = normaliseStart(String(row?.startTime ?? ""));
      const dayOfWeek = Number(row?.dayOfWeek);
      // Revision 24 (#3): a row is a slot, any hour plus a 2, 3 or 4-hour
      // length. A row with no length is the three-hour window an older
      // screen meant. A zone from another tenant, a start off the hour, a
      // length that is not a slot, or a day outside 0-6 is dropped rather
      // than saved: anything else arrived by hand.
      const durationMinutes =
        row?.durationMinutes === undefined || row?.durationMinutes === null
          ? DEFAULT_SLOT_MINUTES
          : Number(row.durationMinutes);
      if (!zoneIds.has(zoneId) || !startTime || !isSlotStart(startTime)) continue;
      if (!isSlotDuration(durationMinutes)) continue;
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;
      const max = Number(row?.maxDrivers);
      if (!Number.isFinite(max) || max < 0) continue;
      // createMany below would abort the whole save on a duplicate key, so a
      // repeated cell is dropped here rather than taking the grid down with it.
      const key = `${zoneId}|${dayOfWeek}|${startTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push({ tenantId, zoneId, dayOfWeek, startTime, durationMinutes, maxDrivers: Math.floor(max) });
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

/**
 * Revision 24 (#3) — who has booked what on one day, against the 12-hour duty.
 *
 * A duty is several 2, 3 or 4-hour slots now, and the client's reading is
 * that a driver should reach 12 hours. Booking does not refuse a partial day
 * (that would only teach drivers to book hours they will not work), so the
 * gap has to be visible somewhere: this is the list ops reads it from, short
 * days first. `?date=YYYY-MM-DD` is a Kuwait calendar day; today by default.
 */
router.get("/bookings", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const raw = typeof req.query.date === "string" ? req.query.date : "";
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? raw
      : new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const [y, m, d] = iso.split("-").map(Number);
    // Kuwait midnight as stored on ShiftRequest.date (routes/agent.ts).
    const day = new Date(Date.UTC(y!, m! - 1, d!) - 3 * 3_600_000);

    const rows = await prisma.shiftRequest.findMany({
      where: { tenantId, date: day, status: { in: ["PENDING", "APPROVED"] } },
      select: {
        id: true,
        driverId: true,
        startTime: true,
        endTime: true,
        zoneName: true,
        status: true,
        driver: { select: { name: true, driverCode: true, phone: true } },
      },
      orderBy: { startTime: "asc" },
    });

    const byDriver = new Map<
      string,
      {
        driverId: string;
        name: string;
        driverCode: string | null;
        phone: string | null;
        area: string | null;
        bookedMinutes: number;
        slots: Array<{ id: string; start: string; end: string; durationMinutes: number; area: string }>;
      }
    >();
    for (const r of rows) {
      const minutes = minutesBetween(r.startTime, r.endTime);
      const entry = byDriver.get(r.driverId) ?? {
        driverId: r.driverId,
        name: r.driver?.name ?? "n/a",
        driverCode: r.driver?.driverCode ?? null,
        phone: r.driver?.phone ?? null,
        area: r.zoneName,
        bookedMinutes: 0,
        slots: [],
      };
      entry.bookedMinutes += minutes;
      entry.slots.push({ id: r.id, start: r.startTime, end: r.endTime, durationMinutes: minutes, area: r.zoneName });
      byDriver.set(r.driverId, entry);
    }
    const drivers = [...byDriver.values()].sort(
      (a, b) => a.bookedMinutes - b.bookedMinutes || a.name.localeCompare(b.name),
    );

    res.json({
      date: iso,
      targetMinutes: DUTY_TARGET_MINUTES,
      summary: {
        drivers: drivers.length,
        fullDuty: drivers.filter((x) => x.bookedMinutes >= DUTY_TARGET_MINUTES).length,
        short: drivers.filter((x) => x.bookedMinutes < DUTY_TARGET_MINUTES).length,
        bookedMinutes: drivers.reduce((sum, x) => sum + x.bookedMinutes, 0),
      },
      drivers,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Revision 20 — the proposed weekly plan.
//
// "system should give a proposed plan for each shift weekly, the system should
// read the past data and arrange the driver shifts accordingly and the ops team
// should be able to modify and approve the plan".
//
// The capacity grid above is what the driver app books against. NOTHING here
// writes it except POST /plan/:id/approve, and that is the whole design: a
// proposal that wrote through would move bookable capacity under drivers' feet
// every time it ran, which is what the word "approve" was asking to prevent.
// ══════════════════════════════════════════════════════════════════════════

function planFail(res: Response, err: unknown) {
  const status = (err as { statusCode?: number })?.statusCode ?? 500;
  const code = (err as { code?: string })?.code;
  res.status(status).json({
    error: err instanceof Error ? err.message : "Request failed",
    ...(typeof code === "string" ? { code } : {}),
  });
}

/** The week to plan, from ?weekStart=YYYY-MM-DD. Defaults to next week. */
function requestedWeek(req: Request): Date {
  const raw = typeof req.query.weekStart === "string" ? req.query.weekStart : "";
  if (raw) {
    const d = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return weekStartOf(d);
  }
  // Planning is done for the week ahead, so that is what opens by default.
  return weekStartOf(new Date(Date.now() + 7 * 86_400_000));
}

/** The plan for a week, or null when nothing has been generated for it yet. */
router.get("/plan", async (req: Request, res: Response) => {
  try {
    const weekStart = requestedWeek(req);
    const plan = await getShiftPlan(req.user!.tenantId, weekStart);
    res.json(plan ?? { plan: null, weekStart: weekStart.toISOString() });
  } catch (err) {
    planFail(res, err);
  }
});

/**
 * Generate, or regenerate, the draft for a week.
 *
 * `replaceApproved: true` in the body rebuilds a week that is already
 * APPROVED (revision 21c). The plan returns to DRAFT; the capacity grid the
 * driver app books against stays as it was until the new draft is approved.
 */
router.post("/plan/generate", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    const raw = typeof req.body?.weekStart === "string" ? req.body.weekStart : "";
    const weekStart = raw ? new Date(`${raw}T00:00:00`) : new Date(Date.now() + 7 * 86_400_000);
    if (Number.isNaN(weekStart.getTime())) {
      res.status(400).json({ error: "weekStart must be a date" });
      return;
    }
    const result = await generateShiftPlan({
      tenantId: req.user!.tenantId,
      weekStart,
      ...(req.body?.lookbackWeeks ? { lookbackWeeks: Number(req.body.lookbackWeeks) } : {}),
      replaceApproved: req.body?.replaceApproved === true,
    });
    res.status(201).json(result);
  } catch (err) {
    planFail(res, err);
  }
});

/** Save the planner's edits to the draft grid. */
router.put("/plan/:id/entries", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
    if (!entries) {
      res.status(400).json({ error: "entries must be an array" });
      return;
    }
    res.json(
      await updateShiftPlanEntries({
        tenantId: req.user!.tenantId,
        planId: req.params.id,
        entries,
      }),
    );
  } catch (err) {
    planFail(res, err);
  }
});

/** Approve, and write the capacity grid from what the planner left. */
router.post("/plan/:id/approve", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    res.json(
      await approveShiftPlan({
        tenantId: req.user!.tenantId,
        planId: req.params.id,
        approvedById: req.user!.userId,
        note: typeof req.body?.note === "string" ? req.body.note : null,
      }),
    );
  } catch (err) {
    planFail(res, err);
  }
});

router.post("/plan/:id/discard", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    res.json(await discardShiftPlan(req.user!.tenantId, req.params.id));
  } catch (err) {
    planFail(res, err);
  }
});

export default router;
