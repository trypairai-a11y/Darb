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
import type { FleetTab, VendorTab } from "@/types/darb";
import {
  LifeBuoy,
  Radio,
  Wallet,
  Settings,
  ClipboardList,
  Truck,
  Users,
  HandCoins,
  History,
  FileText,
  ShieldCheck,
  TriangleAlert,
  UserCog,
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
  /**
   * Revision 20 — the per-user surface this entry belongs to, and the staff
   * mirror of `vendorTab` / `fleetTab` below.
   *
   * Two things it fixes.
   *
   * The Settings screen has promised since revision 4 (#12) that "the rail
   * hides what is set to No access". It did not: the rail read `minRole` and
   * nothing else, so a surface set to NONE left its entry in place and the
   * screen 403'd when taken. Where an item carries BOTH, the two AND together
   * and the result can only ever be narrower than the role gate alone.
   *
   * The second is the one that matters here. An item may carry a surface and
   * NO minRole, and then the grant alone decides — which is what makes a
   * compliance officer possible at all, because they are a VIEWER whose one
   * granted surface is the compliance desk. A hierarchy gate on top of that
   * would make the grant unusable, which is exactly what revision 11 (#9)
   * found on the merchant side and revision 13 (#6) restated for the fleet:
   * a granted surface must be able to appear.
   */
  surface?: string;
  /**
   * With a surface set, ignore `minRole` once the permission map has loaded.
   * `minRole` then survives only as the gate to use while the map is unknown.
   */
  surfaceOnly?: boolean;
  /**
   * Which vendor portal roles may see this item. Omit for "any of them".
   *
   * The vendor rail used to be the same four entries for every shop login, so
   * an Order tracking user was shown Wallet and got a 403 page when they took
   * the invitation. The roles are the shop's own: an owner runs everything, an
   * accountant handles money and looks up what orders were worth, and a
   * tracker follows deliveries and raises support.
   */
  // Canonical matrix names (edit #8); compare against a normalised role.
  vendorRoles?: string[];
  /**
   * Revision 10 (#6) — the merchant-portal tab this entry belongs to.
   *
   * `vendorRoles` above could only ever say "this role, or not". It could not
   * express the per-user tab list the client asked for three revisions running,
   * so an owner who narrowed somebody's access saw the rail entry stay exactly
   * where it was and the screen 403 when they took it. The Sidebar checks this
   * against the tabs /api/vendor/me returns for the caller, which is the same
   * list the server gates each endpoint on.
   */
  vendorTab?: VendorTab;
  /**
   * Revision 13 (#6) — the fleet-portal tab this entry belongs to, and the
   * mirror of vendorTab above. The Sidebar checks it against the tabs
   * /api/fleet/me returns for the caller, which is the same list the server
   * gates each /api/fleet endpoint on, and draws a refused entry locked rather
   * than dropping it.
   */
  fleetTab?: FleetTab;
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
    // Revision 20 — four tabs, which is what the client asked for by name:
    // Ops, Compliance, Finance, Admin. This is not another merge for its own
    // sake. It is the org chart: the four groups of people who use the staff
    // portal, each opening on the work they own.
    //
    // Everything the old five-item rail reached is still reachable and still
    // at the same URL. Live, Orders, Zones and Equipment are subtabs of Ops;
    // Money keeps its own route and gains two subtabs; Today, Prices and
    // People are the three subtabs of Admin. /setup still resolves and still
    // lists every configuration screen, it is simply no longer a rail slot,
    // because a hub whose every card now has a home inside a tab is a door
    // into rooms you are already standing in.
    key: "staff",
    minRole: "VIEWER",
    items: [
      {
        i18n: "hq.ops",
        path: "/ops",
        icon: Radio,
        minRole: "SUPERVISOR",
        surface: "LIVE",
        // The Ops tab owns the four merged live routes it always did, plus the
        // three standalone screens that are now subtabs of it. They keep their
        // own URLs — an ops manager who bookmarked /zones must not be told the
        // page moved — so the rail has to know Ops owns them or the highlight
        // goes dark the moment anybody uses one.
        owns: [
          "/ops/sos",
          "/ops/jeopardy",
          "/ops/alerts",
          "/ops/zones",
          "/orders",
          "/zones",
          "/assets",
          "/shifts",
          "/drivers",
          "/requests",
        ],
      },
      {
        i18n: "hq.compliance",
        path: "/compliance",
        // Governed by the surface ALONE. A compliance officer is a VIEWER
        // whose one granted surface is this desk, so a hierarchy gate on top
        // would make the grant unusable — the mistake revision 11 (#9) found
        // on the merchant side. The COMPLIANCE role defaults reproduce the
        // SUPERVISOR-and-above split exactly, so nobody who could see this
        // yesterday loses it; what changes is that somebody below that line
        // can now be given it.
        //
        // `minRole` is the pre-load fallback only: until /me lands there is no
        // permission map to read, and falling back to the hierarchy is better
        // than flashing an entry at somebody who cannot open it.
        icon: ShieldCheck,
        minRole: "SUPERVISOR",
        surface: "COMPLIANCE",
        surfaceOnly: true,
      },
      {
        i18n: "hq.finance",
        path: "/finance",
        icon: Wallet,
        minRole: "ACCOUNTANT",
        surface: "MONEY",
        owns: ["/finance/remittances", "/finance/reports"],
      },
      {
        i18n: "hq.admin",
        path: "/admin",
        icon: Settings,
        minRole: "ADMIN",
        // "admin: should have access to all tabs" — the other three are gated
        // below ADMIN, so an admin already passes every one. What this entry
        // adds is the three screens that are the admin's own: the dashboard
        // and forecast, the price lists, and who may reach what.
        owns: [
          "/cockpit",
          "/pricing",
          "/settings",
          "/setup",
          "/vendors",
          "/fleets",
          "/delivery-plans",
        ],
      },
      // Revision 20 — the HQ desk (/requests) is no longer a rail slot. The
      // client named four tabs and meant four. Both halves of that screen now
      // have an owner: support requests are reached from Ops, and the pricing
      // a delivery company proposes from Admin › Prices, which is the screen
      // that sets the other side of the same number. The route still resolves
      // and both tabs still work.
    ],
  },
  {
    // Same cut as the staff rail, six entries down to four. "New order" was an
    // action masquerading as a place and the orders board already has the
    // button; Analytics and Campaigns both answer "how do I sell more", so
    // they are two tabs of Grow.
    key: "vendor",
    roles: ["VENDOR"],
    items: [
      {
        i18n: "darbNav.vendorOrders",
        path: "/vendor",
        icon: ClipboardList,
        owns: ["/vendor/orders/new"],
        vendorTab: "ORDERS",
      },
      {
        i18n: "darbNav.vendorWallet",
        path: "/vendor/wallet",
        icon: Wallet,
        vendorTab: "WALLET",
      },
      // Vendor-portal note #2 (2026-09-15) — Grow removed. "No need for it
      // now." /vendor/grow and the two older paths forward to the board.
      // Open to every role by default: a tracker who can see neither money nor
      // settings has no other way to tell Darb something went wrong. An owner
      // can still take the tab away from one person.
      { i18n: "vendorSupport.title", path: "/vendor/support", icon: LifeBuoy, vendorTab: "SUPPORT" },
      // Revision 11 (#9). These two carried vendorRoles: ["OWNER"] on top of
      // their tab, and that gate runs first, so an owner who granted Team or
      // Settings to an accountant saw the checkbox save and the entry never
      // appear. A grant that cannot show is not a grant. The tab list decides
      // which screens open, which is the model the tabs were built on; what
      // stays OWNER-only is the dangerous work ON those screens — minting a
      // login and pausing the shop — and that is enforced on the endpoints and
      // on the controls themselves, not by hiding the whole room.
      { i18n: "vendorTeam.title", path: "/vendor/team", icon: Users, vendorTab: "TEAM" },
      {
        i18n: "darbNav.vendorSettings",
        path: "/vendor/settings",
        icon: Settings,
        vendorTab: "SETTINGS",
      },
    ],
  },
  {
    // Revision 4 (#3) — the cash desk is a portal, not a rail item on the
    // staff side. A CASH_COLLECTOR sees these two entries and nothing else;
    // ADMIN can still reach the same routes to inspect them.
    key: "cashDesk",
    i18n: "cashDesk.navSection",
    roles: ["CASH_COLLECTOR"],
    items: [
      { i18n: "cashDesk.navRecord", path: "/cash-desk", icon: HandCoins },
      { i18n: "cashDesk.navHistory", path: "/cash-desk/history", icon: History },
    ],
  },
  {
    key: "fleetPortal",
    i18n: "fleetPortal.navSection",
    roles: ["FLEET"],
    items: [
      // Revision 12 — five entries, ordered by how often a supervisor opens
      // them. Issues sits high because it is the only one where somebody is
      // waiting on the delivery company to pick up a phone.
      { i18n: "fleetPortal.navRoster", path: "/fleet-portal", icon: Users, fleetTab: "ROSTER" },
      { i18n: "fleetPortal.navIssues", path: "/fleet-portal/issues", icon: TriangleAlert, fleetTab: "ISSUES" },
      { i18n: "fleetPortal.navDocuments", path: "/fleet-portal/documents", icon: FileText, fleetTab: "DOCUMENTS" },
      { i18n: "fleetPortal.navPayouts", path: "/fleet-portal/payouts", icon: Truck, fleetTab: "PAYOUTS" },
      // Revision 14 — the company's cash account with Darb, next to Payouts
      // because the two are the same conversation in opposite directions.
      { i18n: "fleetPortal.navCash", path: "/fleet-portal/cash", icon: Wallet, fleetTab: "CASH" },
      { i18n: "fleetPortal.navSupport", path: "/fleet-portal/support", icon: LifeBuoy, fleetTab: "SUPPORT" },
      // Revision 13 (#6). Governed by the tab alone, never by a second role
      // gate on top of it: that is the mistake revision 11 (#9) found on the
      // merchant side, where an owner ticked Team for somebody and the entry
      // still refused to appear.
      { i18n: "fleetPortal.navTeam", path: "/fleet-portal/team", icon: UserCog, fleetTab: "TEAM" },
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
