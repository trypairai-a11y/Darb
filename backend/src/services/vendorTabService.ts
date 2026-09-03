/**
 * Per-user tab access inside the merchant portal (revision 10, #6).
 *
 * The shop's Team page could set a role and a branch, and nothing else. The
 * client asked three revisions running for control over which specific tabs a
 * person can open: an accountant who should not see Grow, a branch supervisor
 * who should see orders and nothing else. A role alone cannot express that,
 * because a role is a bundle and every shop draws the line somewhere different.
 *
 * The rules, in the order they apply:
 *
 *   1. The role's default set, which is exactly what each role opened before
 *      this existed. A login with no override behaves identically, so this
 *      ships with no backfill.
 *   2. A per-user override (`User.vendorTabs`), which REPLACES the default set.
 *      An owner may narrow a role, and may also widen one: granting WALLET to a
 *      tracker is a decision the shop owner is entitled to make about their own
 *      staff and their own money.
 *
 * What an override CANNOT do is hand over a capability that is the owner's by
 * definition. Creating logins and pausing the shop stay OWNER-only whatever the
 * tab list says, because a tracker who could mint an OWNER login would be able
 * to grant themselves everything. Tabs decide which screens open; the role
 * still decides which of the dangerous buttons on them work.
 */

export const VENDOR_TABS = [
  "ORDERS",
  "WALLET",
  "GROW",
  "SUPPORT",
  "TEAM",
  "SETTINGS",
] as const;

export type VendorTab = (typeof VENDOR_TABS)[number];

/**
 * Client note (2026-08-31, edit #8): the three portals share ONE role matrix —
 * the same six types the HQ staff grid uses. The old vendor trio survives as
 * stored legacy values that normalise in (OWNER→ADMIN, FINANCE→ACCOUNTANT,
 * ORDER_TRACKING→SUPERVISOR), so this ships with no backfill and an old JWT
 * or row keeps meaning what it always meant.
 */
export type VendorPortalRole =
  | "ADMIN"
  | "OPS_MANAGER"
  | "SUPERVISOR"
  | "ACCOUNTANT"
  | "ACCOUNT_MANAGER"
  | "VIEWER";

export const VENDOR_PORTAL_ROLES: readonly VendorPortalRole[] = [
  "ADMIN",
  "OPS_MANAGER",
  "SUPERVISOR",
  "ACCOUNTANT",
  "ACCOUNT_MANAGER",
  "VIEWER",
] as const;

const LEGACY_VENDOR_ROLES: Record<string, VendorPortalRole> = {
  OWNER: "ADMIN",
  FINANCE: "ACCOUNTANT",
  ORDER_TRACKING: "SUPERVISOR",
};

/** Stored values a role field may legally carry: the matrix plus the legacy trio. */
export const ACCEPTED_VENDOR_ROLE_INPUTS: readonly string[] = [
  ...VENDOR_PORTAL_ROLES,
  ...Object.keys(LEGACY_VENDOR_ROLES),
];

/**
 * A stored or submitted role, normalised to the matrix. Anything unrecognised
 * reads as ADMIN, exactly as anything-but-the-trio used to read as OWNER.
 */
export function normaliseVendorRole(raw: unknown): VendorPortalRole {
  if (typeof raw === "string") {
    if ((VENDOR_PORTAL_ROLES as readonly string[]).includes(raw)) {
      return raw as VendorPortalRole;
    }
    const legacy = LEGACY_VENDOR_ROLES[raw];
    if (legacy) return legacy;
  }
  return "ADMIN";
}

/** Only a supervisor (the old ORDER_TRACKING) can be pinned to one branch. */
export function vendorRoleTakesBranch(raw: unknown): boolean {
  return normaliseVendorRole(raw) === "SUPERVISOR";
}

/**
 * What each role opens with no override.
 *
 * ADMIN, ACCOUNTANT and SUPERVISOR reproduce the fences that were already in
 * force for OWNER, FINANCE and ORDER_TRACKING. The three new types slot in
 * between: managers see growth but not money, a viewer only watches.
 */
export const ROLE_DEFAULT_TABS: Record<VendorPortalRole, VendorTab[]> = {
  ADMIN: ["ORDERS", "WALLET", "GROW", "SUPPORT", "TEAM", "SETTINGS"],
  OPS_MANAGER: ["ORDERS", "GROW", "SUPPORT"],
  SUPERVISOR: ["ORDERS", "SUPPORT"],
  ACCOUNTANT: ["ORDERS", "WALLET", "GROW", "SUPPORT"],
  ACCOUNT_MANAGER: ["ORDERS", "GROW", "SUPPORT"],
  VIEWER: ["ORDERS", "SUPPORT"],
};

export function isVendorTab(value: unknown): value is VendorTab {
  return typeof value === "string" && (VENDOR_TABS as readonly string[]).includes(value);
}

/**
 * Normalise whatever is stored in `User.vendorTabs` into a tab list, or null
 * when there is no override to apply.
 *
 * Anything that is not an array is treated as absent rather than as an error: a
 * stray value in one row must not lock a shop out of its own portal.
 */
export function parseVendorTabs(raw: unknown): VendorTab[] | null {
  if (!Array.isArray(raw)) return null;
  const tabs = raw.filter(isVendorTab);
  // De-duplicated and in canonical order, so two equivalent lists compare equal.
  return VENDOR_TABS.filter((tab) => tabs.includes(tab));
}

/** The tabs this login may open: the override if there is one, else the role's. */
export function effectiveVendorTabs(
  vendorRole: string | null | undefined,
  rawTabs: unknown,
): VendorTab[] {
  const override = parseVendorTabs(rawTabs);
  if (override) return override;
  return ROLE_DEFAULT_TABS[normaliseVendorRole(vendorRole)];
}
