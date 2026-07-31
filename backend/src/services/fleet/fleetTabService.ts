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
  "SUPPORT",
  "TEAM",
] as const;

export type FleetTab = (typeof FLEET_TABS)[number];

export type FleetPortalRole = "OWNER" | "OPERATIONS" | "FINANCE";

export const FLEET_PORTAL_ROLES: readonly FleetPortalRole[] = [
  "OWNER",
  "OPERATIONS",
  "FINANCE",
] as const;

/**
 * What each role opens with no override.
 *
 * OPERATIONS is the supervisor who calls the drivers: everything about people
 * and paperwork, nothing about money. FINANCE is the other half. Both keep
 * SUPPORT, because the channel to Darb is not worth taking away from anyone and
 * a portal that cannot ask a question sends a WhatsApp instead.
 */
export const FLEET_ROLE_DEFAULT_TABS: Record<FleetPortalRole, FleetTab[]> = {
  OWNER: ["ROSTER", "ISSUES", "DOCUMENTS", "SCORECARD", "PAYOUTS", "SUPPORT", "TEAM"],
  OPERATIONS: ["ROSTER", "ISSUES", "DOCUMENTS", "SUPPORT"],
  FINANCE: ["PAYOUTS", "SCORECARD", "SUPPORT"],
};

export function isFleetTab(value: unknown): value is FleetTab {
  return typeof value === "string" && (FLEET_TABS as readonly string[]).includes(value);
}

export function isFleetPortalRole(value: unknown): value is FleetPortalRole {
  return value === "OWNER" || value === "OPERATIONS" || value === "FINANCE";
}

/** A stored role, normalised. Anything unrecognised reads as OWNER. */
export function normaliseFleetRole(raw: unknown): FleetPortalRole {
  return isFleetPortalRole(raw) ? raw : "OWNER";
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
