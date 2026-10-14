// Revision 10 (#6) — the merchant portal's tabs, client side.
//
// Deliberately a mirror of backend/src/services/vendorTabService.ts rather than
// the authority. The server is the authority: every /api/vendor route is gated
// on the tab it belongs to, and /api/vendor/me returns the caller's own
// effective list. This exists so the rail can hide an entry and the route fence
// can say "not your access" without waiting for a 403, and so the Team page can
// preview what a role would open before an owner saves anything.
//
// If the two ever disagree the server wins, and what the user sees is a screen
// they could open in the rail answering 403 — which is exactly the failure mode
// revision 9 (#9, #11) already turned into a plain "access restricted" page.
import type { VendorPortalRole, VendorTab } from "@/types/darb";

/** Canonical order. Also the order the chips and the rail present them in. */
export const VENDOR_TAB_ORDER: VendorTab[] = [
  "ORDERS",
  "WALLET",
  "SUPPORT",
  "TEAM",
  "SETTINGS",
];

/** The shared six-type matrix (edit #8), in presentation order. */
export const VENDOR_ROLE_ORDER: VendorPortalRole[] = [
  "ADMIN",
  "OPS_MANAGER",
  "SUPERVISOR",
  "ACCOUNTANT",
  "ACCOUNT_MANAGER",
  "VIEWER",
];

/**
 * Revision 24 (#2) — "this column should be unique according to the portal".
 * The six-type matrix made a shop's role list read exactly like HQ's (Ops
 * manager, Account manager...), so the roles a shop is OFFERED are its own
 * three again: Owner, Finance, Order tracking. They are stored as the matrix
 * values they always normalised to (OWNER→ADMIN, FINANCE→ACCOUNTANT,
 * ORDER_TRACKING→SUPERVISOR), so nothing is migrated and the server's tab
 * defaults and role gates are untouched. A login still holding one of the
 * other three keeps it and shows it, it just is no longer offered.
 */
export const VENDOR_ROLE_CHOICES: VendorPortalRole[] = ["ADMIN", "ACCOUNTANT", "SUPERVISOR"];

/** The i18n key for a shop login's role, in the shop's own words. */
export function vendorRoleLabelKey(role: string | null | undefined): string {
  const r = normalizeVendorRole(role);
  return (VENDOR_ROLE_CHOICES as string[]).includes(r) ? `portalRoleNames.vendor${r}` : `portalRoles.${r}`;
}

/** The options for a shop login's role picker: the shop's three, plus whatever it holds now. */
export function vendorRoleOptions(current?: string | null): VendorPortalRole[] {
  const r = current == null ? null : normalizeVendorRole(current);
  return r && !VENDOR_ROLE_CHOICES.includes(r) ? [...VENDOR_ROLE_CHOICES, r] : VENDOR_ROLE_CHOICES;
}

/** Legacy stored values normalise into the matrix; mirrors the server. */
export function normalizeVendorRole(role: string | null | undefined): VendorPortalRole {
  if (role && (VENDOR_ROLE_ORDER as string[]).includes(role)) return role as VendorPortalRole;
  if (role === "FINANCE") return "ACCOUNTANT";
  if (role === "ORDER_TRACKING") return "SUPERVISOR";
  return "ADMIN";
}

/**
 * What each role opens with no override — mirrors the server's
 * ROLE_DEFAULT_TABS. ADMIN/ACCOUNTANT/SUPERVISOR reproduce the fences that
 * OWNER/FINANCE/ORDER_TRACKING already had.
 */
const ROLE_DEFAULTS: Record<VendorPortalRole, VendorTab[]> = {
  ADMIN: ["ORDERS", "WALLET", "SUPPORT", "TEAM", "SETTINGS"],
  OPS_MANAGER: ["ORDERS", "SUPPORT"],
  SUPERVISOR: ["ORDERS", "SUPPORT"],
  ACCOUNTANT: ["ORDERS", "WALLET", "SUPPORT"],
  ACCOUNT_MANAGER: ["ORDERS", "SUPPORT"],
  VIEWER: ["ORDERS", "SUPPORT"],
};

export function roleDefaultTabs(role: string | null | undefined): VendorTab[] {
  return ROLE_DEFAULTS[normalizeVendorRole(role)];
}

/** Which tab owns a portal route. Anything unlisted is infrastructure. */
const ROUTE_TABS: Array<{ prefix: string; tab: VendorTab }> = [
  { prefix: "/vendor/wallet", tab: "WALLET" },
  // Vendor-portal note #2 (2026-09-15) — GROW is gone. /vendor/grow and the two
  // older paths that redirected into it now forward to the order board, so
  // there is no tab to map them to and no entry for the rail to lock.
  { prefix: "/vendor/support", tab: "SUPPORT" },
  { prefix: "/vendor/team", tab: "TEAM" },
  { prefix: "/vendor/settings", tab: "SETTINGS" },
  // Last: /vendor and /vendor/orders/* are the board, so this has to be checked
  // after every more specific prefix above.
  { prefix: "/vendor", tab: "ORDERS" },
];

export function tabForPath(pathname: string): VendorTab | null {
  const hit = ROUTE_TABS.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return hit?.tab ?? null;
}
