/**
 * /api/shift-requests — Darb's side of a driver asking for a shift.
 *
 * Client request, 2026-08-03: the driver app books three-hour windows the way
 * the Talabat rider app does. Darb has no pool of open slots to claim (a Shift
 * row always belongs to a driver), so the tap writes a ShiftRequest and this
 * router is what turns it into a real Shift.
 *
 * Before this the ask travelled as a SHIFT_REQUEST ticket and stopped there:
 * nothing here could act on it, so "Darb confirms it and it appears above" was
 * a promise no code kept.
 *
 * Approve and decline are status-guarded `updateMany` claims, the same
 * discipline as the order FSM and the fleet request desk: count 0 means
 * somebody else got there first and the caller is told so rather than a second
 * shift being written.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { logger } from "../config/logger";

/** Who may decide a shift. Supervisors run the roster day to day. */
const SHIFT_DECIDERS = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];

const router = Router();
router.use(authMiddleware, tenantScope);

/** "16:00" on a stored midnight-Kuwait day, as the UTC instant it happens at. */
function instantOn(day: Date, time: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return new Date(day);
  return new Date(day.getTime() + (Number(m[1]) * 60 + Number(m[2])) * 60 * 1000);
}

const requestInclude = {
  driver: { select: { id: true, name: true, driverCode: true, phone: true, platform: true } },
} as const;

router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const status = (req.query.status as string | undefined) ?? "PENDING";

    const where: any = { tenantId };
    if (status && status !== "ALL") where.status = status;

    const [data, total] = await Promise.all([
      prisma.shiftRequest.findMany({
        where,
        skip,
        take: limit,
        // Soonest first: the window closest to happening is the one a decision
        // is most overdue on.
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        include: requestInclude,
      }),
      prisma.shiftRequest.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** The badge on the Live rail. Cheap enough to poll. */
router.get("/pending-count", async (req: Request, res: Response) => {
  try {
    const count = await prisma.shiftRequest.count({
      where: { tenantId: req.user!.tenantId, status: "PENDING" },
    });
    res.json({ count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/approve", rbac(...SHIFT_DECIDERS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const request = await prisma.shiftRequest.findFirst({
      where: { id: req.params.id, tenantId },
      include: { driver: { select: { id: true, platform: true } } },
    });
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }
    if (request.status !== "PENDING") {
      res.status(409).json({ error: "That request has already been decided" }); return;
    }

    // Claim it FIRST, then write the shift. The other order lets two
    // supervisors pressing at once create two shifts for one ask, and a
    // duplicate shift is what attendance and pay are computed from.
    const claimed = await prisma.shiftRequest.updateMany({
      where: { id: request.id, tenantId, status: "PENDING" },
      data: { status: "APPROVED", decidedAt: new Date(), decidedById: req.user!.userId },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "That request has already been decided" }); return;
    }

    const scheduledStart = instantOn(request.date, request.startTime);
    let scheduledEnd = instantOn(request.date, request.endTime);
    // A 22:00 start ends at 01:00 the next day, which reads as before the
    // start unless the day rolls over with it.
    if (scheduledEnd <= scheduledStart) {
      scheduledEnd = new Date(scheduledEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    try {
      const shift = await prisma.shift.create({
        data: {
          tenantId,
          driverId: request.driverId,
          date: request.date,
          platform: request.driver.platform,
          zone: request.zoneName,
          deliveryArea: request.zoneName,
          scheduledStart,
          scheduledEnd,
          status: "BOOKED",
          plannedHoursMinutes: Math.round((scheduledEnd.getTime() - scheduledStart.getTime()) / 60000),
        },
      });
      await prisma.shiftRequest.update({
        where: { id: request.id },
        data: { shiftId: shift.id },
      });
      // The desk item closes with the decision, so the same ask is not sitting
      // in two inboxes reading two different answers.
      if (request.ticketId) {
        await prisma.ticket
          .updateMany({
            where: { id: request.ticketId, tenantId, status: { not: "CLOSED" } },
            data: {
              status: "RESOLVED",
              resolution: `Shift confirmed for ${request.startTime}-${request.endTime} in ${request.zoneName}`,
              resolvedAt: new Date(),
            },
          })
          .catch(() => {});
      }
      res.json({ message: "Shift confirmed", shiftId: shift.id });
    } catch (e: any) {
      // The claim above already moved the request. Put it back rather than
      // leaving a driver reading Confirmed with no shift behind it.
      await prisma.shiftRequest.updateMany({
        where: { id: request.id, status: "APPROVED", shiftId: null },
        data: { status: "PENDING", decidedAt: null, decidedById: null },
      });
      logger.error({ err: e, requestId: request.id }, "shift request approve failed");
      res.status(400).json({ error: e.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/decline", rbac(...SHIFT_DECIDERS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const reason = String((req.body?.reason as string | undefined) ?? "").trim();
    // A refusal with no account of why is a refusal the driver asks a
    // supervisor about by phone, which is the call this screen exists to avoid.
    if (!reason) { res.status(400).json({ error: "A reason is required" }); return; }

    const claimed = await prisma.shiftRequest.updateMany({
      where: { id: req.params.id, tenantId, status: "PENDING" },
      data: {
        status: "DECLINED",
        declineReason: reason,
        decidedAt: new Date(),
        decidedById: req.user!.userId,
      },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "That request has already been decided" }); return;
    }

    const request = await prisma.shiftRequest.findFirst({
      where: { id: req.params.id, tenantId },
      select: { ticketId: true },
    });
    if (request?.ticketId) {
      await prisma.ticket
        .updateMany({
          where: { id: request.ticketId, tenantId, status: { not: "CLOSED" } },
          data: { status: "RESOLVED", resolution: reason, resolvedAt: new Date() },
        })
        .catch(() => {});
    }
    res.json({ message: "Request declined" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
