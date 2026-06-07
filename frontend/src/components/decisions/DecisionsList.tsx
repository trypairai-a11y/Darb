"use client";
// Phase 2 Wave 3 — DecisionsList. Renders DecisionCards with arrow-key /
// j-k / Cmd-N focus management + auto-scroll. The Wave 0 RED test
// (DecisionsList.test.tsx) is the contract: it asserts that mounting the
// list auto-focuses the first card and that Cmd+Enter on the focused card
// triggers onApprove(card.id).

import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/shared/Skeleton";
import DecisionCard from "./DecisionCard";
import DecisionsEmptyState from "./DecisionsEmptyState";
import type { DecisionCardData } from "@/types/decisions";

interface DecisionsListProps {
  cards: DecisionCardData[];
  loading: boolean;
  onApprove: (id: string, modifications?: Record<string, unknown>) => void;
  onEdit: (id: string) => void;
  onDismiss: (id: string, reason: string) => void;
  onUndo?: (id: string) => void;
  // Empty-state delegation (when filter is applied + zero results).
  filter?: string | null;
  onClearFilter?: () => void;
  onOpenAskDarb?: () => void;
}

export function DecisionsList({
  cards,
  loading,
  onApprove,
  onEdit,
  onDismiss,
  onUndo,
  filter,
  onClearFilter,
  onOpenAskDarb,
}: DecisionsListProps) {
  // Index of the focused card. -1 = none focused yet (e.g. before mount).
  const [focusedIdx, setFocusedIdx] = useState<number>(0);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Reset focus when the list shrinks.
  useEffect(() => {
    if (focusedIdx >= cards.length) {
      setFocusedIdx(Math.max(0, cards.length - 1));
    }
  }, [cards.length, focusedIdx]);

  // List-level scrollIntoView on focus change so the focused card stays
  // visible during arrow-key / j/k / Cmd+N navigation. Guarded for jsdom
  // (test env) where scrollIntoView is not implemented.
  useEffect(() => {
    const el = itemRefs.current[focusedIdx];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIdx]);

  // Global keyboard handlers: arrow / j / k / Cmd+1..9 / Cmd+Enter on the
  // focused card.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (cards.length === 0) return;
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (inField) return;

      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd+Enter approves the focused card. (DecisionCard also has its
      // own listener — but the Wave 0 test fires keydown on `window` and
      // the card's listener only attaches when `focused=true`. We keep
      // both paths in sync by handling at the list level too.)
      if (isMeta && e.key === "Enter") {
        const card = cards[focusedIdx];
        if (!card) return;
        if (card.state !== "pending") return;
        if (!card.toolIsLive) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        onApprove(card.id);
        return;
      }

      // Cmd+1..9 jump.
      if (isMeta && /^[1-9]$/.test(e.key)) {
        const next = parseInt(e.key, 10) - 1;
        if (next < cards.length) {
          e.preventDefault();
          setFocusedIdx(next);
        }
        return;
      }

      // Arrow / j / k navigation (no modifier).
      if (isMeta || e.altKey || e.shiftKey) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocusedIdx((idx) => Math.min(idx + 1, cards.length - 1));
        return;
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocusedIdx((idx) => Math.max(idx - 1, 0));
      }
    },
    [cards, focusedIdx, onApprove],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  if (loading) {
    return (
      <div
        className="flex flex-col gap-3"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-[132px] rounded-[14px] bg-sand-100"
          />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <DecisionsEmptyState
        filter={filter ?? null}
        onOpenAskDarb={onOpenAskDarb}
        onClearFilter={onClearFilter}
      />
    );
  }

  return (
    <div
      role="list"
      aria-live="polite"
      className="flex flex-col gap-3"
    >
      {cards.map((card, idx) => (
        <div
          key={card.id}
          role="listitem"
          ref={(el) => {
            itemRefs.current[idx] = el;
          }}
          onMouseEnter={() => setFocusedIdx(idx)}
          onClick={() => setFocusedIdx(idx)}
        >
          <DecisionCard
            card={card}
            focused={idx === focusedIdx}
            index={idx}
            onApprove={(modifications) => onApprove(card.id, modifications)}
            onEdit={() => onEdit(card.id)}
            onDismiss={(reason) => onDismiss(card.id, reason)}
            onUndo={onUndo ? () => onUndo(card.id) : undefined}
          />
        </div>
      ))}
    </div>
  );
}

// Default export for ergonomic imports; the named export matches the Wave 0
// RED test's `import { DecisionsList } from "..."`.
export default DecisionsList;
