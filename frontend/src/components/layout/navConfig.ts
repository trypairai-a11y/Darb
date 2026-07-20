// Darb 2.0 — declarative navigation config (Slice B, wave 1).
// The Sidebar renders from this structure. Sections are gated either by
// `minRole` (hierarchy gate via useRole().hasRole — VENDOR never passes) or
// by `roles` (exact-match gate — the only way VENDOR sees anything).
// Legacy Darb 1.0 platform trees are preserved behind SHOW_LEGACY.
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
  Truck,
  Wallet,
  HandCoins,
  Scale,
  FileText,
  Settings,
  SlidersHorizontal,
  Users,
  ShieldAlert,
  Sparkles,
  MessageSquare,
  ClipboardList,
  PlusCircle,
} from "lucide-react";

/**
 * Master kill-switch (2026-07-20). The product is being rebuilt from a new PRD,
 * so the whole v1/v2 nav is hidden: the sidebar renders a "Rebuilding"
 * placeholder instead of any section. Nothing is deleted and no route is
 * guarded, so every page below still loads if you type its URL directly.
 * Flip to true to bring the entire existing surface back.
 */
export const SHOW_V1 = false;

/** Flip to true to bring the Darb 1.0 platform modules back into the nav. */
export const SHOW_LEGACY = false;

// v1 slim-down (2026-07-19): advanced surfaces exist and work, but stay out of
// the nav until the operation actually needs them. Routes remain reachable by
// URL. Flip to true to restore Jeopardy/Alerts/Zone load/Fleet/Adjustments/Reports.
export const SHOW_ADVANCED = false;

export interface NavItem {
  /** i18n key resolved via useI18n().t */
  i18n: string;
  path: string;
  icon: LucideIcon;
}

/** Collapsible sub-tree (used by the legacy platform groups). */
export interface NavGroup {
  name: string;
  key: string;
  /** Tailwind class for the colored dot next to the group name. */
  dotClass: string;
  items: NavItem[];
}

export interface NavSection {
  key: string;
  /** i18n key for the section heading. */
  i18n: string;
  /**
   * Hierarchy gate: visible to users whose role is at least this privileged
   * (checked with useRole().hasRole). VENDOR is outside the hierarchy and
   * never passes a minRole gate.
   */
  minRole?: UserRole;
  /** Exact-match gate: visible ONLY to users whose role is in this list. */
  roles?: UserRole[];
  /** Hidden entirely unless SHOW_LEGACY is true. */
  legacy?: boolean;
  items: NavItem[];
  groups?: NavGroup[];
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
      ...(SHOW_ADVANCED
        ? [
            { i18n: "darbNav.jeopardy", path: "/ops/jeopardy", icon: AlertTriangle },
            { i18n: "darbNav.alerts", path: "/ops/alerts", icon: BellRing },
            { i18n: "darbNav.zoneLoad", path: "/ops/zones", icon: Hexagon },
          ]
        : []),
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
      ...(SHOW_ADVANCED ? [{ i18n: "darbNav.fleet", path: "/fleet", icon: Truck }] : []),
    ],
  },
  {
    key: "finance",
    i18n: "darbNav.finance",
    minRole: "ACCOUNTANT",
    items: [
      { i18n: "darbNav.financeOverview", path: "/finance", icon: Wallet },
      { i18n: "darbNav.remittances", path: "/finance/remittances", icon: HandCoins },
      ...(SHOW_ADVANCED
        ? [
            { i18n: "darbNav.adjustments", path: "/finance/adjustments", icon: Scale },
            { i18n: "darbNav.reports", path: "/reports", icon: FileText },
          ]
        : []),
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
    key: "vendor",
    i18n: "darbNav.vendor",
    roles: ["VENDOR"],
    items: [
      { i18n: "darbNav.vendorOrders", path: "/vendor", icon: ClipboardList },
      { i18n: "darbNav.vendorNewOrder", path: "/vendor/orders/new", icon: PlusCircle },
      { i18n: "darbNav.vendorWallet", path: "/vendor/wallet", icon: Wallet },
      { i18n: "darbNav.vendorSettings", path: "/vendor/settings", icon: Settings },
    ],
  },
  {
    key: "legacy",
    i18n: "darbNav.legacy",
    legacy: true,
    minRole: "VIEWER",
    items: [
      { i18n: "nav.decisions", path: "/decisions", icon: Sparkles },
      { i18n: "nav.chat", path: "/chat", icon: MessageSquare },
      { i18n: "nav.floor", path: "/v2/dispatch", icon: Map },
    ],
    groups: [
      {
        name: "Talabat",
        key: "talabat",
        dotClass: "bg-talabat",
        items: [
          { i18n: "nav.drivers", path: "/talabat/drivers", icon: Users },
          { i18n: "nav.orders", path: "/talabat/orders", icon: Briefcase },
          { i18n: "nav.violations", path: "/talabat/violations", icon: ShieldAlert },
        ],
      },
      {
        name: "Keeta",
        key: "keeta",
        dotClass: "bg-keeta",
        items: [
          { i18n: "nav.drivers", path: "/keeta/drivers", icon: Users },
          { i18n: "nav.orders", path: "/keeta/orders", icon: Briefcase },
          { i18n: "nav.violations", path: "/keeta/violations", icon: ShieldAlert },
        ],
      },
      {
        name: "Deliveroo",
        key: "deliveroo",
        dotClass: "bg-deliveroo",
        items: [
          { i18n: "nav.drivers", path: "/deliveroo/drivers", icon: Users },
          { i18n: "nav.orders", path: "/deliveroo/orders", icon: Briefcase },
          { i18n: "nav.violations", path: "/deliveroo/violations", icon: ShieldAlert },
        ],
      },
      {
        name: "Americana",
        key: "americana",
        dotClass: "bg-americana",
        items: [
          { i18n: "nav.drivers", path: "/americana/drivers", icon: Users },
          { i18n: "nav.orders", path: "/americana/orders", icon: Briefcase },
          { i18n: "nav.violations", path: "/americana/violations", icon: ShieldAlert },
        ],
      },
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
    for (const group of section.groups ?? []) {
      for (const item of group.items) allPaths.push(item.path);
    }
  }
  const matches = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  const best = allPaths.filter(matches).sort((a, b) => b.length - a.length)[0];
  return (path: string) => matches(path) && (best === undefined || best === path);
}
