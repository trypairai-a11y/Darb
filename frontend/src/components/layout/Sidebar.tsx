"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useSidebar } from "@/contexts/SidebarContext";
import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { useAuth } from "@/contexts/AuthContext";
import { vendorApi } from "@/lib/darbApi";
import { roleDefaultTabs } from "@/lib/vendorTabs";
import { useI18n } from "@/i18n/I18nProvider";
import LanguageSwitcher from "./LanguageSwitcher";
import { PanelLeftClose } from "lucide-react";
import {
  NAV_SECTIONS,
  buildIsActive,
  type NavItem,
  type NavSection,
} from "./navConfig";

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, open, setOpen } = useSidebar();
  const { role, hasRole } = useRole();
  const { user } = useAuth();
  const vendorRole = user?.vendorRole ?? "OWNER";
  const { t, dir } = useI18n();

  /**
   * Revision 10 (#6) — the tabs this shop login may open, from the server.
   *
   * The rail used to be filtered on vendorRole alone, which could not see a
   * per-user tab list at all: an owner narrowed somebody's access and the entry
   * stayed in the rail until they clicked it and got a 403. The same /me query
   * the portal already runs, so this costs no extra request.
   */
  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    enabled: role === "VENDOR",
    staleTime: 60_000,
  });
  // Until the answer lands, fall back to what the role opens. That is what the
  // rail showed before per-user tabs existed, so the worst case is one entry
  // appearing for a moment before it is taken away, rather than an empty rail.
  const vendorTabs = meQuery.data?.portalTabs ?? roleDefaultTabs(vendorRole);

  const sectionVisible = (section: NavSection): boolean => {
    if (section.roles) return section.roles.includes(role);
    if (section.minRole) return hasRole(section.minRole);
    return true;
  };

  // Items carry their own minRole on top of the section gate, which is how the
  // single staff section reproduces the old five-section role split.
  const visibleSections = NAV_SECTIONS.filter(sectionVisible)
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (!item.minRole || hasRole(item.minRole)) &&
          // A vendor login only sees the entries its portal role can open.
          // Staff are unaffected: no staff item carries vendorRoles.
          (!item.vendorRoles || (role === "VENDOR" && item.vendorRoles.includes(vendorRole))) &&
          // …and only the tabs its own access includes. Both gates apply, so
          // Team stays owner-only even if somebody is granted the TEAM tab.
          (!item.vendorTab || role !== "VENDOR" || vendorTabs.includes(item.vendorTab)),
      ),
    }))
    .filter((section) => section.items.length > 0);
  const isActive = buildIsActive(visibleSections, pathname);

  const renderItem = (item: NavItem) => (
    <Link
      key={item.path}
      href={item.path}
      className={cn(
        // Roomier than the old sixteen-row rail could afford.
        "flex items-center gap-3 px-3.5 py-2.5 rounded-pill text-[15px] font-medium transition-all duration-250 ease-sierra-out mb-1",
        isActive(item.path)
          ? "bg-primary text-white shadow-soft"
          : "text-sand-700 dark:text-secondary hover:bg-sand-100 dark:hover:bg-white/5 hover:text-sand-900 dark:hover:text-foreground"
      )}
    >
      <item.icon size={18} aria-hidden="true" />
      {!collapsed && <span className="flex-1">{t(item.i18n)}</span>}
    </Link>
  );

  // Revision #7: the rail used to be a solid forest-green block, which the
  // client read as heavy and unfriendly. It is now the same light surface as
  // the rest of the shell, with Darb green kept for the active item only.
  return (
    <aside
      className={cn(
        "fixed top-0 h-screen bg-surface text-foreground z-40 flex flex-col transition-all duration-250 ease-sierra-out",
        dir === "rtl"
          ? "right-0 border-l border-sand-200 dark:border-border"
          : "left-0 border-r border-sand-200 dark:border-border",
        !open
          ? dir === "rtl" ? "translate-x-full w-60" : "-translate-x-full w-60"
          : collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo + Collapse */}
      <div
        className={cn(
          "h-16 flex items-center border-b border-sand-200 dark:border-border",
          collapsed ? "justify-center px-2" : "px-5 justify-between"
        )}
      >
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center font-display text-lg text-white">
            D
          </div>
          {!collapsed && <span className="font-medium tracking-tight text-sand-900 dark:text-foreground">Darb</span>}
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1.5 rounded-lg text-sand-500 hover:bg-sand-100 dark:hover:bg-white/5 hover:text-sand-800 dark:hover:text-foreground transition-colors"
          aria-label={t("common.close")}
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {visibleSections.map((section, sectionIdx) => (
          <div key={section.key} className={cn(sectionIdx > 0 && "mt-6")}>
            {!collapsed && section.i18n && (
              <div className="px-3 mb-2 text-[11px] font-medium text-sand-500 uppercase tracking-[0.18em]">
                {t(section.i18n)}
              </div>
            )}
            {section.items.map((item) => renderItem(item))}
          </div>
        ))}
      </nav>

      <div className="border-t border-sand-200 dark:border-border p-2">
        <LanguageSwitcher collapsed={collapsed} />
      </div>
    </aside>
  );
}
