/**
 * Where a signed-in user belongs, by role. One table, because there are two
 * doors into the app — the login form and the "/" fall-through — and when they
 * disagreed a cash collector could land on the ops map from one and the cash
 * desk from the other.
 *
 * Ops staff are the daily users, so the live control room is home. An
 * accountant sits below SUPERVISOR in the hierarchy and would land on a screen
 * their own rail does not list, so they go to Money. An account manager reads
 * the network rather than running it, so the order board suits them better than
 * the map. Portal roles are fenced by PortalGuard anyway; sending them straight
 * to their portal just saves a visible bounce off a screen they cannot use.
 *
 * SUPER_ADMIN is a separate flag (User.isSuperAdmin), not a UserRole — the
 * standard role landing applies, with /admin/* gated by the flag.
 */
const ROLE_LANDING: Record<string, string> = {
  ADMIN: "/ops",
  OPS_MANAGER: "/ops",
  SUPERVISOR: "/ops",
  ACCOUNTANT: "/finance",
  ACCOUNT_MANAGER: "/orders",
  VIEWER: "/orders",
  // Portal roles land in (and are fenced into) their own portals.
  VENDOR: "/vendor",
  FLEET: "/fleet-portal",
  CASH_COLLECTOR: "/cash-desk",
};

export function landingForRole(role: string | undefined): string {
  if (!role) return "/ops";
  return ROLE_LANDING[role] ?? "/ops";
}
