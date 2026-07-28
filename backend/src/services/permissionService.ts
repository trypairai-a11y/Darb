/**
 * Per-user surface permissions — revision 4 (#12).
 *
 * The client asked for "a page for restrictions for each user, what he can
 * view or change". A surface here is a screen, not an API route, because a
 * screen is what a person can name. The rail and the API then agree by
 * construction: both ask this service.
 *
 * Resolution is role default, then per-user override. Absence of a row means
 * "inherit the role", which is what lets this ship with no backfill — every
 * existing user has no rows and behaves exactly as before.
 */
import { AppSurface, PermissionLevel } from "../generated/prisma";
import { prisma } from "../config";

export const APP_SURFACES: AppSurface[] = [
  "LIVE",
  "ORDERS",
  "MONEY",
  "SETUP",
  "TODAY",
  "CASH_DESK",
  "PEOPLE",
];

/**
 * What each role can reach with no overrides configured. This is the existing
 * rbac shape written down in one place rather than a new policy: ADMIN sees
 * everything, OPS_MANAGER runs the network, SUPERVISOR works the floor,
 * ACCOUNTANT owns money, VIEWER reads.
 */
const ROLE_DEFAULTS: Record<string, Partial<Record<AppSurface, PermissionLevel>>> = {
  ADMIN: {
    LIVE: "EDIT", ORDERS: "EDIT", MONEY: "EDIT", SETUP: "EDIT",
    TODAY: "EDIT", CASH_DESK: "EDIT", PEOPLE: "EDIT",
  },
  OPS_MANAGER: {
    LIVE: "EDIT", ORDERS: "EDIT", MONEY: "VIEW", SETUP: "EDIT",
    TODAY: "NONE", CASH_DESK: "VIEW", PEOPLE: "VIEW",
  },
  SUPERVISOR: {
    LIVE: "EDIT", ORDERS: "EDIT", MONEY: "NONE", SETUP: "NONE",
    TODAY: "NONE", CASH_DESK: "EDIT", PEOPLE: "NONE",
  },
  ACCOUNTANT: {
    LIVE: "VIEW", ORDERS: "VIEW", MONEY: "EDIT", SETUP: "NONE",
    TODAY: "NONE", CASH_DESK: "EDIT", PEOPLE: "NONE",
  },
  ACCOUNT_MANAGER: {
    LIVE: "VIEW", ORDERS: "VIEW", MONEY: "NONE", SETUP: "NONE",
    TODAY: "NONE", CASH_DESK: "NONE", PEOPLE: "NONE",
  },
  CASH_COLLECTOR: {
    LIVE: "NONE", ORDERS: "NONE", MONEY: "NONE", SETUP: "NONE",
    TODAY: "NONE", CASH_DESK: "EDIT", PEOPLE: "NONE",
  },
  VIEWER: {
    LIVE: "VIEW", ORDERS: "VIEW", MONEY: "NONE", SETUP: "NONE",
    TODAY: "NONE", CASH_DESK: "NONE", PEOPLE: "NONE",
  },
};

export function roleDefault(role: string, surface: AppSurface): PermissionLevel {
  return ROLE_DEFAULTS[role]?.[surface] ?? "NONE";
}

export type SurfaceMap = Record<AppSurface, PermissionLevel>;

/** The role defaults for a role, with no overrides applied. */
export function defaultsForRole(role: string): SurfaceMap {
  const out = {} as SurfaceMap;
  for (const surface of APP_SURFACES) out[surface] = roleDefault(role, surface);
  return out;
}

/**
 * The effective permission map for a user: role defaults with their overrides
 * laid on top.
 */
export async function resolvePermissions(
  tenantId: string,
  userId: string,
): Promise<SurfaceMap> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { role: true },
  });
  if (!user) {
    const none = {} as SurfaceMap;
    for (const surface of APP_SURFACES) none[surface] = "NONE";
    return none;
  }

  const map = defaultsForRole(user.role);
  const overrides = await prisma.userSurfacePermission.findMany({
    where: { userId, tenantId },
    select: { surface: true, level: true },
  });
  for (const o of overrides) map[o.surface] = o.level;
  return map;
}

const RANK: Record<PermissionLevel, number> = { NONE: 0, VIEW: 1, EDIT: 2 };

/** Does this user reach `surface` at least at `required`? */
export async function can(
  tenantId: string,
  userId: string,
  surface: AppSurface,
  required: Exclude<PermissionLevel, "NONE"> = "VIEW",
): Promise<boolean> {
  const map = await resolvePermissions(tenantId, userId);
  return RANK[map[surface]] >= RANK[required];
}

/** The vendors an account manager is responsible for. Empty for other roles. */
export async function managedVendorIds(tenantId: string, userId: string): Promise<string[]> {
  const rows = await prisma.accountManagerVendor.findMany({
    where: { tenantId, userId },
    select: { vendorId: true },
  });
  return rows.map((r) => r.vendorId);
}
