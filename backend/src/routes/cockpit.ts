// Darb 2.0 PRD §14 — the owner cockpit API (/api/cockpit). ADMIN only: this
// is the founders' console (revenue, margin, cash position, threshold
// alerts), not an ops surface.

import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { requireSurface } from "../middleware/requireSurface";
import { getCockpitSummary } from "../services/cockpitService";

const router = Router();
// Revision 4 (#12) — the role gate, then the per-user one.
router.use(authMiddleware, tenantScope, rbac("ADMIN"), requireSurface("TODAY", "VIEW"));

/**
 * @swagger
 * /api/cockpit/summary:
 *   get:
 *     tags: [Cockpit]
 *     summary: Live founder dashboard — orders, zones, money, fleet, cash, alerts
 */
/**
 * Parse a YYYY-MM-DD query param into a local Date, or undefined when it is
 * absent or unparseable. `endOfDay` pushes to 23:59:59.999 so a closed range
 * includes its final day rather than stopping at midnight.
 */
function parseRangeDate(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

router.get("/summary", async (req: Request, res: Response) => {
  try {
    // Revision #26 — ?from= and ?to= scope the period tiles (delivered,
    // on-time, fees, fleet cost, net margin, deposited, per-zone). Omitted,
    // the window is today, which is the behaviour this endpoint always had.
    const from = parseRangeDate(req.query.from);
    const to = parseRangeDate(req.query.to, true);
    if (from && to && to < from) {
      res.status(400).json({ error: "`to` must not be earlier than `from`" });
      return;
    }
    const summary = await getCockpitSummary(req.user!.tenantId, { from, to });
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
