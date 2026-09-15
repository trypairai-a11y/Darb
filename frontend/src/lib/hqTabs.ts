// Revision 20 — the HQ portal's four tabs and their subtabs.
//
// Client note, 2026-09-15. The staff portal is Ops / Compliance / Finance /
// Admin, and each has subtabs. This file is the map, in one place, because the
// same strip is drawn at the top of several different routes and a second copy
// would drift the first time somebody renamed a tab.
//
// A subtab is EITHER a query parameter on the tab's own route or a route of its
// own, and which one it is was decided by what already existed:
//
//   - Orders, Equipment and Areas are the client's "same as HQ". They are
//     whole screens that already work, already have deep links out in the
//     world, and are opened directly from notifications. Turning them into
//     query params would have meant either moving them (breaking every
//     bookmark) or rendering them twice (two copies to keep in step). So they
//     stay at their own URLs and simply carry this strip at the top.
//   - Everything new is a query param on its tab's route, because nothing is
//     linking to it yet and one route is one page to load.
//
// `matchPaths` is what keeps the highlight right when a subtab is a route:
// without it, opening /zones would light nothing and the user would be on a
// screen the rail says they are not on.
export interface HqTab {
  key: string;
  /** i18n key for the label. */
  i18n: string;
  href: string;
  /**
   * Extra pathnames this tab owns. A tab whose href carries a query string is
   * matched on the query too; these are matched on the path alone.
   */
  matchPaths?: string[];
}

/** Tab 1 — Ops. */
export const OPS_TABS: HqTab[] = [
  // Live is the control room and the default: /ops with no query is what it
  // has always been, so nothing an operator has bookmarked changes.
  { key: "live", i18n: "hq.tabLive", href: "/ops", matchPaths: ["/ops/sos", "/ops/jeopardy", "/ops/alerts", "/ops/zones"] },
  { key: "orders", i18n: "hq.tabOrders", href: "/orders" },
  { key: "equipment", i18n: "hq.tabEquipment", href: "/assets" },
  { key: "zones", i18n: "hq.tabZones", href: "/zones" },
  { key: "driver-tracking", i18n: "hq.tabDriverTracking", href: "/ops?tab=driver-tracking" },
  { key: "shift-planning", i18n: "hq.tabShiftPlanning", href: "/ops?tab=shift-planning", matchPaths: ["/shifts"] },
  { key: "driver-training", i18n: "hq.tabDriverTraining", href: "/ops?tab=driver-training" },
  { key: "onboarding", i18n: "hq.tabOnboarding", href: "/ops?tab=onboarding" },
];

/** Tab 2 — Compliance. All three subtabs are new, so all three are queries. */
export const COMPLIANCE_TABS: HqTab[] = [
  { key: "driver-documents", i18n: "compliance.tabDriverDocs", href: "/compliance" },
  { key: "renewals", i18n: "compliance.tabRenewals", href: "/compliance?tab=renewals" },
  { key: "partner-documents", i18n: "compliance.tabPartnerDocs", href: "/compliance?tab=partner-documents" },
];

/**
 * Tab 3 — Finance. The first three are the client's "same as HQ": the ledger,
 * the statements and the nightly reconciliation, which were already the three
 * tabs of /finance and keep their URLs exactly.
 */
export const FINANCE_TABS: HqTab[] = [
  { key: "ledger", i18n: "reports.viewLedger", href: "/finance" },
  { key: "vendor-statements", i18n: "reports.viewVendorStatements", href: "/finance?tab=vendor-statements" },
  { key: "reconciliation", i18n: "reports.viewReconciliation", href: "/finance?tab=reconciliation" },
  { key: "payments", i18n: "financeDesk.tabPayments", href: "/finance?tab=payments" },
  { key: "disputes", i18n: "financeDesk.tabDisputes", href: "/finance?tab=disputes" },
];

/**
 * Tab 4 — Admin. Prices and Access are the existing /pricing and /settings
 * screens, for the same reason Orders and Areas are: they work, they are
 * linked to, and a copy would drift.
 */
export const ADMIN_TABS: HqTab[] = [
  { key: "dashboard", i18n: "adminHub.tabDashboard", href: "/admin", matchPaths: ["/cockpit"] },
  { key: "prices", i18n: "adminHub.tabPrices", href: "/pricing", matchPaths: ["/delivery-plans"] },
  { key: "access", i18n: "adminHub.tabAccess", href: "/settings" },
];

/** Split "/ops?tab=driver-tracking" into its two halves. */
function splitHref(href: string): { path: string; tab: string | null } {
  const [path, query] = href.split("?");
  if (!query) return { path: path!, tab: null };
  const value = new URLSearchParams(query).get("tab");
  return { path: path!, tab: value };
}

/**
 * Which tab is open, given where the browser is.
 *
 * Longest-path-first, so /ops/sos picks Live rather than falling through, and
 * a route-backed subtab (/orders) wins over the tab whose href is a prefix of
 * it. Within one path the query decides, and a path with no query opens the
 * first tab that lives there — which is what makes /finance open the ledger
 * and /compliance open driver documents with no query at all.
 */
export function activeHqTab(tabs: HqTab[], pathname: string, tabParam: string | null): string {
  const owns = (t: HqTab, p: string) => {
    const { path } = splitHref(t.href);
    if (p === path) return true;
    if (t.matchPaths?.some((m) => p === m || p.startsWith(`${m}/`))) return true;
    // A child route of a subtab's own path, e.g. /drivers/[id] under /drivers.
    return path !== "/" && p.startsWith(`${path}/`);
  };

  const candidates = tabs.filter((t) => owns(t, pathname));
  if (candidates.length === 0) return tabs[0]!.key;

  // Prefer the candidate whose own path is the most specific match.
  const byDepth = [...candidates].sort(
    (a, b) => splitHref(b.href).path.length - splitHref(a.href).path.length,
  );
  const bestPath = splitHref(byDepth[0]!.href).path;
  const sameRoute = byDepth.filter((t) => splitHref(t.href).path === bestPath);
  if (sameRoute.length === 1) return sameRoute[0]!.key;

  // Several tabs share this route, so the query is what tells them apart.
  const matched = sameRoute.find((t) => splitHref(t.href).tab === tabParam);
  if (matched) return matched.key;
  // No query, or a query nothing claims. The tab whose own href carries no
  // query is this route's default — that is what makes a bare /finance open
  // the ledger and a bare /ops open the live room.
  return sameRoute.find((t) => splitHref(t.href).tab === null)?.key ?? sameRoute[0]!.key;
}
