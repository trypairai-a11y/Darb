// Phase 4 Wave 4 — collapsible rail of saved generated views, shown above
// the proposal inbox on /decisions.
//
// Empty state hides the rail entirely (UI-SPEC §3.3.4 — no real estate
// wasted when nothing is pinned). Renders up to 6 tiles inline; a 7th+
// surfaces a "View all" CTA. Tiles dispatch onUnpinClick(id) up to this
// rail which owns the confirm-modal state.
//
// The component is intentionally prop-driven (`views` + `onUnpin`) so it
// can be tested in isolation; the /decisions page mounts the hook-driven
// `<PinnedViewsRailContainer />` wrapper below which threads React Query
// state in.
"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import PinnedViewTile, {
  type RailViewLite,
} from "./PinnedViewTile";
import UnpinConfirm from "./UnpinConfirm";
import { usePinnedViews, useUnpinView } from "@/hooks/usePinnedViews";
import type { PinnedView } from "@/types/chat";

const STORAGE_KEY = "darb.decisions.pinnedRailCollapsed";
const TILE_CAP = 6;

interface PinnedViewsRailProps {
  views: Array<PinnedView | RailViewLite>;
  onUnpin?: (id: string) => void;
  loading?: boolean;
  defaultCollapsed?: boolean;
}

export function PinnedViewsRail({
  views,
  onUnpin,
  loading = false,
  defaultCollapsed = false,
}: PinnedViewsRailProps) {
  // Hooks must run unconditionally — keep them above any early returns.
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [pendingUnpin, setPendingUnpin] = useState<RailViewLite | PinnedView | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage?.getItem(STORAGE_KEY);
      if (v !== null && v !== undefined) setCollapsed(v === "true");
    } catch {
      // jsdom / private-browsing: skip persistence.
    }
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage?.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
  };

  if (loading) return null;
  if (!views || views.length === 0) {
    // Empty state hides the rail entirely (UI-SPEC §3.3.4).
    return null;
  }

  const handleUnpinClick = (id: string) => {
    if (onUnpin) {
      // Test path / external handler — fire directly, no modal.
      onUnpin(id);
      return;
    }
    const target = views.find((v) => v.id === id);
    if (target) setPendingUnpin(target);
  };

  const visible = views.slice(0, TILE_CAP);

  return (
    <section
      className="rounded-[18px] border border-black/[0.06] bg-white/75 p-3 shadow-soft backdrop-blur-xl dark:bg-card/80"
      data-testid="pinned-views-rail"
    >
      <header className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 items-center gap-1 rounded-pill px-2 text-sm font-medium text-sand-900 hover:bg-sand-100"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          Pinned views ({views.length})
        </button>
      </header>
      {!collapsed && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {visible.map((v) => (
            <PinnedViewTile key={v.id} pin={v} onUnpinClick={handleUnpinClick} />
          ))}
          {views.length > TILE_CAP && (
            <button
              type="button"
              className="text-sm text-primary self-center hover:underline shrink-0 px-3"
            >
              View all ({views.length}) →
            </button>
          )}
        </div>
      )}

      <UnpinConfirm
        open={pendingUnpin !== null}
        pinTitle={pendingUnpin?.title ?? ""}
        onCancel={() => setPendingUnpin(null)}
        onConfirm={() => {
          if (pendingUnpin && onUnpin) onUnpin(pendingUnpin.id);
          setPendingUnpin(null);
        }}
      />
    </section>
  );
}

/**
 * Hook-driven wrapper rendered on the /decisions page. Reads pins from
 * React Query, wires the DELETE mutation, and forwards everything to the
 * prop-driven PinnedViewsRail above.
 */
export function PinnedViewsRailContainer() {
  const { data, isLoading } = usePinnedViews();
  const unpin = useUnpinView();
  return (
    <PinnedViewsRail
      views={data?.pinnedViews ?? []}
      loading={isLoading}
      onUnpin={(id) => unpin.mutate(id)}
    />
  );
}

export default PinnedViewsRail;
