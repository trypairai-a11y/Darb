import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  // Darb 2.0 — set for role=VENDOR users; scopes the vendor portal.
  // Sourced from the User row at sign time, never from the client.
  vendorId?: string;
  // Revision #9 — the vendor portal sub-role and, for ORDER_TRACKING, the one
  // branch this login may see. Both come from the User row at sign time.
  vendorRole?: string;
  branchId?: string;
  // Darb 2.0 PRD — set for role=FLEET users; scopes the fleet portal.
  fleetPartnerId?: string;
  // Revision #15/#27 — a FLEET login that reaches every partner in its owner
  // group rather than a single one.
  ownerGroupId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : queryToken;

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
