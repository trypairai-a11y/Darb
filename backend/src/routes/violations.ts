import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { parseLocalDate, parseLocalDateEnd } from "../utils/date";
import { createViolationNotifications, getViolationSeverity } from "../services/notificationService";
import { ViolationType, ViolationStatus, AppealStatus } from "../generated/prisma";

const DESTRUCTIVE = ["ADMIN", "OPS_MANAGER"];

const router = Router();
router.use(authMiddleware, tenantScope);

const AMERICANA_VIOLATION_TYPES = [
  "AMERICANA_LATE_ARRIVAL",
  "AMERICANA_NO_SHOW",
  "AMERICANA_EARLY_DEPARTURE_QUIT",
] as const;

/**
 * @swagger
 * /api/violations:
 *   get:
 *     tags: [Violations]
 *     summary: List violations with filters and pagination
 *     parameters:
 *       - in: query
 *         name: violationType
 *         schema: { type: string, enum: [LATE_PICKUP, ORDER_REJECTION_TIMEOUT, DROP_OFF_IN_ADVANCE, ORDER_SLIGHTLY_LATE, ORDER_VERY_LATE, INVALID_DELIVERY_PHOTO, GPS_NOT_UPLOADING] }
 *       - in: query
 *         name: violationStatus
 *         schema: { type: string, enum: [ESTABLISHED, UNDER_REVIEW, OVERTURNED, EXPIRED] }
 *       - in: query
 *         name: appealStatus
 *         schema: { type: string, enum: [NOT_RAISED, PENDING, APPROVED, REJECTED] }
 *       - in: query
 *         name: driverId
 *         schema: { type: string }
 *       - in: query
 *         name: platform
 *         schema: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by driver name
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated violation list with driver info
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { violationType, violationStatus, appealStatus, driverId, platform, dateFrom, dateTo, search } = req.query;

    const where: any = { tenantId };
    if (violationType) where.violationType = violationType as string;
    if (violationStatus) where.violationStatus = violationStatus as string;
    if (appealStatus) where.appealStatus = appealStatus as string;
    if (driverId) where.driverId = driverId as string;
    if (platform) where.platform = platform as string;
    if (platform === "AMERICANA") {
      where.violationType = violationType
        ? (AMERICANA_VIOLATION_TYPES.includes(violationType as any)
            ? (violationType as string)
            : "__NONE__")
        : { in: AMERICANA_VIOLATION_TYPES as unknown as string[] };
    }
    if (search) where.driver = { name: { contains: search as string, mode: "insensitive" } };
    if (dateFrom || dateTo) {
      where.violationTime = {};
      if (dateFrom) where.violationTime.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.violationTime.lte = parseLocalDateEnd(dateTo as string);
    }

    const [data, total] = await Promise.all([
      prisma.violation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { violationTime: "desc" },
        include: {
          driver: { select: { id: true, name: true, platform: true, vehicleType: true, platformDriverId: true } },
        },
      }),
      prisma.violation.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/violations/summary:
 *   get:
 *     tags: [Violations]
 *     summary: Aggregate violation counts by type, status, and pending appeals
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *     responses:
 *       200:
 *         description: Summary with total, byType, byStatus, and pendingAppeals counts
 */
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform } = req.query;
    const summaryWhere: any = { tenantId };
    if (platform) summaryWhere.platform = platform as string;
    if (platform === "AMERICANA") {
      summaryWhere.violationType = { in: AMERICANA_VIOLATION_TYPES as unknown as string[] };
    }

    const [byType, byStatus, pendingAppeals, total] = await Promise.all([
      prisma.violation.groupBy({
        by: ["violationType"],
        where: summaryWhere,
        _count: { id: true },
      }),
      prisma.violation.groupBy({
        by: ["violationStatus"],
        where: summaryWhere,
        _count: { id: true },
      }),
      prisma.violation.count({ where: { ...summaryWhere, appealStatus: "PENDING" } }),
      prisma.violation.count({ where: summaryWhere }),
    ]);

    res.json({
      total,
      byType: byType.map((t) => ({ type: t.violationType, count: t._count.id })),
      byStatus: byStatus.map((s) => ({ status: s.violationStatus, count: s._count.id })),
      pendingAppeals,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/violations/{id}:
 *   get:
 *     tags: [Violations]
 *     summary: Get a single violation with linked penalties and appeal history
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Violation detail with driver, penalties, and appeals
 *       404:
 *         description: Violation not found
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const violation = await prisma.violation.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        driver: { select: { id: true, name: true, platform: true, vehicleType: true, platformDriverId: true, phone: true } },
        penalties: true,
        appeals: { orderBy: { appealLevel: "asc" } },
      },
    });
    if (!violation) { res.status(404).json({ error: "Violation not found" }); return; }
    res.json(violation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/violations:
 *   post:
 *     tags: [Violations]
 *     summary: Create a new violation (manual or automated)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId, platform, violationType, violationTime]
 *             properties:
 *               driverId: { type: string }
 *               platform: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *               violationType: { type: string, enum: [LATE_PICKUP, ORDER_REJECTION_TIMEOUT, DROP_OFF_IN_ADVANCE, ORDER_SLIGHTLY_LATE, ORDER_VERY_LATE, INVALID_DELIVERY_PHOTO, GPS_NOT_UPLOADING] }
 *               violationTime: { type: string, format: date-time }
 *               details: { type: string }
 *               metadata: { type: object }
 *               taskId: { type: string }
 *     responses:
 *       201:
 *         description: Created violation with driver info
 *       400:
 *         description: Validation error
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { driverId, platform, violationType, violationTime, details, metadata, taskId } = req.body;

    if (platform === "AMERICANA" && !AMERICANA_VIOLATION_TYPES.includes(violationType)) {
      res.status(400).json({
        error: `Americana violations must be one of: ${AMERICANA_VIOLATION_TYPES.join(", ")}`,
      });
      return;
    }

    const violation = await prisma.violation.create({
      data: {
        tenantId,
        driverId,
        platform,
        violationType,
        violationTime: new Date(violationTime),
        details,
        metadata,
        taskId,
      },
      include: { driver: { select: { id: true, name: true } } },
    });

    // Fire notifications
    await createViolationNotifications({
      tenantId,
      eventType: violationType,
      severity: getViolationSeverity(violationType),
      title: violationType.replace(/_/g, " "),
      message: details || violationType,
      sourceId: violation.id,
      metadata: { driverName: (violation as any).driver?.name },
    });

    res.status(201).json(violation);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/violations/{id}:
 *   put:
 *     tags: [Violations]
 *     summary: Update violation status
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               violationStatus: { type: string, enum: [ESTABLISHED, UNDER_REVIEW, OVERTURNED, EXPIRED] }
 *     responses:
 *       200:
 *         description: Updated violation
 *       404:
 *         description: Violation not found
 */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { violationStatus } = req.body;

    const result = await prisma.violation.updateMany({
      where: { id: req.params.id, tenantId },
      data: { violationStatus },
    });
    if (result.count === 0) { res.status(404).json({ error: "Violation not found" }); return; }

    const updated = await prisma.violation.findUnique({
      where: { id: req.params.id },
      include: { driver: { select: { id: true, name: true } } },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/violations/:id
 * Hard delete. Restricted to ADMIN/OPS_MANAGER. Cascades through Penalty/Appeal
 * via foreign-key cleanup performed in a transaction so a failure leaves no
 * orphans.
 */
router.delete("/:id", rbac(...DESTRUCTIVE), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const violation = await prisma.violation.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true },
    });
    if (!violation) { res.status(404).json({ error: "Violation not found" }); return; }

    await prisma.$transaction([
      prisma.appeal.deleteMany({ where: { violationId: violation.id } }),
      prisma.violation.update({
        where: { id: violation.id },
        data: { penalties: { set: [] } },
      }),
      prisma.violation.delete({ where: { id: violation.id } }),
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/violations/:id/root-cause
 * Body: { rootCause: "NO_RIDER_IN_ZONE" | "ALL_RIDERS_BUSY" | "ALL_REJECTED" | "SYSTEM_ERROR" | "UNKNOWN", riderIds?: string[] }
 * Ops tool for tagging unassigned-order violations. Updates metadata.rootCause
 * and metadata.riderIds (when ALL_REJECTED).
 */
router.patch("/:id/root-cause", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { rootCause, riderIds } = req.body ?? {};

    const ALLOWED = ["NO_RIDER_IN_ZONE", "ALL_RIDERS_BUSY", "ALL_REJECTED", "SYSTEM_ERROR", "UNKNOWN"];
    if (!ALLOWED.includes(rootCause)) {
      res.status(400).json({ error: `rootCause must be one of ${ALLOWED.join(", ")}` });
      return;
    }

    const violation = await prisma.violation.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!violation) { res.status(404).json({ error: "Violation not found" }); return; }

    const meta = (violation.metadata as any) ?? {};
    const nextMeta = { ...meta, rootCause, rootCauseSetAt: new Date().toISOString(), rootCauseSetBy: req.user!.userId };
    if (rootCause === "ALL_REJECTED" && Array.isArray(riderIds)) nextMeta.riderIds = riderIds;

    const updated = await prisma.violation.update({
      where: { id: violation.id },
      data: { metadata: nextMeta },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/violations/{id}/appeal:
 *   post:
 *     tags: [Violations]
 *     summary: Submit an appeal for a violation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Violation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               channel: { type: string, enum: [APP, PHONE, EMAIL] }
 *               reason: { type: string }
 *     responses:
 *       201:
 *         description: Created appeal, violation status set to PENDING
 *       404:
 *         description: Violation not found
 */
router.post("/:id/appeal", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const violationId = req.params.id;
    const { channel, reason } = req.body;

    const violation = await prisma.violation.findFirst({
      where: { id: violationId, tenantId },
    });
    if (!violation) { res.status(404).json({ error: "Violation not found" }); return; }

    // Determine appeal level: 1 if none yet, 2 if first was REJECTED, otherwise block
    let appealLevel = 1;
    if (violation.firstAppealStatus === "NOT_RAISED") {
      appealLevel = 1;
    } else if (violation.firstAppealStatus === "REJECTED" && violation.secondAppealStatus === "NOT_RAISED") {
      appealLevel = 2;
    } else {
      res.status(400).json({ error: "No further appeal allowed for this violation" });
      return;
    }

    const [appeal] = await Promise.all([
      prisma.appeal.create({
        data: { tenantId, violationId, channel, reason, appealLevel },
      }),
      prisma.violation.update({
        where: { id: violationId },
        data: {
          appealStatus: "PENDING",
          ...(appealLevel === 1
            ? { firstAppealStatus: "PENDING" as AppealStatus }
            : { secondAppealStatus: "PENDING" as AppealStatus }),
        },
      }),
    ]);

    res.status(201).json(appeal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/violations/{id}/appeal/{appealId}:
 *   put:
 *     tags: [Violations]
 *     summary: Review an appeal (approve or reject)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Violation ID
 *       - in: path
 *         name: appealId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appealStatus]
 *             properties:
 *               appealStatus: { type: string, enum: [APPROVED, REJECTED] }
 *               rejectionNote: { type: string }
 *     responses:
 *       200:
 *         description: Updated appeal; if approved, violation status set to OVERTURNED
 *       404:
 *         description: Appeal not found
 */
router.put("/:id/appeal/:appealId", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id: violationId, appealId } = req.params;
    const { appealStatus, rejectionNote } = req.body;

    if (!["APPROVED", "REJECTED"].includes(appealStatus)) {
      res.status(400).json({ error: "appealStatus must be APPROVED or REJECTED" });
      return;
    }

    // Verify appeal belongs to this tenant's violation
    const appeal = await prisma.appeal.findFirst({
      where: { id: appealId, violationId, tenant: { id: tenantId } },
    });
    if (!appeal) { res.status(404).json({ error: "Appeal not found" }); return; }

    const updated = await prisma.appeal.update({
      where: { id: appealId },
      data: {
        appealStatus,
        rejectionNote: appealStatus === "REJECTED" ? rejectionNote : null,
        reviewedAt: new Date(),
        reviewedBy: req.user!.userId,
      },
    });

    await prisma.violation.update({
      where: { id: violationId },
      data: {
        appealStatus,
        ...(updated.appealLevel === 2
          ? { secondAppealStatus: appealStatus as AppealStatus }
          : { firstAppealStatus: appealStatus as AppealStatus }),
        ...(appealStatus === "APPROVED" ? { violationStatus: "OVERTURNED" as ViolationStatus } : {}),
      },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/violations/:id/override
 * Americana supervisor override — flips the violation to OVERTURNED and
 * records the reason. There is no Appeal workflow for Americana (DA8).
 */
router.post("/:id/override", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { reason } = req.body ?? {};
    if (!reason || String(reason).trim().length < 3) {
      res.status(400).json({ error: "reason required" });
      return;
    }
    const violation = await prisma.violation.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!violation) { res.status(404).json({ error: "Violation not found" }); return; }
    const updated = await prisma.violation.update({
      where: { id: violation.id },
      data: {
        violationStatus: "OVERTURNED" as ViolationStatus,
        overrideReason: String(reason).slice(0, 500),
        overriddenBy: req.user!.userId,
        overriddenAt: new Date(),
      },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
