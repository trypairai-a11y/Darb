import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { JwtPayload } from "./auth";

/**
 * blockVendorOutsideAllowlist — Darb 2.0 vendor containment (plan §A8).
 *
 * VENDOR-role tokens may only reach the vendor-facing API surface. This one
 * global middleware protects the ~60 legacy staff routers without editing
 * any of them.
 *
 * Mounting (integration phase): server.ts mounts this ONCE, app-wide, BEFORE
 * the route registrations, e.g.
 *
 *   app.use(blockVendorOutsideAllowlist);
 *   app.use("/api/auth", authRoutes);
 *   ...
 *
 * Behavior:
 *   - No credentials / invalid / expired token → next(). This middleware
 *     never rejects on auth grounds; downstream authMiddleware owns 401s.
 *     It only answers one question: "is a VENDOR trying to leave its lane?"
 *   - If an upstream middleware already populated req.user, that is trusted
 *     and no second jwt.verify is paid.
 *   - VENDOR user outside the allowlist → 403.
 *
 * Prefix matching is exact-segment ("/api/vendor" allows "/api/vendor" and
 * "/api/vendor/orders" but NOT the staff-facing "/api/vendors").
 */
const VENDOR_ALLOWED_PREFIXES = ["/api/auth", "/api/vendor", "/api/foodics", "/api/events"];

function isVendorAllowedPath(path: string): boolean {
  return VENDOR_ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export function blockVendorOutsideAllowlist(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Resolve the caller cheaply: reuse req.user when an upstream middleware
  // already decoded the token; otherwise verify the Bearer/query token with
  // the same secret authMiddleware uses, swallowing every error.
  let user: JwtPayload | undefined = req.user;
  if (!user) {
    const authHeader = req.headers.authorization;
    const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : queryToken;
    if (token) {
      try {
        user = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      } catch {
        // Invalid/expired token — not containment's problem. Downstream
        // authMiddleware will 401 protected routes; public routes stay public.
      }
    }
  }

  if (user?.role === "VENDOR") {
    // req.originalUrl survives router mounting; strip the query string so
    // "/api/events?token=..." matches its prefix.
    const path = (req.originalUrl || req.path || "").split("?")[0];
    if (!isVendorAllowedPath(path)) {
      res.status(403).json({ error: "Vendor accounts cannot access this resource" });
      return;
    }
  }

  next();
}
