import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { JwtPayload } from "./auth";

/**
 * blockCashCollectorOutsideAllowlist — revision 4 (#3).
 *
 * The client asked for the cash hand-in desk to be "a different portal for
 * cash collection only". Mirror of vendorContainment and fleetContainment: a
 * CASH_COLLECTOR token reaches the hand-in surface and nothing else, so the
 * person on the desk cannot wander into the ledger, the order console or the
 * merchant list even by typing a URL.
 *
 * Never rejects on auth grounds (downstream authMiddleware owns 401s); only
 * answers "is a cash collector leaving its lane?"
 *
 * Prefix matching is exact-segment, the same rule the other two fences use.
 */
const CASH_ALLOWED_PREFIXES = [
  "/api/auth",
  "/api/wallets/remittances",
  "/api/drivers", // the hand-in form needs the driver picker
  "/api/events",
];

function isCashAllowedPath(path: string): boolean {
  return CASH_ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export function blockCashCollectorOutsideAllowlist(
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

  if (user?.role === "CASH_COLLECTOR") {
    const path = (req.originalUrl || req.path || "").split("?")[0];
    if (!isCashAllowedPath(path)) {
      res.status(403).json({ error: "Cash desk accounts cannot access this resource" });
      return;
    }
  }

  next();
}
