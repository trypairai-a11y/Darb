import { Request, Response, NextFunction } from "express";

/**
 * vendorScope — Darb 2.0 vendor-portal gate.
 *
 * Must run AFTER authMiddleware (req.user populated from the JWT). Allows the
 * request through only when the caller is a VENDOR-role user whose token
 * carries a vendorId. The vendorId is read from the signed JWT payload —
 * never from the client — so downstream handlers can trust
 * `req.user!.vendorId` as the scoping key (mirrors how tenantScope trusts
 * `req.user.tenantId`).
 *
 * Composition (routes/vendorPortal.ts):
 *   router.use(authMiddleware, tenantScope, rbac("VENDOR"), vendorScope);
 */
export function vendorScope(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.user.role !== "VENDOR" || !req.user.vendorId) {
    res.status(403).json({ error: "Vendor account required" });
    return;
  }
  next();
}
