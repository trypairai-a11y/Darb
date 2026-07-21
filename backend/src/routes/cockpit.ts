// Darb 2.0 PRD §14 — the owner cockpit API (/api/cockpit). ADMIN only: this
// is the founders' console (revenue, margin, cash position, threshold
// alerts), not an ops surface.

import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { getCockpitSummary } from "../services/cockpitService";

const router = Router();
router.use(authMiddleware, tenantScope, rbac("ADMIN"));

/**
 * @swagger
 * /api/cockpit/summary:
 *   get:
 *     tags: [Cockpit]
 *     summary: Live founder dashboard — orders, zones, money, fleet, cash, alerts
 */
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const summary = await getCockpitSummary(req.user!.tenantId);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
