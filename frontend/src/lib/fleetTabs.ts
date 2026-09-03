// Revision 13 (#6) — the fleet portal's tabs, client side.
//
// Deliberately a mirror of backend/src/services/fleet/fleetTabService.ts rather
// than the authority, exactly as lib/vendorTabs.ts is for the merchant portal.
// The server is the authority: every /api/fleet route is gated on the tab it
// belongs to, and /api/fleet/me returns the caller's own effective list. This
// exists so the rail can lock an entry and the route fence can say "not your
// access" without waiting for a 403, and so the Team page can preview what a
// role would open before an owner saves anything.
//
// If the two ever disagree the server wins, and lib/fleetAccess.ts turns that
// refusal into the padlock.
import type { FleetPortalRole, FleetTab } from "@/types/darb";

/** Canonical order. Also the order the chips and the rail present them in. */
export const FLEET_TAB_ORDER: FleetTab[] = [
  "ROSTER",
  "ISSUES",
  "DOCUMENTS",
  "SCORECARD",
  "PAYOUTS",
  "CASH",
  "SUPPORT",
  "TEAM",
];

/** The shared six-type matrix (edit #8), in presentation order. */
export const FLEET_ROLE_ORDER: FleetPortalRole[] = [
  "ADMIN",
  "OPS_MANAGER",
  "SUPERVISOR",
  "ACCOUNTANT",
  "ACCOUNT_MANAGER",
  "VIEWER",
];

/** Legacy stored values normalise into the matrix; mirrors the server. */
export function normalizeFleetRole(role: string | null | undefined): FleetPortalRole {
  if (role && (FLEET_ROLE_ORDER as string[]).includes(role)) return role as FleetPortalRole;
  if (role === "OPERATIONS") return "OPS_MANAGER";
  if (role === "FINANCE") return "ACCOUNTANT";
  return "ADMIN";
}

/**
 * What each role opens with no override — mirrors the server's
 * FLEET_ROLE_DEFAULT_TABS. Cash stays with the money roles (revision 14); an
 * owner widens anyone through the per-user tab override.
 */
const ROLE_DEFAULTS: Record<FleetPortalRole, FleetTab[]> = {
  ADMIN: ["ROSTER", "ISSUES", "DOCUMENTS", "SCORECARD", "PAYOUTS", "CASH", "SUPPORT", "TEAM"],
  OPS_MANAGER: ["ROSTER", "ISSUES", "DOCUMENTS", "SUPPORT"],
  SUPERVISOR: ["ROSTER", "ISSUES", "SUPPORT"],
  ACCOUNTANT: ["PAYOUTS", "SCORECARD", "CASH", "SUPPORT"],
  ACCOUNT_MANAGER: ["SCORECARD", "SUPPORT"],
  VIEWER: ["SCORECARD", "SUPPORT"],
};

export function fleetRoleDefaultTabs(role: string | null | undefined): FleetTab[] {
  return ROLE_DEFAULTS[normalizeFleetRole(role)];
}

/** Which tab owns a portal route. Anything unlisted is infrastructure. */
const ROUTE_TABS: Array<{ prefix: string; tab: FleetTab }> = [
  { prefix: "/fleet-portal/issues", tab: "ISSUES" },
  { prefix: "/fleet-portal/documents", tab: "DOCUMENTS" },
  { prefix: "/fleet-portal/scorecard", tab: "SCORECARD" },
  { prefix: "/fleet-portal/payouts", tab: "PAYOUTS" },
  { prefix: "/fleet-portal/cash", tab: "CASH" },
  { prefix: "/fleet-portal/support", tab: "SUPPORT" },
  { prefix: "/fleet-portal/team", tab: "TEAM" },
  // Last: /fleet-portal and /fleet-portal/drivers/* are the roster, so this has
  // to be checked after every more specific prefix above.
  { prefix: "/fleet-portal", tab: "ROSTER" },
];

export function fleetTabForPath(pathname: string): FleetTab | null {
  const hit = ROUTE_TABS.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return hit?.tab ?? null;
}
