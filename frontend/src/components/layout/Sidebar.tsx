"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useSidebar } from "@/contexts/SidebarContext";
import { useRole } from "@/hooks/useRole";
import { useI18n } from "@/i18n/I18nProvider";
import LanguageSwitcher from "./LanguageSwitcher";
import { ChevronDown, PanelLeftClose } from "lucide-react";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import {
  NAV_SECTIONS,
  SHOW_LEGACY,
  buildIsActive,
  type NavItem,
  type NavSection,
} from "./navConfig";

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, open, setOpen } = useSidebar();
  const { role, hasRole } = useRole();
  const { t, dir } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sectionVisible = (section: NavSection): boolean => {
    if (section.legacy && !SHOW_LEGACY) return false;
    if (section.roles) return section.roles.includes(role);
    if (section.minRole) return hasRole(section.minRole);
    return true;
  };

  const visibleSections = NAV_SECTIONS.filter(sectionVisible);
  const isActive = buildIsActive(visibleSections, pathname);

  const renderItem = (item: NavItem, indent = false) => (
    <Link
      key={item.path}
      href={item.path}
      className={cn(
        indent
          ? "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all duration-250 ease-sierra-out"
          : "flex items-center gap-3 px-3 py-2 rounded-pill text-sm font-medium transition-all duration-250 ease-sierra-out mb-0.5",
        isActive(item.path)
          ? indent
            ? "bg-white/10 text-white font-medium"
            : "bg-primary text-white shadow-soft"
          : indent
            ? "text-white/55 hover:text-white hover:bg-white/5"
            : "text-white/70 hover:bg-white/5 hover:text-white"
      )}
    >
      <item.icon size={indent ? 14 : 18} aria-hidden="true" />
      {!collapsed && <span className="flex-1">{t(item.i18n)}</span>}
    </Link>
  );

  return (
    <aside
      className={cn(
        "fixed top-0 h-screen bg-forest-900 text-white/85 z-40 flex flex-col transition-all duration-250 ease-sierra-out",
        dir === "rtl" ? "right-0 border-l border-white/5" : "left-0 border-r border-white/5",
        !open
          ? dir === "rtl" ? "translate-x-full w-60" : "-translate-x-full w-60"
          : collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo + Collapse */}
      <div className={cn("h-16 flex items-center border-b border-white/5", collapsed ? "justify-center px-2" : "px-5 justify-between")}>
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center font-display text-lg text-white">D</div>
            <span className="font-medium tracking-tight text-white">Darb</span>
          </div>
        ) : (
          <div className="h-8 w-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center font-display text-lg text-white">D</div>
        )}
        <button
          onClick={() => setOpen(false)}
          className="p-1.5 rounded-lg text-white/60 hover:bg-white/5 hover:text-white transition-colors"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {visibleSections.map((section, sectionIdx) => (
          <div key={section.key} className={cn(sectionIdx > 0 && "mt-6")}>
            {!collapsed && (
              <div className="px-3 mb-2 text-[11px] font-medium text-white/40 uppercase tracking-[0.18em]">
                {t(section.i18n)}
              </div>
            )}
            {section.items.map((item) => renderItem(item))}

            {/* Collapsible groups (legacy platform trees) */}
            {(section.groups ?? []).map((group) => (
              <div key={group.key} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-pill text-sm font-medium transition-all duration-250 ease-sierra-out",
                    pathname.startsWith(`/${group.key}`)
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full shrink-0", group.dotClass)} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-start">{group.name}</span>
                      {expanded[group.key] ? <ChevronDown size={14} /> : <DirectionalIcon kind="chevron-forward" size={14} />}
                    </>
                  )}
                </button>
                {!collapsed && expanded[group.key] && (
                  <div className="ms-5 mt-0.5 space-y-0.5 animate-fade-in">
                    {group.items.map((item) => renderItem(item, true))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 p-2">
        <LanguageSwitcher collapsed={collapsed} />
      </div>
    </aside>
  );
}
