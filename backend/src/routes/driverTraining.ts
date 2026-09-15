/**
 * /api/driver-training — revision 20, the Ops tab's Driver training subtab.
 *
 * Client note, 2026-09-15: the trainee gets practice orders, the ops team
 * watches, the period is adjustable, and finishing the sessions is what
 * activates the driver's account.
 *
 * Everything real lives in `services/training/driverTrainingService.ts`; this
 * is the HTTP shape. The one rule worth repeating here is that a practice
 * order is a REAL order with `isTraining` set, assigned directly to the
 * trainee — see the service header for why both halves of that matter.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import {
  adjustTrainingPeriod,
  cancelTrainingSession,
  completeTrainingSession,
  createTrainingSession,
  issuePracticeOrder,
  listTrainingSessions,
  startTrainingSession,
  trainingSessionDetail,
} from "../services/training/driverTrainingService";

/** Training is floor work: a supervisor runs it, an ops manager oversees it. */
const RUN = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];

const router = Router();
router.use(authMiddleware, tenantScope);

function fail(res: Response, err: unknown) {
  const status = (err as { statusCode?: number })?.statusCode ?? 500;
  res.status(status).json({ error: err instanceof Error ? err.message : "Request failed" });
}

/** Every window, newest first, with live ones scored as they run. */
router.get("/", async (req: Request, res: Response) => {
  try {
    res.json({
      data: await listTrainingSessions({
        tenantId: req.user!.tenantId,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        driverId: typeof req.query.driverId === "string" ? req.query.driverId : undefined,
      }),
    });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * The branches a practice order can be collected from, for the issue form.
 *
 * Only branches with coordinates: a practice run to an address the app cannot
 * navigate to teaches the driver that the map does not work.
 */
router.get("/pickup-points", async (req: Request, res: Response) => {
  try {
    const branches = await prisma.vendorBranch.findMany({
      where: { tenantId: req.user!.tenantId, isActive: true, lat: { not: null }, lng: { not: null } },
      select: {
        id: true,
        name: true,
        address: true,
        lat: true,
        lng: true,
        vendor: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
      take: 500,
    });
    res.json({ data: branches });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const detail = await trainingSessionDetail(req.user!.tenantId, req.params.id);
    if (!detail) {
      res.status(404).json({ error: "Training session not found" });
      return;
    }
    res.json(detail);
  } catch (err) {
    fail(res, err);
  }
});

/** Open a window. Called from here and from the Driver tracking subtab. */
router.post("/", rbac(...RUN), async (req: Request, res: Response) => {
  try {
    const { driverId, periodDays, startsAt, reason } = req.body ?? {};
    if (typeof driverId !== "string" || !driverId) {
      res.status(400).json({ error: "driverId is required" });
      return;
    }
    const session = await createTrainingSession({
      tenantId: req.user!.tenantId,
      driverId,
      periodDays: Number(periodDays ?? 1),
      ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
      reason: typeof reason === "string" ? reason : null,
      coachId: req.user!.userId,
    });
    res.status(201).json(session);
  } catch (err) {
    fail(res, err);
  }
});

/** "they can adjust the training period here as an example 1/2/3 days". */
router.patch("/:id/period", rbac(...RUN), async (req: Request, res: Response) => {
  try {
    res.json(
      await adjustTrainingPeriod({
        tenantId: req.user!.tenantId,
        sessionId: req.params.id,
        periodDays: Number(req.body?.periodDays),
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

router.post("/:id/start", rbac(...RUN), async (req: Request, res: Response) => {
  try {
    res.json(await startTrainingSession(req.user!.tenantId, req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

/** Hand the trainee one practice order. */
router.post("/:id/orders", rbac(...RUN), async (req: Request, res: Response) => {
  try {
    const { branchId, dropoffAddress, dropoffLat, dropoffLng, customerName, customerPhone, slaMinutes } =
      req.body ?? {};
    if (typeof branchId !== "string" || !branchId) {
      res.status(400).json({ error: "branchId is required" });
      return;
    }
    const order = await issuePracticeOrder({
      tenantId: req.user!.tenantId,
      sessionId: req.params.id,
      branchId,
      dropoffAddress: typeof dropoffAddress === "string" ? dropoffAddress : null,
      dropoffLat: dropoffLat != null ? Number(dropoffLat) : null,
      dropoffLng: dropoffLng != null ? Number(dropoffLng) : null,
      customerName: typeof customerName === "string" ? customerName : null,
      customerPhone: typeof customerPhone === "string" ? customerPhone : null,
      ...(slaMinutes != null ? { slaMinutes: Number(slaMinutes) } : {}),
      // OrderActor has no SUPERVISOR kind — staff are USER, and the ops user
      // is named on the event either way.
      actor: { type: "USER", id: req.user!.userId, name: req.user!.email },
    });
    res.status(201).json(order);
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Close the window. PASSED is what activates the driver's account, which is
 * the sentence the client wrote this feature around.
 */
router.post("/:id/complete", rbac(...RUN), async (req: Request, res: Response) => {
  try {
    const outcome = req.body?.outcome;
    if (outcome !== "PASSED" && outcome !== "FAILED") {
      res.status(400).json({ error: "outcome must be PASSED or FAILED" });
      return;
    }
    res.json(
      await completeTrainingSession({
        tenantId: req.user!.tenantId,
        sessionId: req.params.id,
        outcome,
        note: typeof req.body?.note === "string" ? req.body.note : null,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

router.post("/:id/cancel", rbac(...RUN), async (req: Request, res: Response) => {
  try {
    res.json(
      await cancelTrainingSession({
        tenantId: req.user!.tenantId,
        sessionId: req.params.id,
        note: typeof req.body?.note === "string" ? req.body.note : null,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

export default router;
