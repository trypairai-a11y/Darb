// Phase 4 Wave 4 — single pinned-view tile rendered inside PinnedViewsRail.
//
// Re-uses Wave 3 ChatViewRenderer in mode="readonly" so the visual is a
// 1-to-1 of the chat-side view; the tile adds chrome: title bar, "Open in
// chat" link, kebab menu (refresh / unpin), and dispatches onUnpin(id) to
// the parent (the rail owns the confirm-modal state machine).
"use client";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { ChatViewRenderer } from "@/components/chat/ChatViewRenderer";
import { pinnedViewsApi } from "@/lib/api/pinnedViews";
import type { GeneratedView, PinnedView, ViewType } from "@/types/chat";

interface PinnedViewTileProps {
  pin: PinnedView | RailViewLite;
  onUnpinClick: (id: string) => void;
}

// The Wave 0 RED test passes a minimal shape `{ id, viewType, title, spec }`.
// We accept either the full PinnedView record or that lite shape so both
// the props-driven rail (tests) and the hook-driven /decisions container
// share the same tile component.
export interface RailViewLite {
  id: string;
  viewType: ViewType | string;
  title: string;
  spec: object;
  sourceThreadId?: string;
  sourceMessageId?: string;
  pinnedAt?: string;
}

export default function PinnedViewTile({
  pin,
  onUnpinClick,
}: PinnedViewTileProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Direct axios call avoids requiring QueryClientProvider in test contexts
  // — the container component handles cache invalidation on its own poll.
  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await pinnedViewsApi.refresh(pin.id);
    } catch {
      // Silently swallow — refresh is best-effort; user can retry.
    } finally {
      setRefreshing(false);
      setMenuOpen(false);
    }
  };

  // Tile already shows pin.title in its header chrome — pass no title to
  // ChatViewRenderer so we don't render a duplicate inside the view body.
  const generated: GeneratedView = {
    id: pin.id,
    viewType: pin.viewType as ViewType,
    spec: (pin.spec ?? {}) as Record<string, unknown>,
    pinnable: false,
    pinnedViewId: pin.id,
  };

  const pinnedAt = "pinnedAt" in pin ? pin.pinnedAt : undefined;

  return (
    <div className="relative w-[280px] shrink-0 rounded-[16px] border border-black/[0.06] bg-white/90 p-3 shadow-soft transition-all hover:-translate-y-[1px] hover:shadow-lift dark:bg-card/90">
      <div className="mb-2 flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{pin.title}</div>
          {pinnedAt && (
            <div className="text-[11px] text-secondary">
              Pinned {new Date(pinnedAt).toLocaleDateString()}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="text-secondary hover:text-foreground"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="h-[96px] overflow-hidden rounded-[12px] bg-sand-50/70">
        <ChatViewRenderer view={generated} mode="readonly" />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-sand-100 pt-3">
        {pin.sourceThreadId ? (
          <Link
            href={`/chat/${pin.sourceThreadId}${pin.sourceMessageId ? `#msg-${pin.sourceMessageId}` : ""}`}
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            Open in chat <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => onUnpinClick(pin.id)}
          className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"
          aria-label={`Unpin ${pin.title}`}
        >
          <Trash2 className="h-3 w-3" /> Unpin
        </button>
      </div>

      {menuOpen && (
        <div className="absolute right-3 top-10 z-10 rounded-lg bg-card py-1 shadow-lift ring-1 ring-sand-200">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 h-8 text-xs hover:bg-sand-50 w-full disabled:opacity-60"
          >
              <RefreshCw className="h-3 w-3" /> {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      )}
    </div>
  );
}
