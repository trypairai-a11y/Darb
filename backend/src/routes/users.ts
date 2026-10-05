import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { requireSurface } from "../middleware/requireSurface";
import { getPagination, paginatedResponse } from "../utils/pagination";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { AppSurface, PermissionLevel, Prisma } from "../generated/prisma";
import { createInvite, emailInvite } from "../services/inviteService";
import {
  APP_SURFACES,
  defaultsForRole,
  managedVendorIds,
  resolvePermissions,
} from "../services/permissionService";
import {
  ACCEPTED_VENDOR_ROLE_INPUTS,
  effectiveVendorTabs,
  normaliseVendorRole,
  parseVendorTabs,
  vendorRoleTakesBranch,
} from "../services/vendorTabService";
import {
  ACCEPTED_FLEET_ROLE_INPUTS,
  effectiveFleetTabs,
  normaliseFleetRole,
  parseFleetTabs,
} from "../services/fleet/fleetTabService";

const router = Router();

/** The delivery companies an account manager is responsible for, the fleet
 *  twin of managedVendorIds. Empty for other roles. */
async function managedFleetIds(tenantId: string, userId: string): Promise<string[]> {
  const rows = await prisma.accountManagerFleet.findMany({
    where: { tenantId, userId },
    select: { fleetPartnerId: true },
  });
  return rows.map((r) => r.fleetPartnerId);
}
// Revision 4 (#12): rbac() answers "is this role allowed here"; requireSurface
// narrows it to "is this person allowed here", which is what a per-user
// permissions page creates. ADMIN is exempt — see the middleware.
router.use(authMiddleware, tenantScope, requireSurface("PEOPLE", "VIEW"));

// ─── List Users ─────────────────────────────────────────────────────────────

router.get("/", rbac("ADMIN", "OPS_MANAGER"), async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { role, search, isActive } = req.query;

    const where: any = { tenantId };
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === "true";
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, email: true, name: true, phone: true,
          role: true, isActive: true, lastLoginAt: true, createdAt: true,
          // Revision 17 (#10) — which portal this login belongs to. Every user
          // carries a staff `role` whatever portal they sign into, so a list
          // keyed on role alone showed a delivery company's manager as ADMIN
          // beside a Darb admin. The linkage was always on the row; it was
          // simply never selected, so the client read it as everyone sharing
          // one role. The names come along so the column can say which shop.
          vendorId: true,
          fleetPartnerId: true,
          vendor: { select: { name: true } },
          fleetPartner: { select: { name: true } },
          vendorRole: true,
          fleetRole: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Client note of 2026-10-05: the Role column showed a shop manager's staff
    // `role` (ADMIN, the default every portal login is created with) while the
    // shop's own Users tab showed their real portal role (Supervisor), so one
    // person read as two different things. A portal login is governed by its
    // portal role, so that is the one this list reports.
    const rows = data.map(({ vendorRole, fleetRole, ...u }) => {
      const portal = portalOfUser(u);
      return {
        ...u,
        portal,
        portalRole:
          portal === "FLEET" ? normaliseFleetRole(fleetRole)
          : portal === "VENDOR" ? normaliseVendorRole(vendorRole)
          : null,
      };
    });

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get Single User ────────────────────────────────────────────────────────

router.get("/:id", rbac("ADMIN", "OPS_MANAGER"), async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      select: {
        id: true, email: true, name: true, phone: true,
        role: true, isActive: true, lastLoginAt: true, createdAt: true,
      },
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Invite (Create) User ───────────────────────────────────────────────────
//
// Revision 4 (#12): the admin no longer sets anyone's password. The row is
// created with an unusable random hash and the invited person chooses their
// own credential from a link that expires. `password` in the body is ignored
// rather than rejected, so an older client cannot set one by accident.

router.post("/", rbac("ADMIN"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { email, name, phone, role } = req.body;

    if (!email || !name) {
      res.status(400).json({ error: "email and name are required" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) { res.status(409).json({ error: "Email already in use" }); return; }

    // Unusable by construction: nobody knows this string and nothing returns
    // it. The account is unreachable until the invite is redeemed.
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        phone: phone || null,
        role: role || "VIEWER",
        passwordHash,
        tenantId,
      },
      select: {
        id: true, email: true, name: true, phone: true,
        role: true, isActive: true, createdAt: true,
      },
    });

    const invite = await createInvite({ tenantId, userId: user.id });
    const delivery = await emailInvite({
      email: user.email,
      name: user.name,
      url: invite.url,
      expiresAt: invite.expiresAt,
    });

    // inviteUrl comes back regardless of whether the email left the building,
    // so invites work by copy-paste today and by email once a provider key is
    // configured.
    res.status(201).json({
      ...user,
      inviteUrl: invite.url,
      inviteExpiresAt: invite.expiresAt,
      emailSent: delivery.ok,
      emailProvider: delivery.provider,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Re-invite ──────────────────────────────────────────────────────────────

router.post("/:id/invite", rbac("ADMIN"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, email: true, name: true },
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const invite = await createInvite({ tenantId, userId: user.id });
    const delivery = await emailInvite({
      email: user.email,
      name: user.name,
      url: invite.url,
      expiresAt: invite.expiresAt,
    });
    res.json({
      inviteUrl: invite.url,
      inviteExpiresAt: invite.expiresAt,
      emailSent: delivery.ok,
      emailProvider: delivery.provider,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Client note (2026-10-04): opening Permissions on a delivery-company login
// showed Ops, Compliance, Finance and Admin, none of which that person can ever
// reach. A portal login is fenced by its portal's own tab list (vendorTabs /
// fleetTabs), so that list is what an admin edits for them. HQ surfaces stay
// for HQ staff only.
type PortalKind = "VENDOR" | "FLEET";

const PORTAL_USER_SELECT = {
  id: true, role: true, vendorId: true, fleetPartnerId: true,
  vendorRole: true, vendorTabs: true, fleetRole: true, fleetTabs: true,
} as const;

function portalOfUser(u: { role: string; vendorId: string | null; fleetPartnerId: string | null }): PortalKind | null {
  if (u.role === "FLEET" || u.fleetPartnerId) return "FLEET";
  if (u.role === "VENDOR" || u.vendorId) return "VENDOR";
  return null;
}

// ─── Per-surface permissions (revision 4 #12) ───────────────────────────────
//
// GET returns the effective map plus the role's defaults, so the page can show
// "inherited" rather than pretending every cell was chosen by a human.

router.get("/:id/permissions", rbac("ADMIN"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId },
      select: PORTAL_USER_SELECT,
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const portal = portalOfUser(user);
    if (portal) {
      res.json(
        portal === "FLEET"
          ? {
              portal,
              portalRole: normaliseFleetRole(user.fleetRole),
              portalTabs: parseFleetTabs(user.fleetTabs),
              effectiveTabs: effectiveFleetTabs(user.fleetRole, user.fleetTabs),
            }
          : {
              portal,
              portalRole: normaliseVendorRole(user.vendorRole),
              portalTabs: parseVendorTabs(user.vendorTabs),
              effectiveTabs: effectiveVendorTabs(user.vendorRole, user.vendorTabs),
            },
      );
      return;
    }

    const [effective, overrides, vendorIds, fleetIds] = await Promise.all([
      resolvePermissions(tenantId, user.id),
      prisma.userSurfacePermission.findMany({
        where: { tenantId, userId: user.id },
        select: { surface: true, level: true },
      }),
      managedVendorIds(tenantId, user.id),
      managedFleetIds(tenantId, user.id),
    ]);

    res.json({
      surfaces: APP_SURFACES,
      role: user.role,
      defaults: defaultsForRole(user.role),
      overrides: Object.fromEntries(overrides.map((o) => [o.surface, o.level])),
      effective,
      managedVendorIds: vendorIds,
      managedFleetIds: fleetIds,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id/permissions", rbac("ADMIN"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId },
      select: PORTAL_USER_SELECT,
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // A portal login takes its portal's tab list and nothing else: writing HQ
    // surface overrides onto it would grant nothing and only confuse an audit.
    const portal = portalOfUser(user);
    if (portal) {
      const raw = (req.body as { portalTabs?: unknown }).portalTabs;
      if (raw === undefined) { res.status(400).json({ error: "portalTabs is required" }); return; }
      if (raw !== null && !Array.isArray(raw)) { res.status(400).json({ error: "portalTabs must be a list or null" }); return; }
      if (portal === "FLEET") {
        const tabs = raw === null ? null : parseFleetTabs(raw);
        await prisma.user.update({ where: { id: user.id }, data: { fleetTabs: tabs ?? Prisma.DbNull } });
        res.json({ portal, portalTabs: tabs, effectiveTabs: effectiveFleetTabs(user.fleetRole, tabs) });
      } else {
        const tabs = raw === null ? null : parseVendorTabs(raw);
        await prisma.user.update({ where: { id: user.id }, data: { vendorTabs: tabs ?? Prisma.DbNull } });
        res.json({ portal, portalTabs: tabs, effectiveTabs: effectiveVendorTabs(user.vendorRole, tabs) });
      }
      return;
    }

    const body = req.body as {
      overrides?: Record<string, string | null>;
      managedVendorIds?: string[];
      managedFleetIds?: string[];
    };

    if (body.overrides) {
      const entries = Object.entries(body.overrides);
      for (const [surface, level] of entries) {
        if (!APP_SURFACES.includes(surface as AppSurface)) {
          res.status(400).json({ error: `Unknown surface: ${surface}` });
          return;
        }
        if (level != null && !["NONE", "VIEW", "EDIT"].includes(level)) {
          res.status(400).json({ error: `Unknown level: ${level}` });
          return;
        }
      }
      // null clears the override and puts the surface back on the role default,
      // which is a different thing from granting NONE.
      await prisma.$transaction(async (tx) => {
        for (const [surface, level] of entries) {
          if (level == null) {
            await tx.userSurfacePermission.deleteMany({
              where: { userId: user.id, surface: surface as AppSurface },
            });
          } else {
            await tx.userSurfacePermission.upsert({
              where: {
                userId_surface: { userId: user.id, surface: surface as AppSurface },
              },
              create: {
                tenantId,
                userId: user.id,
                surface: surface as AppSurface,
                level: level as PermissionLevel,
              },
              update: { level: level as PermissionLevel },
            });
          }
        }
      });
    }

    if (body.managedVendorIds) {
      const valid = await prisma.vendor.findMany({
        where: { tenantId, id: { in: body.managedVendorIds } },
        select: { id: true },
      });
      const validIds = valid.map((v) => v.id);
      await prisma.$transaction(async (tx) => {
        await tx.accountManagerVendor.deleteMany({ where: { tenantId, userId: user.id } });
        if (validIds.length > 0) {
          await tx.accountManagerVendor.createMany({
            data: validIds.map((vendorId) => ({ tenantId, userId: user.id, vendorId })),
          });
        }
      });
    }

    // Client note of 2026-08-16: "only the vendor/delivery company account
    // manager will get notifications regarding the companies he is handling".
    // AccountManagerFleet existed but nothing wrote it, so a delivery
    // company's operations requests reached no account manager at all. Same
    // replace-the-whole-set semantics as the merchant links above.
    if (body.managedFleetIds) {
      const valid = await prisma.fleetPartner.findMany({
        where: { tenantId, id: { in: body.managedFleetIds } },
        select: { id: true },
      });
      const validIds = valid.map((f) => f.id);
      await prisma.$transaction(async (tx) => {
        await tx.accountManagerFleet.deleteMany({ where: { tenantId, userId: user.id } });
        if (validIds.length > 0) {
          await tx.accountManagerFleet.createMany({
            data: validIds.map((fleetPartnerId) => ({ tenantId, userId: user.id, fleetPartnerId })),
          });
        }
      });
    }

    const [effective, vendorIds, fleetIds] = await Promise.all([
      resolvePermissions(tenantId, user.id),
      managedVendorIds(tenantId, user.id),
      managedFleetIds(tenantId, user.id),
    ]);
    res.json({ effective, managedVendorIds: vendorIds, managedFleetIds: fleetIds });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Update User (role, name, phone) ────────────────────────────────────────

router.put("/:id", rbac("ADMIN"), async (req: Request, res: Response) => {
  try {
    const { name, phone, role, portalRole } = req.body;
    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (role) updateData.role = role;

    // A portal login's role is edited here too, so the Admin list and the
    // shop's or company's own Users tab never disagree about what it is.
    if (typeof portalRole === "string") {
      const target = await prisma.user.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
        select: PORTAL_USER_SELECT,
      });
      if (!target) { res.status(404).json({ error: "User not found" }); return; }
      const portal = portalOfUser(target);
      if (portal === "FLEET") {
        if (!ACCEPTED_FLEET_ROLE_INPUTS.includes(portalRole)) {
          res.status(400).json({ error: "Unknown role" }); return;
        }
        updateData.fleetRole = normaliseFleetRole(portalRole);
      } else if (portal === "VENDOR") {
        if (!ACCEPTED_VENDOR_ROLE_INPUTS.includes(portalRole)) {
          res.status(400).json({ error: "Unknown role" }); return;
        }
        // A supervisor is scoped to one branch and this list has no branch
        // picker, so the shop's Users tab is where that role is given.
        if (vendorRoleTakesBranch(portalRole)) {
          const row = await prisma.user.findUnique({ where: { id: target.id }, select: { branchId: true } });
          if (!row?.branchId) {
            res.status(400).json({ error: "A supervisor needs a branch. Set it from the shop's Users tab." });
            return;
          }
        } else {
          updateData.branchId = null;
        }
        updateData.vendorRole = normaliseVendorRole(portalRole);
      } else {
        res.status(400).json({ error: "This user has no portal role" }); return;
      }
    }

    const result = await prisma.user.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data: updateData,
    });
    if (result.count === 0) { res.status(404).json({ error: "User not found" }); return; }

    const updated = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, email: true, name: true, phone: true,
        role: true, isActive: true, createdAt: true,
      },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Toggle Active Status ───────────────────────────────────────────────────

router.put("/:id/toggle-active", rbac("ADMIN"), async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // Prevent deactivating yourself
    if (user.id === req.user!.userId) {
      res.status(400).json({ error: "Cannot deactivate yourself" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: !user.isActive },
      select: {
        id: true, email: true, name: true, phone: true,
        role: true, isActive: true, createdAt: true,
      },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
