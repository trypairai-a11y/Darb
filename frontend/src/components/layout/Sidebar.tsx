"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useSidebar } from "@/contexts/SidebarContext";
import { useRole } from "@/hooks/useRole";
import { useI18n } from "@/i18n/I18nProvider";
import LanguageSwitcher from "./LanguageSwitcher";
import {
  Users, Settings,
  ChevronDown, PanelLeftClose,
  Briefcase,
  ShieldAlert, Sparkles, MessageSquare, Map, SlidersHorizontal,
} from "lucide-react";
import { DirectionalIcon } from "@/i18n/directionalIcon";

const PLATFORMS = [
  {
    name: "Talabat",
    key: "talabat",
    color: "text-talabat",
    bg: "bg-talabat/10",
    subPages: [
      { i18n: "nav.drivers", path: "/talabat/drivers", icon: Users },
      { i18n: "nav.orders", path: "/talabat/orders", icon: Briefcase },
      { i18n: "nav.violations", path: "/talabat/violations", icon: ShieldAlert },
    ],
  },
  {
    name: "Keeta",
    key: "keeta",
    color: "text-keeta",
    bg: "bg-keeta/10",
    subPages: [
      { i18n: "nav.drivers", path: "/keeta/drivers", icon: Users },
      { i18n: "nav.orders", path: "/keeta/orders", icon: Briefcase },
      { i18n: "nav.violations", path: "/keeta/violations", icon: ShieldAlert },
    ],
  },
  {
    name: "Deliveroo Equipment",
    key: "deliveroo",
    color: "text-deliveroo",
    bg: "bg-deliveroo/10",
    subPages: [
      { i18n: "nav.drivers", path: "/deliveroo/drivers", icon: Users },
      { i18n: "nav.orders", path: "/deliveroo/orders", icon: Briefcase },
      { i18n: "nav.violations", path: "/deliveroo/violations", icon: ShieldAlert },
    ],
  },
  {
    name: "Americana",
    key: "americana",
    color: "text-americana",
    bg: "bg-americana/10",
    subPages: [
      { i18n: "nav.drivers", path: "/americana/drivers", icon: Users },
      { i18n: "nav.orders", path: "/americana/orders", icon: Briefcase },
      { i18n: "nav.violations", path: "/americana/violations", icon: ShieldAlert },
    ],
  },
] as const;

const GLOBAL_NAV = [
  { i18n: "nav.decisions", path: "/decisions", icon: Sparkles },
  { i18n: "nav.chat", path: "/chat", icon: MessageSquare },
  { i18n: "nav.floor", path: "/v2/dispatch", icon: Map },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, open, setOpen } = useSidebar();
  const { canManageSettings } = useRole();
  const { t, dir } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const togglePlatform = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

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
        {/* Global */}
        {!collapsed && (
          <div className="px-3 mb-2 text-[11px] font-medium text-white/40 uppercase tracking-[0.18em]">
            {t("common.global")}
          </div>
        )}
        {GLOBAL_NAV.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-pill text-sm font-medium transition-all duration-250 ease-sierra-out mb-0.5",
                isActive(item.path)
                  ? "bg-primary text-white shadow-soft"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon size={18} />
              {!collapsed && (
                <>
                  <span className="flex-1">{t(item.i18n)}</span>
                </>
              )}
            </Link>
        ))}

        {/* Platforms */}
        <div className={cn("mt-6", !collapsed && "px-3 mb-2")}>
          {!collapsed && (
            <div className="text-[11px] font-medium text-white/40 uppercase tracking-[0.18em] mb-2">
              {t("nav.operations")}
            </div>
          )}
        </div>
        {PLATFORMS.map((platform) => (
          <div key={platform.key} className="mb-1">
            <button
              onClick={() => togglePlatform(platform.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-pill text-sm font-medium transition-all duration-250 ease-sierra-out",
                pathname.startsWith(`/${platform.key}`)
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full shrink-0", {
                "bg-keeta": platform.key === "keeta",
                "bg-talabat": platform.key === "talabat",
                "bg-deliveroo": platform.key === "deliveroo",
                "bg-americana": platform.key === "americana",
              })} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-start">{platform.name}</span>
                  {expanded[platform.key] ? <ChevronDown size={14} /> : <DirectionalIcon kind="chevron-forward" size={14} />}
                </>
              )}
            </button>
            {!collapsed && expanded[platform.key] && (
              <div className="ms-5 mt-0.5 space-y-0.5 animate-fade-in">
                {platform.subPages.map((sub) => (
                    <Link
                      key={sub.path}
                      href={sub.path}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all duration-250 ease-sierra-out",
                        isActive(sub.path)
                          ? "bg-white/10 text-white font-medium"
                          : "text-white/55 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <sub.icon size={14} aria-hidden="true" />
                      <span>{t(sub.i18n)}</span>
                    </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* System — only visible to OPS_MANAGER and above */}
        {canManageSettings && (
          <div className="mt-6">
            {!collapsed && (
              <div className="px-3 mb-2 text-[11px] font-medium text-white/40 uppercase tracking-[0.18em]">
                {t("common.system")}
              </div>
            )}
            <Link
              href="/settings"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-pill text-sm font-medium transition-all duration-250 ease-sierra-out",
                isActive("/settings")
                  ? "bg-primary text-white shadow-soft"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <Settings size={18} aria-hidden="true" />
              {!collapsed && <span>{t("nav.settings")}</span>}
            </Link>
            <Link
              href="/assets"
              className={cn(
                "mt-0.5 flex items-center gap-3 px-3 py-2 rounded-pill text-sm font-medium transition-all duration-250 ease-sierra-out",
                isActive("/assets")
                  ? "bg-primary text-white shadow-soft"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
              {!collapsed && <span>{t("nav.assets")}</span>}
            </Link>
          </div>
        )}
      </nav>

      <div className="border-t border-white/5 p-2">
        <LanguageSwitcher collapsed={collapsed} />
      </div>
    </aside>
  );
}
