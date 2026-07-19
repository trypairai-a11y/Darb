import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { validateBody } from "../utils/validate";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { parseLocalDate, parseLocalDateEnd } from "../utils/date";
import { publishEvent } from "../services/eventBus";

// Darb 2.0 §A8 — staff-facing incident console (list, ack, resolve).
// Incidents are raised by drivers (SOS via /api/agent/incidents) or created
// manually by staff; this router is the ops-side lifecycle: OPEN →
// ACKNOWLEDGED → RESOLVED (resolve is also allowed straight from OPEN).

const SUPERVISOR_PLUS = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];

const INCIDENT_TYPES = ["SOS", "ACCIDENT", "VEHICLE_BREAKDOWN", "CUSTOMER_ISSUE", "OTHER"] as const;
const INCIDENT_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;

const DRIVER_SELECT = { id: true, name: true, phone: true } as const;

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── Schemas ────────────────────────────────────────────────────────────────

// NOTE: Incident.driverId is a required column in schema.prisma, so it is
// required here too (the PRD sketch listed it optional — a nullable driverId
// cannot be persisted without a schema change, which this track does not own).
const createIncidentSchema = z.object({
  type: z.enum(INCIDENT_TYPES),
  driverId: z.string().min(1, "Driver is required"),
  orderId: z.string().min(1).optional(),
  description: z.string().max(2000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

const resolveIncidentSchema = z.object({
  resolutionNote: z.string().max(2000).optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function publishIncidentUpdated(
  tenantId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await publishEvent({
    type: "incident.updated",
    tenantId,
    timestamp: new Date().toISOString(),
    payload,
  });
}

/**
 * @swagger
 * /api/incidents:
 *   get:
 *     tags: [Incidents]
 *     summary: List incidents with filters and pagination (newest first)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [OPEN, ACKNOWLEDGED, RESOLVED] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [SOS, ACCIDENT, VEHICLE_BREAKDOWN, CUSTOMER_ISSUE, OTHER] }
 *       - in: query
 *         name: driverId
 *         schema: { type: string }
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
 *         description: Paginated incident list with driver info
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { status, type, driverId, dateFrom, dateTo } = req.query;

    if (status && !INCIDENT_STATUSES.includes(status as any)) {
      res.status(400).json({ error: `status must be one of ${INCIDENT_STATUSES.join(", ")}` });
      return;
    }
    if (type && !INCIDENT_TYPES.includes(type as any)) {
      res.status(400).json({ error: `type must be one of ${INCIDENT_TYPES.join(", ")}` });
      return;
    }

    const where: any = { tenantId };
    if (status) where.status = status as string;
    if (type) where.type = type as string;
    if (driverId) where.driverId = driverId as string;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.createdAt.lte = parseLocalDateEnd(dateTo as string);
    }

    const [data, total] = await Promise.all([
      prisma.incident.findMany({
        where: { ...where, tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { driver: { select: DRIVER_SELECT } },
      }),
      prisma.incident.count({ where: { ...where, tenantId } }),
    ]);

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/incidents/{id}:
 *   get:
 *     tags: [Incidents]
 *     summary: Get a single incident with driver info
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Incident detail
 *       404:
 *         description: Incident not found
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const incident = await prisma.incident.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { driver: { select: DRIVER_SELECT } },
    });
    if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }
    res.json(incident);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/incidents:
 *   post:
 *     tags: [Incidents]
 *     summary: Create a staff-reported incident (SUPERVISOR+)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, driverId]
 *             properties:
 *               type: { type: string, enum: [SOS, ACCIDENT, VEHICLE_BREAKDOWN, CUSTOMER_ISSUE, OTHER] }
 *               driverId: { type: string }
 *               orderId: { type: string }
 *               description: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *     responses:
 *       201:
 *         description: Created incident (severity HIGH, CRITICAL for SOS; reportedVia PORTAL)
 *       400:
 *         description: Validation error
 */
router.post(
  "/",
  rbac(...SUPERVISOR_PLUS),
  validateBody(createIncidentSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { type, driverId, orderId, description, latitude, longitude } = req.body;

      const incident = await prisma.incident.create({
        data: {
          tenantId,
          type,
          driverId,
          orderId,
          description,
          lat: latitude,
          lng: longitude,
          severity: type === "SOS" ? "CRITICAL" : "HIGH",
          reportedVia: "PORTAL",
        },
        include: { driver: { select: DRIVER_SELECT } },
      });

      res.status(201).json(incident);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/incidents/{id}/ack:
 *   post:
 *     tags: [Incidents]
 *     summary: Acknowledge an OPEN incident (SUPERVISOR+)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Incident acknowledged
 *       404:
 *         description: Incident not found
 *       409:
 *         description: Incident is not OPEN
 */
router.post("/:id/ack", rbac(...SUPERVISOR_PLUS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    // Conditional transition — the status guard lives in the WHERE clause so a
    // concurrent double-ack can never both succeed.
    const result = await prisma.incident.updateMany({
      where: { id: req.params.id, tenantId, status: "OPEN" },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedById: req.user!.userId,
        acknowledgedAt: new Date(),
      },
    });

    if (result.count === 0) {
      const existing = await prisma.incident.findFirst({
        where: { id: req.params.id, tenantId },
        select: { id: true, status: true },
      });
      if (!existing) { res.status(404).json({ error: "Incident not found" }); return; }
      res.status(409).json({ error: `Incident is ${existing.status} — only OPEN incidents can be acknowledged` });
      return;
    }

    const incident = await prisma.incident.findFirst({
      where: { id: req.params.id, tenantId },
      include: { driver: { select: DRIVER_SELECT } },
    });

    await publishIncidentUpdated(tenantId, {
      incidentId: req.params.id,
      status: "ACKNOWLEDGED",
      type: incident?.type,
      driverId: incident?.driverId,
      acknowledgedById: req.user!.userId,
    });

    res.json(incident);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/incidents/{id}/resolve:
 *   post:
 *     tags: [Incidents]
 *     summary: Resolve an OPEN or ACKNOWLEDGED incident (SUPERVISOR+)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resolutionNote: { type: string }
 *     responses:
 *       200:
 *         description: Incident resolved
 *       404:
 *         description: Incident not found
 *       409:
 *         description: Incident already resolved
 */
router.post(
  "/:id/resolve",
  rbac(...SUPERVISOR_PLUS),
  validateBody(resolveIncidentSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { resolutionNote } = req.body;

      const result = await prisma.incident.updateMany({
        where: { id: req.params.id, tenantId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
        data: {
          status: "RESOLVED",
          resolvedById: req.user!.userId,
          resolvedAt: new Date(),
          resolutionNote,
        },
      });

      if (result.count === 0) {
        const existing = await prisma.incident.findFirst({
          where: { id: req.params.id, tenantId },
          select: { id: true, status: true },
        });
        if (!existing) { res.status(404).json({ error: "Incident not found" }); return; }
        res.status(409).json({ error: "Incident is already RESOLVED" });
        return;
      }

      const incident = await prisma.incident.findFirst({
        where: { id: req.params.id, tenantId },
        include: { driver: { select: DRIVER_SELECT } },
      });

      await publishIncidentUpdated(tenantId, {
        incidentId: req.params.id,
        status: "RESOLVED",
        type: incident?.type,
        driverId: incident?.driverId,
        resolvedById: req.user!.userId,
      });

      res.json(incident);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

export default router;
