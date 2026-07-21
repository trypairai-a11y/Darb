import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { JwtPayload } from "./auth";

/**
 * blockFleetOutsideAllowlist — Darb 2.0 PRD §9 fleet-partner containment.
 * Mirror of vendorContainment: FLEET-role tokens may only reach the
 * fleet-facing API surface. Never rejects on auth grounds (downstream
 * authMiddleware owns 401s); only answers "is a FLEET user leaving its lane?"
 *
 * Prefix matching is exact-segment ("/api/fleet" allows "/api/fleet" and
 * "/api/fleet/scorecard" but NOT the staff-facing "/api/fleets").
 */
const FLEET_ALLOWED_PREFIXES = ["/api/auth", "/api/fleet", "/api/events"];

function isFleetAllowedPath(path: string): boolean {
  return FLEET_ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export function blockFleetOutsideAllowlist(
  req: Request,
  res: Response,
  next: NextFunction
): void {
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
        // Invalid/expired token — downstream authMiddleware owns the 401.
      }
    }
  }

  if (user?.role === "FLEET") {
    const path = (req.originalUrl || req.path || "").split("?")[0];
    if (!isFleetAllowedPath(path)) {
      res.status(403).json({ error: "Fleet accounts cannot access this resource" });
      return;
    }
  }

  next();
}
