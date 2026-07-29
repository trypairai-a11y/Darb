import { Request, Response, NextFunction } from "express";
import { prisma } from "../config";

/**
 * fleetScope — the /api/fleet/* gate, and the mirror of vendorScope.
 *
 * The ordinary caller is a FLEET-role user whose token carries a
 * fleetPartnerId; fleetContext in routes/fleetPortal then decides which partner
 * of an owner group they are acting as. That path is untouched here.
 *
 * The other caller is an ADMIN inspecting a partner's portal. PortalGuard has
 * always said admins may inspect either portal, but /api/fleet answered
 * rbac("FLEET") with a 403, which tripped the client's error interceptor and
 * bounced the admin to /login — so the promise did not just fail, it looked
 * like being signed out. Admitted now under the same three conditions that
 * govern merchant inspection, for the same reasons:
 *
 *   1. ADMIN only, not OPS_MANAGER or SUPERVISOR.
 *   2. GET only. Reading a partner's roster, scorecard and payouts is
 *      inspection; changing any of it is staff work with its own endpoints
 *      under /api/fleets, which record who did it.
 *   3. An explicit ?fleetPartnerId that resolves inside the admin's own
 *      tenant. One from another tenant is a 404, indistinguishable from one
 *      that does not exist.
 *
 * The id is written onto req.user, so fleetContext treats an inspecting admin
 * exactly like a single-partner fleet user and no handler needs to know.
 */
export async function fleetScope(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (req.user.role === "FLEET") {
    next();
    return;
  }

  if (req.user.role === "ADMIN") {
    const inspectId =
      typeof req.query.fleetPartnerId === "string" ? req.query.fleetPartnerId : null;
    if (!inspectId) {
      res.status(403).json({ error: "Fleet account required" });
      return;
    }
    if (req.method !== "GET") {
      res.status(403).json({ error: "Read-only while inspecting a fleet portal" });
      return;
    }
    try {
      const partner = await prisma.fleetPartner.findFirst({
        where: { id: inspectId, tenantId: req.user.tenantId },
        select: { id: true },
      });
      if (!partner) {
        res.status(404).json({ error: "Fleet partner not found" });
        return;
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
      return;
    }
    (req.user as { fleetPartnerId?: string }).fleetPartnerId = inspectId;
    next();
    return;
  }

  res.status(403).json({ error: "Fleet account required" });
}
