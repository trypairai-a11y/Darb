import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { sendDispatchDriverPush } from "../services/driverAppPushService";

/**
 * v2 aggregation routes used by the Command Centre. One round-trip per page load.
 * These are read-only composites of existing counts — nothing new persisted here.
 */

const router = Router();
router.use(authMiddleware, tenantScope);

// GET /api/v2/pulse — 5 numbers for the pulse strip.
router.get("/pulse", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [onShift, ordersInFlight, cashPendingAgg, openViolations, queuePending] = await Promise.all([
      prisma.courierOnlineSession.count({ where: { tenantId, isOnline: true } }),
      prisma.shift.count({ where: { tenantId, status: "IN_PROGRESS" } }),
      prisma.cashRecord.aggregate({
        where: { tenantId, status: { in: ["PENDING", "PARTIALLY_PAID"] } },
        _sum: { pendingDues: true },
      }),
      prisma.violation.count({ where: { tenantId, violationStatus: "ESTABLISHED" } }),
      prisma.pendingAgentAction.count({ where: { tenantId, resolvedAt: null } }),
    ]);

    res.json({
      onShift,
      ordersInFlight,
      cashPendingKd: Number(cashPendingAgg._sum.pendingDues ?? 0),
      openViolations,
      queuePending,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/briefing — most recent Narrator briefing (Notification category=BRIEFING).
router.get("/briefing", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const latest = await prisma.notification.findFirst({
      where: { tenantId, category: "BRIEFING", type: "narrator_briefing" },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) return res.json(null);
    const content = (latest.metadata ?? {}) as any;
    res.json({
      summary: content?.summary ?? latest.message,
      alerts: content?.alerts ?? [],
      recommendations: content?.recommendations ?? [],
      generatedAt: latest.createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/dispatch/driver-push — app-only push to suggested drivers.
router.post("/dispatch/driver-push", async (req: Request, res: Response) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const driverIds = Array.isArray(req.body?.driverIds) ? req.body.driverIds.filter((id: unknown) => typeof id === "string") : [];
    const candidateNames = Array.isArray(req.body?.candidateNames)
      ? req.body.candidateNames.filter((name: unknown) => typeof name === "string")
      : [];

    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }
    if (!body) {
      res.status(400).json({ error: "Body is required" });
      return;
    }

    const result = await sendDispatchDriverPush({
      tenantId: req.user!.tenantId,
      issuedById: req.user!.userId,
      driverIds,
      candidateNames,
      title,
      body,
      data: {
        actionId: typeof req.body?.actionId === "string" ? req.body.actionId : null,
        zone: typeof req.body?.zone === "string" ? req.body.zone : null,
        window: typeof req.body?.window === "string" ? req.body.window : null,
      },
    });

    if (result.targeted === 0) {
      res.status(404).json({ error: "No active matching drivers found" });
      return;
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
