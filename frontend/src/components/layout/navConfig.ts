// Darb 2.0 — declarative navigation config, rebuilt from the PRD
// (DARB2-PRD-001 v3.0, §5 System Architecture).
//
// The Sidebar renders from this structure. Sections are gated either by
// `minRole` (hierarchy gate via useRole().hasRole — VENDOR and FLEET never
// pass) or by `roles` (exact-match gate — the only way portal roles see
// anything). The legacy Darb 1.0 platform trees were deleted in the PRD
// rebuild; this file intentionally has no kill-switches left.
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/hooks/useRole";
import {
  Map,
  AlertTriangle,
  BellRing,
  Siren,
  Briefcase,
  Hexagon,
  Coins,
  Store,
  Wallet,
  HandCoins,
  Scale,
  Settings,
  SlidersHorizontal,
  ClipboardList,
  PlusCircle,
  Truck,
  Gauge,
  BarChart3,
  Megaphone,
  Users,
} from "lucide-react";

export interface NavItem {
  /** i18n key resolved via useI18n().t */
  i18n: string;
  path: string;
  icon: LucideIcon;
}

export interface NavSection {
  key: string;
  /** i18n key for the section heading. */
  i18n: string;
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
    key: "operations",
    i18n: "darbNav.operations",
    minRole: "SUPERVISOR",
    items: [
      { i18n: "darbNav.opsMap", path: "/ops", icon: Map },
      { i18n: "darbNav.sos", path: "/ops/sos", icon: Siren },
      { i18n: "darbNav.orders", path: "/orders", icon: Briefcase },
      { i18n: "darbNav.jeopardy", path: "/ops/jeopardy", icon: AlertTriangle },
      { i18n: "darbNav.alerts", path: "/ops/alerts", icon: BellRing },
      { i18n: "darbNav.zoneLoad", path: "/ops/zones", icon: Hexagon },
    ],
  },
  {
    key: "network",
    i18n: "darbNav.network",
    minRole: "OPS_MANAGER",
    items: [
      { i18n: "darbNav.zones", path: "/zones", icon: Hexagon },
      { i18n: "darbNav.pricing", path: "/pricing", icon: Coins },
      { i18n: "darbNav.vendors", path: "/vendors", icon: Store },
      { i18n: "darbNav.fleet", path: "/fleets", icon: Truck },
    ],
  },
  {
    key: "finance",
    i18n: "darbNav.finance",
    minRole: "ACCOUNTANT",
    items: [
      { i18n: "darbNav.financeOverview", path: "/finance", icon: Wallet },
      { i18n: "darbNav.remittances", path: "/finance/remittances", icon: HandCoins },
      { i18n: "darbNav.adjustments", path: "/finance/adjustments", icon: Scale },
    ],
  },
  {
    key: "system",
    i18n: "darbNav.system",
    minRole: "OPS_MANAGER",
    items: [
      { i18n: "nav.settings", path: "/settings", icon: Settings },
      { i18n: "nav.assets", path: "/assets", icon: SlidersHorizontal },
    ],
  },
  {
    key: "cockpit",
    i18n: "cockpit.navSection",
    minRole: "ADMIN",
    items: [{ i18n: "cockpit.navTitle", path: "/cockpit", icon: Gauge }],
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
      { i18n: "fleetPortal.navPayouts", path: "/fleet-portal/payouts", icon: Wallet },
    ],
  },
];

/**
 * Longest-prefix active matching: "/ops" must not light up while the user is
 * on "/ops/jeopardy" (which has its own nav item). An item is active when it
 * matches the pathname AND no other configured path matches more specifically.
 */
export function buildIsActive(sections: NavSection[], pathname: string) {
  const allPaths: string[] = [];
  for (const section of sections) {
    for (const item of section.items) allPaths.push(item.path);
  }
  const matches = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  const best = allPaths.filter(matches).sort((a, b) => b.length - a.length)[0];
  return (path: string) => matches(path) && (best === undefined || best === path);
}
