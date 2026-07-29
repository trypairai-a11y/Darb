import { Request, Response, NextFunction } from "express";
import { prisma } from "../config";

/**
 * vendorScope — Darb 2.0 vendor-portal gate.
 *
 * Must run AFTER authMiddleware (req.user populated from the JWT). The normal
 * caller is a VENDOR-role user whose token carries a vendorId. That vendorId is
 * read from the signed JWT payload — never from the client — so downstream
 * handlers can trust `req.user!.vendorId` as the scoping key (mirrors how
 * tenantScope trusts `req.user.tenantId`).
 *
 * There is one other caller: an ADMIN inspecting a merchant's portal. The
 * client already let admins browse to /vendor ("ADMIN may inspect either
 * portal", PortalGuard) while this gate 403'd every request they made there, so
 * inspection was a promise the API did not keep and an admin who followed the
 * link got an error screen. It works now, under three conditions that keep it
 * an inspection rather than a second way to be a merchant:
 *
 *   1. ADMIN only. Not OPS_MANAGER, not SUPERVISOR. ADMIN is the role the
 *      permission service never gates, so it is the only one that can be
 *      granted this without a per-surface story to go with it.
 *   2. GET only. An admin may read a merchant's portal, never act inside it:
 *      no placing orders, no cancelling, no requesting refunds as them. Those
 *      have staff endpoints of their own that record who did it.
 *   3. An explicit ?vendorId that resolves inside the admin's own tenant.
 *      Absent it there is nothing to scope to, and a vendorId from another
 *      tenant is a 404 — the same answer as one that does not exist, so this
 *      cannot be used to probe which vendor ids are real.
 *
 * Composition (routes/vendorPortal.ts):
 *   router.use(authMiddleware, tenantScope, rbac("VENDOR", "ADMIN"), vendorScope);
 */
export async function vendorScope(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // The ordinary path: a vendor user in their own portal.
  if (req.user.role === "VENDOR" && req.user.vendorId) {
    next();
    return;
  }

  if (req.user.role === "ADMIN") {
    const inspectId = typeof req.query.vendorId === "string" ? req.query.vendorId : null;
    if (!inspectId) {
      res.status(403).json({ error: "Vendor account required" });
      return;
    }
    if (req.method !== "GET") {
      res.status(403).json({ error: "Read-only while inspecting a merchant portal" });
      return;
    }
    try {
      const vendor = await prisma.vendor.findFirst({
        where: { id: inspectId, tenantId: req.user.tenantId },
        select: { id: true },
      });
      if (!vendor) {
        res.status(404).json({ error: "Vendor not found" });
        return;
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
      return;
    }
    // Downstream handlers read req.user.vendorId and cannot tell the
    // difference, which is the point: one code path, one scoping key.
    req.user.vendorId = inspectId;
    next();
    return;
  }

  res.status(403).json({ error: "Vendor account required" });
}
