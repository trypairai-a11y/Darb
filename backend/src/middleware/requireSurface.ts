/**
 * Surface gate — revision 4 (#12).
 *
 * rbac() answers "is this role allowed here". This answers "is this person
 * allowed here", which is the question a per-user permissions page creates.
 * Hiding a rail entry is a courtesy; this is the part that means it.
 *
 * Compose it after rbac(), not instead of it: the role check stays the coarse
 * filter and this narrows it.
 */
import { Request, Response, NextFunction } from "express";
import { AppSurface, PermissionLevel } from "../generated/prisma";
import { can } from "../services/permissionService";
import { logger } from "../config/logger";

export function requireSurface(
  surface: AppSurface,
  required: Exclude<PermissionLevel, "NONE"> = "VIEW",
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    try {
      if (!(await can(req.user.tenantId, req.user.userId, surface, required))) {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }
      next();
    } catch (err) {
      // A permissions lookup that cannot run must not become an open door.
      logger.error({ err, surface }, "requireSurface: permission lookup failed");
      res.status(403).json({ error: "Insufficient permissions" });
    }
  };
}
