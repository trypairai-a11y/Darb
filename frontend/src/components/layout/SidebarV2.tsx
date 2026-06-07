"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useSidebar } from "@/contexts/SidebarContext";
import { useRole } from "@/hooks/useRole";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import {
  Sparkles,
  Users,
  CalendarClock,
  Package,
  Siren,
  Wallet,
  LineChart,
  Settings,
  PanelLeftClose,
  Command,
  Inbox,
  History,
  GraduationCap,
  CreditCard,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import { getPendingCount } from "@/lib/decisionsApi";

/**
 * v2 Sidebar — workflow-oriented nav. Phase 2 Wave 3 adds:
 *   • `Decisions` (Inbox icon) at the top with live pending-count badge
 *     polled from /api/decisions/pending-count every 30s.
 *   • `Audit` (History icon) sub-link directly under Decisions.
 *   • Super-admin footer section with Onboarding + Billing links, only
 *     rendered when useAuth().user.isSuperAdmin === true (Wave 5 will
 *     ship the backend isSuperAdmin flag on the User row + the
 *     /admin/* pages; the links 404 until then — acceptable per plan).
 *
 * Decisions and Audit DO NOT replace any existing nav item. Command Centre
 * drops to position 2; hide-behind-flag is Phase 10's job.
 */

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  minRole?: "ADMIN" | "OPS_MANAGER" | "SUPERVISOR" | "ACCOUNTANT" | "VIEWER";
  liveBadge?: "queue" | "decisions-pending";
  // Optional sub-link rendered immediately below the parent (used by
  // Decisions → Audit). Sub-links inherit the parent's role visibility.
  subItems?: Array<{ label: string; path: string; icon: LucideIcon }>;
}

const NAV: NavItem[] = [
  {
    label: "Decisions",
    path: "/decisions",
    icon: Inbox,
    liveBadge: "decisions-pending",
    subItems: [{ label: "Audit", path: "/decisions/audit", icon: History }],
  },
  // Phase 4 Wave 4 — Chat surface (UI-SPEC §2.2 position 2).
  { label: "Chat", path: "/chat", icon: MessageSquare },
  { label: "Command Centre", path: "/v2", icon: Sparkles },
  { label: "Drivers", path: "/v2/drivers", icon: Users },
  { label: "Dispatch", path: "/v2/dispatch", icon: CalendarClock },
  { label: "Orders", path: "/v2/orders", icon: Package },
  { label: "Triage", path: "/v2/triage", icon: Siren, liveBadge: "queue" },
  { label: "Money", path: "/v2/money", icon: Wallet, minRole: "ACCOUNTANT" },
  { label: "Intelligence", path: "/v2/intelligence", icon: LineChart },
];

const ROLE_VISIBILITY: Record<string, string[]> = {
  ADMIN: NAV.flatMap((n) => [n.path, ...(n.subItems?.map((s) => s.path) ?? [])]),
  OPS_MANAGER: NAV.flatMap((n) => [
    n.path,
    ...(n.subItems?.map((s) => s.path) ?? []),
  ]),
  // Supervisors retain pre-existing access set + see Decisions inbox + Audit + Chat.
  SUPERVISOR: [
    "/decisions",
    "/decisions/audit",
    "/chat",
    "/v2",
    "/v2/drivers",
    "/v2/dispatch",
    "/v2/triage",
  ],
  // Accountants retain pre-existing access set + see Audit log (UI-SPEC §11 Q3
  // default — audit log visible to all roles read-only). Chat for ad-hoc Q&A.
  ACCOUNTANT: ["/decisions/audit", "/chat", "/v2", "/v2/money", "/v2/intelligence", "/v2/triage"],
  // Viewers per UI-SPEC §2.2 also land on /decisions, so they can read
  // their own inbox + the audit log + chat (read-only Q&A).
  VIEWER: ["/decisions", "/decisions/audit", "/chat", "/v2", "/v2/intelligence"],
};

interface AuthUserShape {
  isSuperAdmin?: boolean;
  [k: string]: unknown;
}

export default function SidebarV2() {
  const pathname = usePathname();
  const { collapsed, open, setOpen } = useSidebar();
  const { role, canManageSettings } = useRole();
  const { user } = useAuth();
  const isSuperAdmin = Boolean(
    (user as AuthUserShape | null | undefined)?.isSuperAdmin,
  );
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [pendingDecisions, setPendingDecisions] = useState<number | null>(null);

  const visible = new Set(ROLE_VISIBILITY[role] ?? ROLE_VISIBILITY.VIEWER);
  const items = NAV.filter((i) => visible.has(i.path));

  // Triage queue badge — preserved from prior implementation.
  useEffect(() => {
    let mounted = true;
    async function loadCount() {
      try {
        const { data } = await api.get("/api/queue/counts");
        if (mounted) setQueueCount(data.pending ?? 0);
      } catch {
        if (mounted) setQueueCount(null);
      }
    }
    loadCount();
    const t = setInterval(loadCount, 30_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  // Decisions pending-count badge (Phase 2 Wave 3 — UI-SPEC §2.3).
  useEffect(() => {
    let mounted = true;
    async function loadPending() {
      try {
        const data = await getPendingCount();
        if (mounted) setPendingDecisions(data.count ?? 0);
      } catch {
        if (mounted) setPendingDecisions(null);
      }
    }
    loadPending();
    const t = setInterval(loadPending, 30_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  const isActive = (path: string) => {
    if (path === "/v2") return pathname === "/v2";
    if (path === "/decisions") return pathname === "/decisions";
    if (path === "/chat") return pathname === "/chat" || (pathname?.startsWith("/chat/") ?? false);
    return pathname === path || pathname?.startsWith(path + "/");
  };

  // Phase 4 Wave 4 — sidebar Ask Darb pill triggers the global cmdk palette
  // (already bound to ⌘K by AskDarbPalette). Dispatching a synthetic keyboard
  // event keeps the wiring stateless — no new context plumbing.
  const openAskDarb = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      }),
    );
  };

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-40 flex h-screen flex-col border-r border-gray-100 bg-white transition-all duration-200",
        !open ? "-translate-x-full w-60" : collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-gray-50",
          collapsed ? "justify-center px-2" : "justify-between px-5",
        )}
      >
        {!collapsed ? (
          <Image
            src="/logo.png"
            alt="Darb"
            width={120}
            height={40}
            className="object-contain"
            priority
          />
        ) : (
          <Image
            src="/logo.png"
            alt="Darb"
            width={28}
            height={28}
            className="object-contain"
            priority
          />
        )}
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-secondary transition-colors hover:bg-gray-50 hover:text-foreground"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
        {items.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          let badge: number | null = null;
          if (item.liveBadge === "queue" && queueCount && queueCount > 0) {
            badge = queueCount;
          } else if (
            item.liveBadge === "decisions-pending" &&
            pendingDecisions &&
            pendingDecisions > 0
          ) {
            badge = pendingDecisions;
          }
          return (
            <div key={item.path}>
              <Link
                href={item.path}
                className={cn(
                  "group flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-foreground text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    size={18}
                    className={
                      active ? "" : "text-gray-400 group-hover:text-foreground"
                    }
                  />
                  {!collapsed && <span>{item.label}</span>}
                </span>
                {!collapsed && badge !== null && (
                  <span
                    className={cn(
                      "inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-red-500 text-white",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </Link>
              {/* Sub-items rendered immediately below their parent. */}
              {!collapsed &&
                item.subItems
                  ?.filter((s) => visible.has(s.path))
                  .map((sub) => {
                    const SubIcon = sub.icon;
                    const subActive = isActive(sub.path);
                    return (
                      <Link
                        key={sub.path}
                        href={sub.path}
                        className={cn(
                          "ms-7 flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
                          subActive
                            ? "bg-primary/10 text-primary"
                            : "text-gray-500 hover:bg-gray-50 hover:text-foreground",
                        )}
                      >
                        <SubIcon size={14} />
                        <span>{sub.label}</span>
                      </Link>
                    );
                  })}
            </div>
          );
        })}
      </nav>

      {/* Super-admin footer section (Phase 2 Wave 3 — UI-SPEC §2.3). The
          /admin/* pages don't ship until Waves 4–5; the links 404 until
          then. */}
      {isSuperAdmin && !collapsed && (
        <div className="border-t border-gray-50 px-2 py-3 space-y-0.5">
          <p className="px-3 pb-1 text-[10px] uppercase tracking-widest text-gray-400">
            Admin
          </p>
          <Link
            href="/admin/onboarding"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
              isActive("/admin/onboarding")
                ? "bg-foreground text-white"
                : "text-gray-600 hover:bg-gray-50 hover:text-foreground",
            )}
          >
            <GraduationCap size={18} />
            <span>Onboarding</span>
          </Link>
          <Link
            href="/admin/billing"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
              isActive("/admin/billing")
                ? "bg-foreground text-white"
                : "text-gray-600 hover:bg-gray-50 hover:text-foreground",
            )}
          >
            <CreditCard size={18} />
            <span>Billing</span>
          </Link>
        </div>
      )}

      {/* Phase 4 Wave 4 — Ask Darb pill (sidebar footer). Click triggers the
          global cmdk palette via a synthetic ⌘K keydown event so we keep
          one source of truth for the palette open-state. */}
      {!collapsed && (
        <div className="border-t border-gray-50 p-3">
          <button
            type="button"
            onClick={openAskDarb}
            className="flex w-full items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-secondary hover:bg-gray-100 hover:text-foreground transition-colors"
            aria-label="Open Ask Darb (Cmd K)"
          >
            <Command size={13} />
            <span className="flex-1 text-left">Ask Darb</span>
            <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-500">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {canManageSettings && (
        <div className="border-t border-gray-50 px-2 py-3">
          <Link
            href="/v2/settings"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
              isActive("/v2/settings")
                ? "bg-foreground text-white"
                : "text-gray-600 hover:bg-gray-50 hover:text-foreground",
            )}
          >
            <Settings size={18} />
            {!collapsed && <span>Settings</span>}
          </Link>
        </div>
      )}
    </aside>
  );
}
