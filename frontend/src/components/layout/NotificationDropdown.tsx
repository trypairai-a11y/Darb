"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X } from "lucide-react";
import { useSSE } from "@/hooks/useSSE";
import api from "@/lib/api";
import NotificationPanel from "@/components/shared/NotificationPanel";

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  /* ---- SSE for real-time unread count (always active, even when dropdown closed) ---- */
  const handleSSEMessage = useCallback((payload: any) => {
    if (payload.type === "unread_count") {
      setUnreadCount(payload.count);
    } else if (payload.type === "notifications" && Array.isArray(payload.items)) {
      setUnreadCount((c) => c + payload.items.filter((n: any) => !n.read).length);
    }
  }, []);

  const sseUrl = `/api/notifications/stream`;
  useSSE({ url: sseUrl, onMessage: handleSSEMessage, enabled: true });

  /* ---- Initial unread count fetch ---- */
  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .get("/api/notifications/unread-count")
        .then(({ data }) => setUnreadCount(data.count ?? 0))
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  /* ---- Close on outside click ---- */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ---- Callback from panel when count changes ---- */
  const handleUnreadCountChange = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-gray-50 text-secondary transition-colors"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none animate-in fade-in zoom-in duration-200">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[420px] bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Close button overlaid top-right */}
          <button
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 z-10 p-1 rounded-lg hover:bg-gray-100 text-secondary transition-colors"
            aria-label="Close notifications"
          >
            <X size={14} />
          </button>

          <NotificationPanel
            visible={open}
            onUnreadCountChange={handleUnreadCountChange}
            maxHeight={420}
          />
        </div>
      )}
    </div>
  );
}
