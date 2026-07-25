// Darb 2.0 — declarative navigation config.
//
// Revision #31 cut the staff rail from sixteen items across five headings down
// to five items and no heading at all. The removed entries were not separate
// systems: /ops, /ops/jeopardy, /ops/alerts and /ops/zones all read the same
// dispatch overview, so they are now four segments of one Live screen; the
// three finance pages are one Money screen; and the six set-up-once config
// pages sit behind the /setup hub. Every old URL still resolves, so nothing
// that was bookmarked or linked breaks.
//
// The Sidebar renders from this structure. Sections are gated either by
// `minRole` (hierarchy gate via useRole().hasRole — VENDOR and FLEET never
// pass) or by `roles` (exact-match gate — the only way portal roles see
// anything). A section with no `i18n` renders no heading.
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/hooks/useRole";
import {
  Radio,
  Briefcase,
  Wallet,
  Settings,
  Gauge,
  ClipboardList,
  PlusCircle,
  BarChart3,
  Megaphone,
  Truck,
  Users,
} from "lucide-react";

export interface NavItem {
  /** i18n key resolved via useI18n().t */
  i18n: string;
  path: string;
  icon: LucideIcon;
  /**
   * Extra paths this item owns. They do not render as their own rows: they
   * exist so the item stays highlighted while the user is on a page the rail
   * no longer lists (a Setup child, a merged ops route).
   */
  owns?: string[];
  /** Hierarchy gate applied to this item alone, on top of the section gate. */
  minRole?: UserRole;
}

export interface NavSection {
  key: string;
  /** i18n key for the section heading. Omit to render no heading. */
  i18n?: string;
  /**
   * Hierarchy gate: visible to users whose role is at least this privileged
   * (checked with useRole().hasRole). VENDOR and FLEET are outside the
   * hierarchy and never pass a minRole gate.
   */
  minRole?: UserRole;
  /** Exact-match gate: visible ONLY to users whose role is in this list. */
  roles?: UserRole[];
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    // No heading: at five items a heading is noise. The per-item minRole
    // values are exactly the section gates the old five-section rail used, so
    // who sees what has not changed.
    key: "staff",
    minRole: "VIEWER",
    items: [
      { i18n: "simple.today", path: "/cockpit", icon: Gauge, minRole: "ADMIN" },
      {
        i18n: "simple.live",
        path: "/ops",
        icon: Radio,
        minRole: "SUPERVISOR",
        // The four merged ops routes redirect into /ops?view=…, but a user can
        // still be mid-redirect on one of them.
        owns: ["/ops/sos", "/ops/jeopardy", "/ops/alerts", "/ops/zones"],
      },
      { i18n: "simple.orders", path: "/orders", icon: Briefcase, minRole: "SUPERVISOR" },
      {
        i18n: "simple.money",
        path: "/finance",
        icon: Wallet,
        minRole: "ACCOUNTANT",
        owns: ["/finance/remittances", "/finance/reports"],
      },
      {
        i18n: "simple.setup",
        path: "/setup",
        icon: Settings,
        minRole: "OPS_MANAGER",
        owns: ["/zones", "/pricing", "/vendors", "/fleets", "/settings", "/assets"],
      },
    ],
  },
  {
    key: "vendor",
    i18n: "darbNav.vendor",
    roles: ["VENDOR"],
    items: [
      { i18n: "darbNav.vendorOrders", path: "/vendor", icon: ClipboardList },
      { i18n: "darbNav.vendorNewOrder", path: "/vendor/orders/new", icon: PlusCircle },
      { i18n: "darbNav.vendorWallet", path: "/vendor/wallet", icon: Wallet },
      { i18n: "vendorExtra.navAnalytics", path: "/vendor/analytics", icon: BarChart3 },
      { i18n: "vendorExtra.navCampaigns", path: "/vendor/campaigns", icon: Megaphone },
      { i18n: "darbNav.vendorSettings", path: "/vendor/settings", icon: Settings },
    ],
  },
  {
    key: "fleetPortal",
    i18n: "fleetPortal.navSection",
    roles: ["FLEET"],
    items: [
      { i18n: "fleetPortal.navRoster", path: "/fleet-portal", icon: Users },
      { i18n: "fleetPortal.navScorecard", path: "/fleet-portal/scorecard", icon: Gauge },
      { i18n: "fleetPortal.navPayouts", path: "/fleet-portal/payouts", icon: Truck },
    ],
  },
];

/**
 * Longest-prefix active matching, now across each item's `owns` list too, so
 * Setup stays lit while the user is on /pricing and Live stays lit on a merged
 * ops route. An item is active when one of its paths matches the pathname AND
 * no other configured path matches more specifically.
 */
export function buildIsActive(sections: NavSection[], pathname: string) {
  const owner = new Map<string, string>(); // candidate path -> owning item.path
  for (const section of sections) {
    for (const item of section.items) {
      owner.set(item.path, item.path);
      for (const extra of item.owns ?? []) owner.set(extra, item.path);
    }
  }
  const matches = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  const best = Array.from(owner.keys())
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];
  const activePath = best === undefined ? undefined : owner.get(best);
  return (path: string) => activePath === path;
}
