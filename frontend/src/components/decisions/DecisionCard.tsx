"use client";
// Phase 2 Wave 3 — DecisionCard. The hero component (UI-SPEC §3.1.2 + §3.1.3
// + §3.1.5). Simplified inbox row with tag, full headline, short reasoning,
// compact approve/edit/dismiss actions, and optimistic state transitions.
//
// Server is the source of truth: optimistic flips are presentation-only;
// the parent calls the API and rolls back on error (T-02-17 mitigation).

import { useEffect, useRef, useState } from "react";
import {
  Check,
  XCircle,
  Edit3,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import TagPill from "./TagPill";
import DismissConfirm from "./DismissConfirm";
import { TOOL_EDITABLE_PARAMS, type DecisionCardData } from "@/types/decisions";

interface DecisionCardProps {
  card: DecisionCardData;
  focused: boolean;
  index: number;
  onApprove: (modifications?: Record<string, unknown>) => void;
  onEdit: () => void;
  onDismiss: (reason: string) => void;
  onUndo?: () => void;
}

export default function DecisionCard({
  card,
  focused,
  index,
  onApprove,
  onEdit,
  onDismiss,
  onUndo,
}: DecisionCardProps) {
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  // Keyboard shortcuts when this card is focused.
  useEffect(() => {
    if (!focused) return;
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      // Don't fire if a modal/drawer is open or an input is focused
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (inField || showDismissConfirm) return;

      if (isMeta && e.key === "Enter") {
        if (!card.toolIsLive) {
          e.preventDefault();
          return;
        }
        if (card.state !== "pending") return;
        e.preventDefault();
        onApprove();
        return;
      }
      if (isMeta && (e.key === "e" || e.key === "E")) {
        if (card.state !== "pending") return;
        const editable = TOOL_EDITABLE_PARAMS[card.toolName] ?? [];
        if (editable.length === 0) return;
        e.preventDefault();
        onEdit();
        return;
      }
      if (isMeta && (e.key === "d" || e.key === "D")) {
        if (card.state !== "pending") return;
        e.preventDefault();
        setShowDismissConfirm(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    focused,
    card.state,
    card.toolIsLive,
    card.toolName,
    onApprove,
    onEdit,
    showDismissConfirm,
  ]);

  // Auto-scroll on focus change. Guarded for jsdom (test env) where
  // scrollIntoView is not implemented.
  useEffect(() => {
    if (
      focused &&
      cardRef.current &&
      typeof cardRef.current.scrollIntoView === "function"
    ) {
      cardRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focused]);

  const editableParams = TOOL_EDITABLE_PARAMS[card.toolName] ?? [];
  const showEditButton = editableParams.length > 0;
  const displayText = formatDecisionText(card);

  const headlineId = `card-${index}-headline`;

  // ---- Approved state ----
  if (card.state === "approved") {
    const approvedAt = card.approvedAt ? new Date(card.approvedAt) : new Date();
    const elapsedSec = Math.max(
      0,
      Math.floor((Date.now() - approvedAt.getTime()) / 1000),
    );
    return (
      <article
        ref={cardRef}
        role="article"
        aria-labelledby={headlineId}
        className={cn(
          "rounded-[14px] border border-primary/20 bg-primary/5 p-4 transition-all duration-250 ease-sierra-out",
          focused && "ring-2 ring-primary/30",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
              <Check size={14} aria-hidden="true" />
            </div>
            <span
              id={headlineId}
              className="text-[13px] font-semibold text-primary"
            >
              Approved {elapsedSec}s ago by you
            </span>
          </div>
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              className="text-xs font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-pill px-2 py-1"
            >
              Undo
            </button>
          )}
        </div>
      </article>
    );
  }

  // ---- Dismissed state ----
  if (card.state === "dismissed") {
    return (
      <article
        ref={cardRef}
        role="article"
        aria-labelledby={headlineId}
        className={cn(
          "rounded-[14px] border border-sand-200 bg-card p-4 opacity-60 transition-all duration-250 ease-sierra-out",
          focused && "ring-2 ring-primary/30",
        )}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-sand-200 text-sand-700 flex items-center justify-center">
            <XCircle size={14} aria-hidden="true" />
          </div>
          <span
            id={headlineId}
            className="text-[13px] font-medium text-sand-700"
          >
            Dismissed{card.dismissalReason ? `: "${card.dismissalReason}"` : ""}
          </span>
        </div>
      </article>
    );
  }

  // ---- Pending state ----
  return (
    <article
      ref={cardRef}
      data-decision-card
      role="article"
      aria-labelledby={headlineId}
      className={cn(
        "rounded-[14px] border border-sand-200/80 bg-white p-4 shadow-none transition-all duration-250 ease-sierra-out dark:bg-card",
        focused && "ring-2 ring-primary/30",
        "hover:border-sand-300 hover:bg-sand-50/40",
      )}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TagPill tag={card.tag} />
            {!card.toolIsLive && <span className="text-xs text-sand-500">Review only</span>}
          </div>

          <h3
            id={headlineId}
            className="mt-1 text-[15px] font-semibold leading-snug text-foreground"
            title={displayText}
          >
            {displayText}
          </h3>
        </div>

        <div
          aria-live="polite"
          className="flex flex-wrap items-center gap-2 border-t border-sand-200 pt-3 lg:flex-nowrap lg:justify-end lg:border-t-0 lg:pt-0"
        >
          <button
            type="button"
            onClick={() => onApprove()}
            disabled={!card.toolIsLive}
            title={
              card.toolIsLive
                ? "Approve"
                : "Action tool ships in Phase 8 — your approval is recorded for training"
            }
            aria-label={`Approve ${card.tag} for ${card.driverName}`}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-pill px-4 text-sm font-medium transition duration-250 ease-sierra-out",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card",
              card.toolIsLive
                ? "bg-primary text-white hover:scale-[1.01] hover:bg-primary-hover focus:ring-primary"
                : "cursor-not-allowed bg-sand-200 text-sand-500",
            )}
          >
            <Check size={14} aria-hidden="true" />
            Approve
          </button>

          {showEditButton && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${card.tag} for ${card.driverName}`}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-pill border border-sand-300 bg-white px-3.5 text-sm font-medium text-sand-900 transition duration-250 ease-sierra-out hover:bg-sand-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <Edit3 size={14} aria-hidden="true" />
              Edit
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDismissConfirm(true)}
            aria-label={`Dismiss ${card.tag} for ${card.driverName}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-pill px-3.5 text-sm font-medium text-sand-700 transition duration-250 ease-sierra-out hover:bg-sand-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <Trash2 size={14} aria-hidden="true" />
            Dismiss
          </button>
        </div>
      </div>

      <DismissConfirm
        open={showDismissConfirm}
        driverName={card.driverName}
        onConfirm={(reason) => {
          setShowDismissConfirm(false);
          onDismiss(reason);
        }}
        onCancel={() => setShowDismissConfirm(false)}
      />
    </article>
  );
}

function formatDecisionText(card: DecisionCardData): string {
  const base = cleanDecisionText(card.reasoning || card.headline || "Review this decision");
  if (!card.driverName || card.driverName === "(unknown)") return base;
  return base.includes(card.driverName) ? base : `${card.driverName} — ${base}`;
}

function cleanDecisionText(value: string): string {
  return value
    .replace(/\u2026/g, "")
    .replace(/\.{3,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
