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

/**
 * What each role opens with no override. These reproduce the fences that were
 * already in force before per-user tabs existed, so a login with no override
 * behaves exactly as it did.
 */
const ROLE_DEFAULTS: Record<VendorPortalRole, VendorTab[]> = {
  OWNER: ["ORDERS", "WALLET", "GROW", "SUPPORT", "TEAM", "SETTINGS"],
  FINANCE: ["ORDERS", "WALLET", "GROW", "SUPPORT"],
  ORDER_TRACKING: ["ORDERS", "SUPPORT"],
};

export function roleDefaultTabs(role: VendorPortalRole | null | undefined): VendorTab[] {
  return ROLE_DEFAULTS[role ?? "OWNER"] ?? ROLE_DEFAULTS.OWNER;
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
