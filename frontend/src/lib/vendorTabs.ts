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
  "GROW",
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
  ADMIN: ["ORDERS", "WALLET", "GROW", "SUPPORT", "TEAM", "SETTINGS"],
  OPS_MANAGER: ["ORDERS", "GROW", "SUPPORT"],
  SUPERVISOR: ["ORDERS", "SUPPORT"],
  ACCOUNTANT: ["ORDERS", "WALLET", "GROW", "SUPPORT"],
  ACCOUNT_MANAGER: ["ORDERS", "GROW", "SUPPORT"],
  VIEWER: ["ORDERS", "SUPPORT"],
};

export function roleDefaultTabs(role: string | null | undefined): VendorTab[] {
  return ROLE_DEFAULTS[normalizeVendorRole(role)];
}

/** Which tab owns a portal route. Anything unlisted is infrastructure. */
const ROUTE_TABS: Array<{ prefix: string; tab: VendorTab }> = [
  { prefix: "/vendor/wallet", tab: "WALLET" },
  { prefix: "/vendor/grow", tab: "GROW" },
  // Kept because both still redirect into /vendor/grow, and a user can be
  // mid-redirect on either.
  { prefix: "/vendor/analytics", tab: "GROW" },
  { prefix: "/vendor/campaigns", tab: "GROW" },
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
