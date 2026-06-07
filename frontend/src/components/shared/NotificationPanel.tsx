"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  Flame,
  Gift,
  ClipboardList,
  MoreHorizontal,
} from "lucide-react";
import api from "@/lib/api";
import { useSSE } from "@/hooks/useSSE";
import { Skeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/cn";

/* ---------- types ---------- */

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  severity: string | null;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
  category?: string | null;
  titleAr?: string | null;
  bodyAr?: string | null;
}

interface CategoryCounts {
  total: number;
  important: number;
  opsTodo: number;
  benefits: number;
  other: number;
}

type NotifCategory = "ALL" | "IMPORTANT" | "OPS_TODO" | "BENEFITS" | "OTHER";

/* ---------- constants ---------- */

const CATEGORY_TABS: { key: NotifCategory; label: string; countKey: keyof CategoryCounts; icon: typeof Bell }[] = [
  { key: "ALL", label: "All", countKey: "total", icon: Bell },
  { key: "IMPORTANT", label: "Important", countKey: "important", icon: Flame },
  { key: "OPS_TODO", label: "Ops to-do", countKey: "opsTodo", icon: ClipboardList },
  { key: "BENEFITS", label: "Benefits", countKey: "benefits", icon: Gift },
  { key: "OTHER", label: "Others", countKey: "other", icon: MoreHorizontal },
];

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-red-500",
  MEDIUM: "bg-amber-400",
  LOW: "bg-gray-400",
};

const SEVERITY_ICON_CONFIG: Record<string, { icon: typeof Flame; color: string; bg: string }> = {
  CRITICAL: { icon: Flame, color: "text-red-600", bg: "bg-red-50" },
  HIGH: { icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50" },
  MEDIUM: { icon: AlertCircle, color: "text-yellow-500", bg: "bg-yellow-50" },
  LOW: { icon: Info, color: "text-blue-400", bg: "bg-blue-50" },
};

const TYPE_LABELS: Record<string, string> = {
  GPS_OFF: "GPS Off",
  OUT_OF_ZONE: "Out of Zone",
  ZONE_MISMATCH: "Zone Mismatch",
  CASH_THRESHOLD_EXCEEDED: "Cash Threshold",
  SELFIE_FAIL: "Selfie Fail",
  EQUIPMENT_MISSING: "Equipment Missing",
  SHIFT_NOT_BOOKED: "Shift Not Booked",
  LATE_CLOCK_IN: "Late Clock In",
  EARLY_CLOCK_OUT: "Early Clock Out",
  ORDER_CLICK_THROUGH: "Order Click Through",
  cash_overdue: "Cash Overdue",
  shift_not_booked: "Shift Reminder",
  LATE_PICKUP: "Late Pickup",
  ORDER_REJECTION_TIMEOUT: "Rejection Timeout",
  DROP_OFF_IN_ADVANCE: "Drop-off Advance",
  ORDER_SLIGHTLY_LATE: "Slightly Late",
  ORDER_VERY_LATE: "Very Late",
  INVALID_DELIVERY_PHOTO: "Invalid Photo",
  GPS_NOT_UPLOADING: "GPS Not Uploading",
};

/* ---------- helpers ---------- */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function severityDotClass(severity: string | null): string {
  return SEVERITY_DOT[severity || ""] || SEVERITY_DOT.LOW;
}

/* ---------- sub-components ---------- */

function NotificationSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-5 py-3.5 border-b border-gray-50">
          <Skeleton className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-16 rounded" />
              <Skeleton className="h-3 w-10 rounded ml-auto" />
            </div>
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-2/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ category }: { category: NotifCategory }) {
  const label = category === "ALL" ? "notifications" : CATEGORY_TABS.find((t) => t.key === category)?.label.toLowerCase() || "notifications";
  return (
    <div className="flex flex-col items-center justify-center py-16 text-secondary">
      <Bell size={36} className="mb-3 opacity-20" />
      <p className="text-sm font-medium">No {label}</p>
      <p className="text-xs mt-1 opacity-60">You are all caught up</p>
    </div>
  );
}

/* ---------- main component ---------- */

interface NotificationPanelProps {
  /** Maximum height for the notification list area */
  maxHeight?: number;
  /** Callback when total unread count changes (used by parent bell icon) */
  onUnreadCountChange?: (count: number) => void;
  /** Whether the panel is visible (controls data fetching) */
  visible?: boolean;
}

export default function NotificationPanel({
  maxHeight = 420,
  onUnreadCountChange,
  visible = true,
}: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryTab, setCategoryTab] = useState<NotifCategory>("ALL");
  const [categoryCounts, setCategoryCounts] = useState<CategoryCounts>({
    total: 0,
    important: 0,
    opsTodo: 0,
    benefits: 0,
    other: 0,
  });

  /* ---- fetch category counts ---- */
  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await api.get("/api/notifications/counts");
      setCategoryCounts({
        total: data.total ?? 0,
        important: data.important ?? 0,
        opsTodo: data.opsTodo ?? 0,
        benefits: data.benefits ?? 0,
        other: data.other ?? 0,
      });
      onUnreadCountChange?.(data.total ?? 0);
    } catch {
      // silently ignore
    }
  }, [onUnreadCountChange]);

  /* ---- fetch notifications for current category ---- */
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const categoryParam = categoryTab !== "ALL" ? `&category=${categoryTab}` : "";
      const { data } = await api.get(`/api/notifications?limit=20${categoryParam}`);
      setNotifications(data.notifications ?? data ?? []);
    } catch {
      // keep existing list
    } finally {
      setLoading(false);
    }
  }, [categoryTab]);

  /* ---- SSE for real-time updates ---- */
  const handleSSEMessage = useCallback(
    (payload: any) => {
      if (payload.type === "unread_count") {
        onUnreadCountChange?.(payload.count);
        // Refresh counts
        fetchCounts();
      } else if (payload.type === "notifications" && Array.isArray(payload.items)) {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const newItems = (payload.items as NotificationItem[]).filter((n) => !existingIds.has(n.id));
          return [...newItems, ...prev].slice(0, 50);
        });
        fetchCounts();
      }
    },
    [onUnreadCountChange, fetchCounts]
  );

  const sseUrl = `/api/notifications/stream`;
  useSSE({ url: sseUrl, onMessage: handleSSEMessage, enabled: visible });

  /* ---- initial load & category change ---- */
  useEffect(() => {
    if (visible) {
      fetchNotifications();
      fetchCounts();
    }
  }, [visible, fetchNotifications, fetchCounts]);

  /* ---- actions ---- */
  const markRead = async (id: string) => {
    try {
      await api.put(`/api/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setCategoryCounts((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
      }));
      onUnreadCountChange?.(Math.max(0, categoryCounts.total - 1));
    } catch {
      // silently ignore
    }
  };

  const markAllRead = async () => {
    try {
      await api.put("/api/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setCategoryCounts((prev) => ({
        ...prev,
        total: 0,
        important: 0,
        opsTodo: 0,
        benefits: 0,
        other: 0,
      }));
      onUnreadCountChange?.(0);
    } catch {
      // silently ignore
    }
  };

  /* ---- derived ---- */
  const totalUnread = categoryCounts.total;

  const filteredNotifications = useMemo(
    () =>
      categoryTab === "ALL"
        ? notifications
        : notifications.filter((n) => n.category === categoryTab),
    [categoryTab, notifications]
  );

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Header with mark-all-read */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
        {totalUnread > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
        )}
      </div>

      {/* Category tab bar */}
      <div className="flex gap-0.5 px-3 py-2 border-b border-gray-100 overflow-x-auto">
        {CATEGORY_TABS.map((tab) => {
          const count = categoryCounts[tab.countKey] ?? 0;
          const isActive = categoryTab === tab.key;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setCategoryTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-secondary hover:text-foreground hover:bg-gray-50"
              )}
            >
              <TabIcon size={12} />
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    "ml-0.5 min-w-[18px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-center leading-none",
                    isActive ? "bg-primary/20 text-primary" : "bg-gray-200/70 text-secondary"
                  )}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Notification list */}
      <div className="overflow-y-auto" style={{ maxHeight }}>
        {loading && notifications.length === 0 ? (
          <NotificationSkeleton />
        ) : filteredNotifications.length === 0 ? (
          <EmptyState category={categoryTab} />
        ) : (
          filteredNotifications.map((n) => {
            const severity = n.severity || "LOW";
            const iconCfg = SEVERITY_ICON_CONFIG[severity] || SEVERITY_ICON_CONFIG.LOW;
            const SevIcon = iconCfg.icon;
            return (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-3 px-5 py-3.5 border-b border-gray-50 transition-colors cursor-pointer group",
                  !n.read
                    ? "bg-primary/[0.03] hover:bg-primary/[0.06]"
                    : "hover:bg-gray-50/50"
                )}
                onClick={() => !n.read && markRead(n.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!n.read) markRead(n.id);
                  }
                }}
              >
                {/* Severity dot (left side) */}
                <div className="flex flex-col items-center gap-1 pt-1 flex-shrink-0">
                  <span
                    className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", severityDotClass(severity))}
                    title={`Severity: ${severity}`}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Type badge + timestamp row */}
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn("p-1 rounded-md", iconCfg.bg)}>
                      <SevIcon size={10} className={iconCfg.color} />
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
                        iconCfg.bg,
                        iconCfg.color
                      )}
                    >
                      {TYPE_LABELS[n.type] || n.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] text-secondary ml-auto flex-shrink-0">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>

                  {/* English title + body */}
                  <p className="text-xs font-medium text-foreground leading-snug">
                    {n.title}
                  </p>
                  <p className="text-xs text-secondary leading-relaxed mt-0.5 line-clamp-2">
                    {n.message}
                  </p>

                  {/* Arabic title + body (bilingual) */}
                  {(n.titleAr || n.bodyAr) && (
                    <div
                      className="mt-1.5 pt-1.5 border-t border-gray-100/60"
                      dir="rtl"
                    >
                      {n.titleAr && (
                        <p className="text-[11px] font-medium text-foreground/70 leading-snug">
                          {n.titleAr}
                        </p>
                      )}
                      {n.bodyAr && (
                        <p className="text-[10px] text-secondary leading-relaxed mt-0.5 line-clamp-2">
                          {n.bodyAr}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Unread indicator (blue dot, right side) */}
                {!n.read && (
                  <div className="mt-1.5 flex-shrink-0">
                    <span className="block w-2 h-2 rounded-full bg-primary" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
