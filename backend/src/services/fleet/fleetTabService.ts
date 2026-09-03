/**
 * Per-user access inside the fleet portal (revision 13, #6).
 *
 * The client asked for a Team tab "same as the Vendor concept", with the
 * vendor's branches replaced by the other delivery companies in the same owner
 * group. So this is the mirror of `vendorTabService`, deliberately down to the
 * shape of the functions: the two portals having the same rules in two
 * different shapes is how they drift apart.
 *
 * The rules, in the order they apply:
 *
 *   1. The role's default set. A login with no override behaves exactly as it
 *      did before this existed, so this ships with no backfill.
 *   2. A per-user override (`User.fleetTabs`), which REPLACES the default. An
 *      owner may narrow a role and may also widen one: who in their own company
 *      sees what the company is paid is the owner's decision, not Darb's.
 *
 * What an override cannot do is hand over what is the owner's by definition.
 * Creating a login and changing what somebody opens stay OWNER-only whatever
 * the tab list says, for the same reason they do in the merchant portal: a
 * supervisor who could mint an owner login could grant themselves everything.
 *
 * A NULL `fleetRole` reads as OWNER. Every fleet login that exists today has
 * one, and each of them could already open every screen in the portal.
 */

export const FLEET_TABS = [
  "ROSTER",
  "ISSUES",
  "DOCUMENTS",
  "SCORECARD",
  "PAYOUTS",
  // Revision 14 — the company's own cash account with Darb: what it has
  // deposited, and clearing its drivers' cash-on-hand out of it.
  "CASH",
  "SUPPORT",
  "TEAM",
] as const;

export type FleetTab = (typeof FLEET_TABS)[number];

/**
 * Client note (2026-08-31, edit #8): the three portals share ONE role matrix —
 * the same six types the HQ staff grid uses. The old fleet trio survives as
 * stored legacy values that normalise in (OWNER→ADMIN, OPERATIONS→OPS_MANAGER,
 * FINANCE→ACCOUNTANT), so this ships with no backfill.
 */
export type FleetPortalRole =
  | "ADMIN"
  | "OPS_MANAGER"
  | "SUPERVISOR"
  | "ACCOUNTANT"
  | "ACCOUNT_MANAGER"
  | "VIEWER";

export const FLEET_PORTAL_ROLES: readonly FleetPortalRole[] = [
  "ADMIN",
  "OPS_MANAGER",
  "SUPERVISOR",
  "ACCOUNTANT",
  "ACCOUNT_MANAGER",
  "VIEWER",
] as const;

const LEGACY_FLEET_ROLES: Record<string, FleetPortalRole> = {
  OWNER: "ADMIN",
  OPERATIONS: "OPS_MANAGER",
  FINANCE: "ACCOUNTANT",
};

/** Stored values a role field may legally carry: the matrix plus the legacy trio. */
export const ACCEPTED_FLEET_ROLE_INPUTS: readonly string[] = [
  ...FLEET_PORTAL_ROLES,
  ...Object.keys(LEGACY_FLEET_ROLES),
];

/**
 * What each role opens with no override.
 *
 * ADMIN, OPS_MANAGER and ACCOUNTANT reproduce what OWNER, OPERATIONS and
 * FINANCE already opened. SUPERVISOR is the ops lead minus the paperwork,
 * ACCOUNT_MANAGER and VIEWER only watch the numbers. CASH stays with the
 * money roles (revision 14) — an owner widens anyone through the tab override.
 */
export const FLEET_ROLE_DEFAULT_TABS: Record<FleetPortalRole, FleetTab[]> = {
  ADMIN: ["ROSTER", "ISSUES", "DOCUMENTS", "SCORECARD", "PAYOUTS", "CASH", "SUPPORT", "TEAM"],
  OPS_MANAGER: ["ROSTER", "ISSUES", "DOCUMENTS", "SUPPORT"],
  SUPERVISOR: ["ROSTER", "ISSUES", "SUPPORT"],
  ACCOUNTANT: ["PAYOUTS", "SCORECARD", "CASH", "SUPPORT"],
  ACCOUNT_MANAGER: ["SCORECARD", "SUPPORT"],
  VIEWER: ["SCORECARD", "SUPPORT"],
};

export function isFleetTab(value: unknown): value is FleetTab {
  return typeof value === "string" && (FLEET_TABS as readonly string[]).includes(value);
}

export function isFleetPortalRole(value: unknown): value is FleetPortalRole {
  return typeof value === "string" && (FLEET_PORTAL_ROLES as readonly string[]).includes(value);
}

/**
 * A stored or submitted role, normalised to the matrix. NULL and anything
 * unrecognised read as ADMIN, exactly as they used to read as OWNER: every
 * fleet login that predates roles could already open every screen.
 */
export function normaliseFleetRole(raw: unknown): FleetPortalRole {
  if (isFleetPortalRole(raw)) return raw;
  if (typeof raw === "string") {
    const legacy = LEGACY_FLEET_ROLES[raw];
    if (legacy) return legacy;
  }
  return "ADMIN";
}

/**
 * Normalise whatever is stored in `User.fleetTabs` into a tab list, or null
 * when there is no override to apply.
 *
 * Anything that is not an array is treated as absent rather than as an error: a
 * stray value in one row must not lock a delivery company out of its portal.
 */
export function parseFleetTabs(raw: unknown): FleetTab[] | null {
  if (!Array.isArray(raw)) return null;
  const tabs = raw.filter(isFleetTab);
  // De-duplicated and in canonical order, so two equivalent lists compare equal.
  return FLEET_TABS.filter((tab) => tabs.includes(tab));
}

/** The tabs this login may open: the override if there is one, else the role's. */
export function effectiveFleetTabs(
  fleetRole: string | null | undefined,
  rawTabs: unknown,
): FleetTab[] {
  const override = parseFleetTabs(rawTabs);
  if (override) return override;
  return FLEET_ROLE_DEFAULT_TABS[normaliseFleetRole(fleetRole)];
}

/**
 * The companies this login may act for, or null for "every company in the
 * group".
 *
 * Null rather than an empty list is the inherit case, matching `fleetTabs`. An
 * explicit empty array would mean a login that can act for nothing, which is a
 * deactivated user with extra steps, so it is treated as absent too.
 */
export function parseFleetPartnerIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return ids.length > 0 ? Array.from(new Set(ids)) : null;
}
