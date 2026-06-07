import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { upload } from "../utils/upload";
import { validateBody, createShiftSchema } from "../utils/validate";
import { rbac } from "../middleware/rbac";
import { assertDriverNotRestricted, DriverRestrictedError } from "../utils/driverRestriction";

const router = Router();
router.use(authMiddleware, tenantScope);

const MUTATORS = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];

/**
 * @swagger
 * /api/shifts:
 *   get:
 *     tags: [Shifts]
 *     summary: List shifts with filters and paginated response
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *       - in: query
 *         name: driverId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [BOOKED, IN_PROGRESS, COMPLETED, MISSED, CANCELLED] }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated shift list with driver info and session data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { platform, driverId, status, zone, dateFrom, dateTo, batchNumber, search } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (driverId) where.driverId = driverId;
    if (status) where.status = status;
    if (zone) where.zone = zone;
    if (batchNumber) where.driver = { ...where.driver, batchNumber: batchNumber as string };
    if (search) {
      where.driver = { ...where.driver, name: { contains: search as string, mode: "insensitive" } };
    }
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        const p = (dateFrom as string).split('-');
        where.date.gte = new Date(+p[0], +p[1] - 1, +p[2]);
      }
      if (dateTo) {
        const p = (dateTo as string).split('-');
        where.date.lte = new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59);
      }
    }

    const [data, total] = await Promise.all([
      prisma.shift.findMany({
        where, skip, take: limit,
        orderBy: { date: "desc" },
        include: {
          driver: { select: { id: true, name: true, platform: true, zone: true, batchNumber: true, vehicleType: true } },
          talabatSessions: { take: 1, orderBy: { createdAt: "desc" } },
        },
      }),
      prisma.shift.count({ where }),
    ]);

    // Flatten TalabatSession fields into each shift for the frontend
    const now = new Date();
    const mapped = data.map((s: any) => {
      const sess = s.talabatSessions?.[0];
      const { talabatSessions, ...rest } = s;

      // Compute actual hours dynamically
      let actualHours: number | null = null;
      if (s.actualHoursMinutes) {
        actualHours = Math.round(s.actualHoursMinutes / 60 * 10) / 10;
      } else if (s.actualStart && s.actualEnd) {
        const diffMs = new Date(s.actualEnd).getTime() - new Date(s.actualStart).getTime();
        actualHours = Math.round(diffMs / 60000 / 60 * 10) / 10;
      } else if (s.actualStart) {
        const diffMs = now.getTime() - new Date(s.actualStart).getTime();
        actualHours = Math.round(diffMs / 60000 / 60 * 10) / 10;
      } else if (s.plannedHoursMinutes) {
        actualHours = Math.round(s.plannedHoursMinutes / 60 * 10) / 10;
      }

      return {
        ...rest,
        batchNumber: s.driver?.batchNumber || null,
        vehicleType: s.driver?.vehicleType || null,
        bookedHours: s.plannedHoursMinutes ? Math.round(s.plannedHoursMinutes / 60 * 10) / 10 : null,
        actualHours,
        faceVerified: sess?.faceVerified ?? null,
        equipmentVerified: sess?.equipmentVerified ?? null,
        gpsViolation: sess?.gpsViolation ?? null,
        scheduledDuration: s.plannedHoursMinutes ? `${Math.floor(s.plannedHoursMinutes / 60)}h${s.plannedHoursMinutes % 60 ? ` ${s.plannedHoursMinutes % 60}m` : ''}` : null,
      };
    });

    res.json(paginatedResponse(mapped, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// All drivers with their booking status for a given date
router.get("/booking-status", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform, date, zone, batchNumber, search, bookingFilter, companyId } = req.query;

    // Build driver filter
    const driverWhere: any = { tenantId, status: "ACTIVE" };
    if (platform) driverWhere.platform = platform;
    if (companyId) driverWhere.companyId = companyId as string;
    if (zone) driverWhere.zone = zone;
    if (batchNumber) driverWhere.batchNumber = batchNumber as string;
    if (search) driverWhere.name = { contains: search as string, mode: "insensitive" };

    // Parse the target date
    const targetDate = date ? new Date(date as string) : new Date();
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Load platform settings for weeklyExpected base
    const platformSettings = platform
      ? await prisma.platformSettings.findFirst({ where: { tenantId, platform: platform as any } })
      : null;
    const bookingRules = (platformSettings?.bookingRules as any) || {};
    const baseWeeklyExpected: number = bookingRules.maxShiftsPerWeek ?? 7;

    // Get all active drivers for this platform
    const drivers = await prisma.driver.findMany({
      where: driverWhere,
      select: { id: true, name: true, phone: true, zone: true, batchNumber: true, vehicleType: true, photoUrl: true, company: { select: { name: true } } },
      orderBy: { name: "asc" },
    });

    // Get all shifts for these drivers on the target date
    const driverIds = drivers.map(d => d.id);
    const shifts = await prisma.shift.findMany({
      where: {
        tenantId,
        driverId: { in: driverIds },
        date: { gte: dayStart, lte: dayEnd },
        ...(platform ? { platform: platform as any } : {}),
      },
      include: {
        talabatSessions: { take: 1, orderBy: { createdAt: "desc" } },
      },
    });

    // Build a map of driverId -> shift
    const shiftByDriver = new Map<string, any>();
    for (const s of shifts) {
      shiftByDriver.set(s.driverId, s);
    }

    // ── Weekly booking stats ──────────────────────────────────────────────────
    // Compute Mon–Sun week containing targetDate
    const dow = targetDate.getDay(); // 0=Sun … 6=Sat
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const weekStart = new Date(targetDate);
    weekStart.setDate(targetDate.getDate() - daysFromMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    // Kuwait weekends: Thu=4, Fri=5, Sat=6  (JS getDay())
    const WEEKEND_DAYS = new Set([4, 5, 6]);
    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const [weeklyShifts, weeklyLeaves, weeklyOffRecords] = await Promise.all([
      prisma.shift.findMany({
        where: {
          tenantId,
          driverId: { in: driverIds },
          date: { gte: weekStart, lt: weekEnd },
          ...(platform ? { platform: platform as any } : {}),
        },
        select: { driverId: true, date: true },
      }),
      // Only APPROVED leaves count (pending/rejected don't affect expected bookings)
      prisma.leaveRequest.findMany({
        where: {
          tenantId,
          driverId: { in: driverIds },
          status: "APPROVED",
          startDate: { lt: weekEnd },
          endDate: { gte: weekStart },
        },
        select: { driverId: true, startDate: true, endDate: true },
      }),
      // OFF attendance records (monthly quota days used via restriction system)
      prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          driverId: { in: driverIds },
          status: "OFF",
          date: { gte: weekStart, lt: weekEnd },
        },
        select: { driverId: true, date: true },
      }),
    ]);

    // Weekly bookings per driver (count + per-date set for weekend detection)
    const weeklyBookingsMap = new Map<string, number>();
    const weeklyBookedDatesMap = new Map<string, Set<string>>();
    for (const s of weeklyShifts) {
      weeklyBookingsMap.set(s.driverId, (weeklyBookingsMap.get(s.driverId) || 0) + 1);
      const dateKey = new Date(s.date).toISOString().split("T")[0];
      if (!weeklyBookedDatesMap.has(s.driverId)) weeklyBookedDatesMap.set(s.driverId, new Set());
      weeklyBookedDatesMap.get(s.driverId)!.add(dateKey);
    }

    // Approved weekday offs (reduce expected) and weekend off violations (always flag)
    // Use a Set per driver to avoid double-counting days covered by both leave and OFF record
    const weeklyWeekdayOffDatesMap = new Map<string, Set<string>>();
    const weeklyWeekendViolationsMap = new Map<string, string[]>();
    const driverApprovedLeaveDates = new Map<string, Set<string>>();

    const addOffDate = (driverId: string, dateKey: string, dayOfWeek: number) => {
      if (!driverApprovedLeaveDates.has(driverId)) driverApprovedLeaveDates.set(driverId, new Set());
      driverApprovedLeaveDates.get(driverId)!.add(dateKey);
      if (WEEKEND_DAYS.has(dayOfWeek)) {
        const violations = weeklyWeekendViolationsMap.get(driverId) || [];
        violations.push(DAY_NAMES[dayOfWeek]);
        weeklyWeekendViolationsMap.set(driverId, violations);
      } else {
        if (!weeklyWeekdayOffDatesMap.has(driverId)) weeklyWeekdayOffDatesMap.set(driverId, new Set());
        weeklyWeekdayOffDatesMap.get(driverId)!.add(dateKey);
      }
    };

    for (const l of weeklyLeaves) {
      let cur = new Date(Math.max(l.startDate.getTime(), weekStart.getTime()));
      cur.setHours(0, 0, 0, 0);
      const end = new Date(Math.min(l.endDate.getTime(), weekEnd.getTime() - 86400000));
      end.setHours(23, 59, 59, 999);
      while (cur <= end) {
        addOffDate(l.driverId, cur.toISOString().split("T")[0], cur.getDay());
        cur.setDate(cur.getDate() + 1);
      }
    }

    for (const r of weeklyOffRecords) {
      const d = new Date(r.date);
      addOffDate(r.driverId, d.toISOString().split("T")[0], d.getDay());
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Merge drivers with their shift data
    const now = new Date();
    const result = drivers.map(d => {
      const shift = shiftByDriver.get(d.id);
      const sess = shift?.talabatSessions?.[0];

      // Compute actual hours dynamically
      let actualHours: number | null = null;
      if (shift?.actualHoursMinutes) {
        actualHours = Math.round(shift.actualHoursMinutes / 60 * 10) / 10;
      } else if (shift?.actualStart && shift?.actualEnd) {
        const diffMs = new Date(shift.actualEnd).getTime() - new Date(shift.actualStart).getTime();
        actualHours = Math.round(diffMs / 60000 / 60 * 10) / 10;
      } else if (shift?.actualStart) {
        // Shift in progress - compute from actualStart to now
        const diffMs = now.getTime() - new Date(shift.actualStart).getTime();
        actualHours = Math.round(diffMs / 60000 / 60 * 10) / 10;
      } else if (shift?.plannedHoursMinutes) {
        // Booked but not started - show planned as actual
        actualHours = Math.round(shift.plannedHoursMinutes / 60 * 10) / 10;
      }

      // Weekly flag logic
      const weeklyBookings = weeklyBookingsMap.get(d.id) || 0;
      const weeklyApprovedOffs = weeklyWeekdayOffDatesMap.get(d.id)?.size || 0;
      const weekendViolations = weeklyWeekendViolationsMap.get(d.id) || [];
      const weeklyExpected = baseWeeklyExpected - weeklyApprovedOffs;
      const flagReasons: string[] = [];
      if (weeklyBookings < weeklyExpected) {
        const missing = weeklyExpected - weeklyBookings;
        flagReasons.push(`Missing ${missing} day${missing > 1 ? "s" : ""}`);
      }
      if (weekendViolations.length > 0) {
        flagReasons.push(`Day off on weekend (${weekendViolations.join(", ")})`);
      }
      // Detect past weekend days with no booking and no approved leave
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const bookedDates = weeklyBookedDatesMap.get(d.id) || new Set<string>();
      const leaveDates = driverApprovedLeaveDates.get(d.id) || new Set<string>();
      const missingWeekendDays: string[] = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        if (day >= today) continue; // only flag past days
        if (!WEEKEND_DAYS.has(day.getDay())) continue;
        const dateKey = day.toISOString().split("T")[0];
        if (!bookedDates.has(dateKey) && !leaveDates.has(dateKey)) {
          missingWeekendDays.push(DAY_NAMES[day.getDay()]);
        }
      }
      if (missingWeekendDays.length > 0) {
        flagReasons.push(`Off at weekend (${missingWeekendDays.join(", ")})`);
      }

      return {
        driverId: d.id,
        driverName: d.name,
        companyName: (d as any).company?.name || null,
        phone: d.phone,
        zone: d.zone,
        batchNumber: d.batchNumber,
        vehicleType: d.vehicleType,
        photoUrl: d.photoUrl,
        hasBooked: !!shift,
        shiftId: shift?.id || null,
        status: shift?.status || "NOT_BOOKED",
        scheduledStart: shift?.scheduledStart || null,
        scheduledEnd: shift?.scheduledEnd || null,
        actualStart: shift?.actualStart || null,
        actualEnd: shift?.actualEnd || null,
        bookedHours: shift?.plannedHoursMinutes ? Math.round(shift.plannedHoursMinutes / 60 * 10) / 10 : null,
        actualHours,
        faceVerified: sess?.faceVerified ?? null,
        weeklyBookings,
        weeklyExpected,
        weeklyApprovedOffs,
        weeklyFlag: flagReasons.length > 0,
        weeklyFlagReason: flagReasons.join(" · "),
      };
    });

    // Apply booking filter
    let filtered = result;
    if (bookingFilter === "BOOKED") filtered = result.filter(r => r.hasBooked);
    else if (bookingFilter === "NOT_BOOKED") filtered = result.filter(r => !r.hasBooked);
    else if (bookingFilter === "COMPLETED") filtered = result.filter(r => r.status === "COMPLETED");
    else if (bookingFilter === "NO_SHOW") filtered = result.filter(r => r.status === "MISSED");
    else if (bookingFilter === "FLAGGED") filtered = result.filter(r => r.weeklyFlag);

    const bookedCount = result.filter(r => r.hasBooked).length;
    const notBookedCount = result.filter(r => !r.hasBooked).length;
    const completedCount = result.filter(r => r.status === "COMPLETED").length;
    const noShowCount = result.filter(r => r.status === "MISSED").length;
    const flaggedCount = result.filter(r => r.weeklyFlag).length;

    res.json({
      date: dayStart.toISOString().split("T")[0],
      totalDrivers: result.length,
      bookedCount,
      notBookedCount,
      completedCount,
      noShowCount,
      flaggedCount,
      drivers: filtered,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;

    // Calculate start of the current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const weekWhere = { ...where, date: { gte: weekStart, lt: weekEnd } };

    const [totalThisWeek, missedCount, hoursAgg] = await Promise.all([
      prisma.shift.count({ where: weekWhere }),
      prisma.shift.count({ where: { ...weekWhere, status: "MISSED" } }),
      prisma.shift.aggregate({
        where: weekWhere,
        _sum: { plannedHoursMinutes: true, actualHoursMinutes: true },
      }),
    ]);

    const bookedHours = Math.round((hoursAgg._sum.plannedHoursMinutes || 0) / 60 * 10) / 10;
    const actualHours = Math.round((hoursAgg._sum.actualHoursMinutes || 0) / 60 * 10) / 10;

    res.json({ totalThisWeek, bookedHours, actualHours, faceFailCount: 0, missedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const shift = await prisma.shift.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { driver: true, attendanceRecords: true, orderLogs: true },
    });
    if (!shift) { res.status(404).json({ error: "Shift not found" }); return; }
    res.json(shift);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/shifts:
 *   post:
 *     tags: [Shifts]
 *     summary: Create a new shift booking
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId, platform, date, scheduledStart, scheduledEnd]
 *             properties:
 *               driverId: { type: string, format: uuid }
 *               platform: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *               date: { type: string, format: date }
 *               scheduledStart: { type: string, format: date-time }
 *               scheduledEnd: { type: string, format: date-time }
 *               zone: { type: string }
 *               vehicleType: { type: string }
 *     responses:
 *       201:
 *         description: Shift created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Shift'
 *       409:
 *         description: Shift overlap conflict
 *       422:
 *         description: Validation error
 */
router.post("/", rbac(...MUTATORS), validateBody(createShiftSchema.passthrough()), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { driverId, date, scheduledStart, scheduledEnd } = req.body;

    await assertDriverNotRestricted(tenantId, driverId);

    // Check for overlapping shifts on the same date for the same driver
    if (driverId && date) {
      const shiftDate = new Date(date);
      const dayStart = new Date(shiftDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const existing = await prisma.shift.findFirst({
        where: {
          tenantId,
          driverId,
          date: { gte: dayStart, lt: dayEnd },
          status: { notIn: ["CANCELLED", "MISSED"] },
        },
      });

      if (existing) {
        // If specific times given, check actual time overlap; otherwise block same-day
        let hasOverlap = true;
        if (scheduledStart && scheduledEnd && existing.scheduledStart && existing.scheduledEnd) {
          const newStart = new Date(scheduledStart).getTime();
          const newEnd = new Date(scheduledEnd).getTime();
          const exStart = existing.scheduledStart.getTime();
          const exEnd = existing.scheduledEnd.getTime();
          hasOverlap = newStart < exEnd && newEnd > exStart;
        }
        if (hasOverlap) {
          res.status(409).json({ error: "Driver already has a shift booked on this date. Cancel the existing shift first." });
          return;
        }
      }
    }

    const shift = await prisma.shift.create({
      data: { ...req.body, tenantId },
    });
    res.status(201).json(shift);
  } catch (err: any) {
    if (err instanceof DriverRestrictedError) {
      res.status(403).json({ error: err.message, driverId: err.driverId });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", rbac(...MUTATORS), async (req: Request, res: Response) => {
  try {
    const allowed = [
      "date", "platform", "zone", "scheduledStart", "scheduledEnd",
      "actualStart", "actualEnd", "platformClockIn", "platformClockOut",
      "varianceMinutes", "status", "isValid",
      "plannedHoursMinutes", "actualHoursMinutes",
      "selfieUrl", "selfieLocation", "clockInMethod",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const shift = await prisma.shift.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data,
    });
    if (shift.count === 0) { res.status(404).json({ error: "Shift not found" }); return; }
    const updated = await prisma.shift.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", rbac("ADMIN", "OPS_MANAGER"), async (req: Request, res: Response) => {
  try {
    await prisma.shift.deleteMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    res.json({ message: "Shift deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/shifts/{id}/clock-in:
 *   post:
 *     tags: [Shifts]
 *     summary: Clock in to a shift (optionally with selfie)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               selfie: { type: string, format: binary }
 *               faceVerified: { type: boolean }
 *               equipmentVerified: { type: boolean }
 *               gpsViolation: { type: boolean }
 *     responses:
 *       200:
 *         description: Shift updated with clock-in time and session data
 *       404:
 *         description: Shift not found
 */
// Clock in with selfie
router.post("/:id/clock-in", upload.single("selfie"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { latitude, longitude } = req.body;
    const selfieUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    const now = new Date();

    // Fetch the shift first to get scheduledStart
    const existingShift = await prisma.shift.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, driverId: true, date: true, platform: true, scheduledStart: true, zone: true },
    });
    if (!existingShift) { res.status(404).json({ error: "Shift not found" }); return; }

    // Update the shift
    await prisma.shift.update({
      where: { id: existingShift.id },
      data: {
        actualStart: now,
        status: "IN_PROGRESS",
        selfieUrl,
        selfieLocation: latitude && longitude ? { latitude, longitude } : undefined,
        clockInMethod: "selfie",
      },
    });

    // Late detection: if clocked in even 1 minute after scheduledStart, mark as LATE
    const lateMs = now.getTime() - new Date(existingShift.scheduledStart).getTime();
    const lateMinutes = Math.floor(lateMs / 60000);
    const isLate = lateMinutes >= 1;

    // Auto-create attendance record
    const attendanceDate = new Date(existingShift.date);
    attendanceDate.setHours(0, 0, 0, 0);

    await prisma.attendanceRecord.upsert({
      where: {
        tenantId_driverId_date: {
          tenantId,
          driverId: existingShift.driverId,
          date: attendanceDate,
        },
      },
      create: {
        tenantId,
        driverId: existingShift.driverId,
        shiftId: existingShift.id,
        date: attendanceDate,
        status: isLate ? "LATE" : "PRESENT",
        lateMinutes: isLate ? lateMinutes : 0,
        source: "SYSTEM",
      },
      update: {
        status: isLate ? "LATE" : "PRESENT",
        lateMinutes: isLate ? lateMinutes : 0,
        shiftId: existingShift.id,
      },
    });

    // Create LATE_CLOCK_IN violation event if late (for Talabat, or generic alert for others)
    if (isLate) {
      if (existingShift.platform === "TALABAT") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const existingEvent = await prisma.talabatViolationEvent.findFirst({
          where: {
            tenantId,
            driverId: existingShift.driverId,
            type: "LATE_CLOCK_IN",
            createdAt: { gte: today },
          },
        });
        if (!existingEvent) {
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId,
              driverId: existingShift.driverId,
              type: "LATE_CLOCK_IN",
              description: `Driver clocked in ${lateMinutes} minute${lateMinutes > 1 ? "s" : ""} late (scheduled: ${new Date(existingShift.scheduledStart).toLocaleTimeString()})`,
              metadata: { shiftId: existingShift.id, lateMinutes, scheduledStart: existingShift.scheduledStart },
            },
          });
        }
      } else {
        // Generic alert for non-Talabat platforms
        await prisma.alert.create({
          data: {
            tenantId,
            type: "late_clock_in",
            severity: lateMinutes >= 15 ? "HIGH" : "MEDIUM",
            title: "Late Clock-In",
            message: `Driver clocked in ${lateMinutes} minute${lateMinutes > 1 ? "s" : ""} late for ${existingShift.platform} shift`,
            driverId: existingShift.driverId,
            data: { shiftId: existingShift.id, lateMinutes, scheduledStart: existingShift.scheduledStart },
          },
        });
      }
    }

    res.json({
      message: "Clocked in",
      isLate,
      lateMinutes: isLate ? lateMinutes : 0,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Clock out
router.post("/:id/clock-out", upload.single("selfie"), async (req: Request, res: Response) => {
  try {
    const shift = await prisma.shift.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data: {
        actualEnd: new Date(),
        status: "COMPLETED",
        clockOutMethod: "selfie",
      },
    });
    if (shift.count === 0) { res.status(404).json({ error: "Shift not found" }); return; }
    res.json({ message: "Clocked out" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Import shift schedule XLSX (Keeta / Talabat / Americana weekly release)
router.post(
  "/import-schedule",
  rbac(...MUTATORS),
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }
      const tenantId = req.user!.tenantId;
      const platformParam = (req.body.platform || req.query.platform) as string | undefined;
      if (!platformParam) {
        res.status(400).json({ error: "platform is required (KEETA|TALABAT|DELIVEROO|AMERICANA)" });
        return;
      }
      const platform = platformParam.toUpperCase() as any;

      const fs = await import("fs");
      const buffer = fs.readFileSync(req.file.path);
      const { parseShiftScheduleXlsx } = await import("../services/xlsxParser");
      const rows = parseShiftScheduleXlsx(buffer);

      // Resolve drivers for this tenant/platform so we can match by id/utr/name.
      const drivers = await prisma.driver.findMany({
        where: { tenantId, platform },
        select: { id: true, name: true, utr: true, platformDriverId: true },
      });
      const byKey = new Map<string, string>();
      for (const d of drivers) {
        if (d.platformDriverId) byKey.set(d.platformDriverId.toLowerCase(), d.id);
        if (d.utr) byKey.set(d.utr.toLowerCase(), d.id);
        byKey.set(d.name.toLowerCase(), d.id);
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const unresolved: string[] = [];

      for (const row of rows) {
        const driverId = byKey.get(row.driverIdentifier.toLowerCase());
        if (!driverId) {
          skipped++;
          if (unresolved.length < 20) unresolved.push(row.driverIdentifier);
          continue;
        }

        const planned = Math.round(
          (row.scheduledEnd.getTime() - row.scheduledStart.getTime()) / 60000,
        );

        // Upsert: one shift per driver per date.
        const existing = await prisma.shift.findFirst({
          where: {
            tenantId,
            driverId,
            date: row.date,
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.shift.update({
            where: { id: existing.id },
            data: {
              platform,
              zone: row.zone,
              scheduledStart: row.scheduledStart,
              scheduledEnd: row.scheduledEnd,
              plannedHoursMinutes: planned,
            },
          });
          updated++;
        } else {
          await prisma.shift.create({
            data: {
              tenantId,
              driverId,
              date: row.date,
              platform,
              zone: row.zone,
              scheduledStart: row.scheduledStart,
              scheduledEnd: row.scheduledEnd,
              status: "BOOKED",
              plannedHoursMinutes: planned,
            },
          });
          created++;
        }
      }

      res.json({
        message: "Schedule imported",
        file: req.file.filename,
        totalRows: rows.length,
        created,
        updated,
        skipped,
        unresolvedSample: unresolved,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
);

export default router;
