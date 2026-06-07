"use client";
// Phase 2 Wave 3 — Owner inbox page (REQ-decisions-proposal-inbox).
// Single full-width inbox. 30 second poll on /api/decisions, optimistic
// approve/dismiss/edit with 5s undo and keyboard help (?).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  approveDecision,
  dismissDecision,
  listDecisions,
  undoDecision,
  type ListDecisionsParams,
} from "@/lib/decisionsApi";
import DecisionsList from "@/components/decisions/DecisionsList";
import EditDrawer from "@/components/decisions/EditDrawer";
import KeyboardShortcutsHelp from "@/components/decisions/KeyboardShortcutsHelp";
import ErrorState from "@/components/shared/ErrorState";
import { useToast } from "@/components/shared/Toast";
import type { DecisionCardData } from "@/types/decisions";

const POLL_INTERVAL_MS = 30_000;
const UNDO_WINDOW_MS = 5_000;

const FILTER_KEYS = [
  "all",
  "high-conf",
  "this-week",
  "penalty",
  "cash",
  "warn",
  "suspend",
  "promote",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

export default function DecisionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toastApi = useToast();

  const filterParam = (searchParams?.get("filter") as FilterKey) ?? "all";
  const activeFilter: FilterKey = FILTER_KEYS.includes(filterParam)
    ? filterParam
    : "all";

  const [cards, setCards] = useState<DecisionCardData[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editCardId, setEditCardId] = useState<string | null>(null);
  // Approved cards stay visible for the undo window; we track approve
  // timestamps to know when to evict them.
  const approvedAtRef = useRef<Map<string, number>>(new Map());

  // ---- Fetch + reconcile ----
  const fetchCards = useCallback(async () => {
    try {
      const params: ListDecisionsParams = {
        status: "pending",
        filter: activeFilter,
        sort: "priority",
        limit: 25,
      };
      const data = await listDecisions(params);
      setCards((prev) => mergeCards(prev, data.cards, approvedAtRef.current));
      setCounts(data.counts ?? {});
      setError(null);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Couldn't load proposals.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    setLoading(true);
    fetchCards();
    const interval = setInterval(fetchCards, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCards]);

  // ---- Eviction tick: drop approved cards 1.5s after the undo window. ----
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      const map = approvedAtRef.current;
      let dirty = false;
      const evicted: string[] = [];
      map.forEach((approvedAt, id) => {
        if (now - approvedAt > UNDO_WINDOW_MS + 1500) {
          evicted.push(id);
          dirty = true;
        }
      });
      if (dirty) {
        evicted.forEach((id) => map.delete(id));
        setCards((prev) =>
          prev.filter(
            (c) => !(c.state === "approved" && evicted.includes(c.id)),
          ),
        );
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // ---- ? toggles keyboard help ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (inField) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---- Action handlers ----
  const handleApprove = useCallback(
    async (id: string, modifications?: Record<string, unknown>) => {
      // Snapshot original state for rollback.
      const original = cards.find((c) => c.id === id);
      if (!original) return;

      // Optimistic flip.
      setCards((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                state: "approved",
                approvedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
      approvedAtRef.current.set(id, Date.now());

      try {
        await approveDecision(id, modifications);
        toastApi.success(`Approved ${original.tag} for ${original.driverName}`);
      } catch (e: unknown) {
        // Rollback.
        approvedAtRef.current.delete(id);
        setCards((prev) => prev.map((c) => (c.id === id ? original : c)));
        const msg =
          e instanceof Error ? e.message : "Couldn't approve. Try again.";
        toastApi.error(msg);
      }
    },
    [cards, toastApi],
  );

  const handleDismiss = useCallback(
    async (id: string, reason: string) => {
      const original = cards.find((c) => c.id === id);
      if (!original) return;
      setCards((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                state: "dismissed",
                dismissalReason: reason,
                dismissedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
      // Remove fully after a short delay (UI-SPEC §3.1.5 — 1.5s collapse).
      setTimeout(() => {
        setCards((prev) =>
          prev.filter((c) => !(c.id === id && c.state === "dismissed")),
        );
      }, 1500);

      try {
        await dismissDecision(id, reason);
      } catch (e: unknown) {
        setCards((prev) => prev.map((c) => (c.id === id ? original : c)));
        const msg =
          e instanceof Error ? e.message : "Couldn't dismiss. Try again.";
        toastApi.error(msg);
      }
    },
    [cards, toastApi],
  );

  const handleUndo = useCallback(
    async (id: string) => {
      const approvedAt = approvedAtRef.current.get(id);
      if (!approvedAt || Date.now() - approvedAt > UNDO_WINDOW_MS) {
        toastApi.warning("Undo window expired. Use the audit log instead.");
        return;
      }
      // Optimistic flip back to pending.
      setCards((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, state: "pending", approvedAt: undefined }
            : c,
        ),
      );
      approvedAtRef.current.delete(id);
      try {
        await undoDecision(id);
        toastApi.info("Approval undone");
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Couldn't undo. Try again.";
        toastApi.error(msg);
      }
    },
    [toastApi],
  );

  const handleEdit = useCallback((id: string) => {
    setEditCardId(id);
  }, []);

  // ---- Edit drawer ----
  const editingCard = useMemo(
    () => cards.find((c) => c.id === editCardId) ?? null,
    [cards, editCardId],
  );

  function handleEditSave(modifications: Record<string, unknown>) {
    const id = editCardId;
    setEditCardId(null);
    if (id) {
      handleApprove(id, modifications);
    }
  }

  function handleFilterChange(next: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "all") {
      params.delete("filter");
    } else {
      params.set("filter", next);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?");
  }

  const pendingCount = counts.pending ?? cards.filter((c) => c.state === "pending").length;

  return (
    <div className="w-full max-w-none">
      <section
        aria-labelledby="decisions-heading"
        className="overflow-hidden rounded-[18px] border border-black/[0.06] bg-white/85 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:bg-card/85"
      >
        <div className="border-b border-sand-200/80 p-5 lg:p-6">
          <div>
            <h1
              id="decisions-heading"
              className="font-display text-[40px] leading-[44px] text-sand-900 dark:text-foreground"
            >
              Decisions
            </h1>
            <p className="mt-2 text-[15px] tabular-nums text-sand-600">
              {pendingCount} pending
            </p>
          </div>
        </div>

        <div className="p-3 sm:p-4 lg:p-5">
          {error ? (
            <ErrorState
              error={error}
              onRetry={() => {
                setLoading(true);
                fetchCards();
              }}
            />
          ) : (
            <DecisionsList
              cards={cards}
              loading={loading}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              onEdit={handleEdit}
              onUndo={handleUndo}
              filter={activeFilter}
              onClearFilter={() => handleFilterChange("all")}
            />
          )}
        </div>
      </section>

      <EditDrawer
        card={editingCard}
        open={editCardId !== null}
        onSave={handleEditSave}
        onClose={() => setEditCardId(null)}
      />

      <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

// Merge fresh server cards with optimistic local state. Approved/dismissed
// cards in `prev` are preserved (their lifecycle is owned by the eviction
// tick + dismiss timeout). New pending cards in `fresh` show up at the top.
function mergeCards(
  prev: DecisionCardData[],
  fresh: DecisionCardData[],
  approvedAt: Map<string, number>,
): DecisionCardData[] {
  // Index prev by id for cheap lookup.
  const prevById = new Map(prev.map((c) => [c.id, c]));
  const merged: DecisionCardData[] = [];
  const seen = new Set<string>();

  // Preserve approved cards that are still inside the eviction window.
  prev.forEach((c) => {
    if (c.state === "approved" && approvedAt.has(c.id)) {
      merged.push(c);
      seen.add(c.id);
    }
  });

  // Fold in fresh server data (server is source of truth for pending state).
  fresh.forEach((c) => {
    if (seen.has(c.id)) return;
    const local = prevById.get(c.id);
    if (local && local.state === "dismissed") {
      // Card was dismissed locally and the dismiss API hasn't reconciled
      // server-side yet — keep the local view.
      merged.push(local);
    } else {
      merged.push(c);
    }
    seen.add(c.id);
  });

  return merged;
}
