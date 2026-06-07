"use client";
// Phase 2 Wave 3 — Right-slide drawer for editing a proposal's editableParams
// before approving (UI-SPEC §3.1.3 + §10 modifications). Reads
// TOOL_EDITABLE_PARAMS to decide which inputs to render. Save calls
// onSave(modifications) with only the changed keys (clamped to the allow-list).
//
// Phase 2 inputs:
//   - bodyEnglish → textarea (rows=8, max 500 chars)
//   - amountKd → number input with KD prefix (3-decimal precision)

import { useEffect, useMemo, useState } from "react";
import SlidePanel from "@/components/shared/SlidePanel";
import { cn } from "@/lib/cn";
import {
  TOOL_EDITABLE_PARAMS,
  type DecisionCardData,
} from "@/types/decisions";

interface EditDrawerProps {
  card: DecisionCardData | null;
  open: boolean;
  onSave: (modifications: Record<string, unknown>) => void;
  onClose: () => void;
}

interface FieldDef {
  name: string;
  type: "textarea" | "kd-amount";
  label: string;
}

function fieldDefFor(name: string): FieldDef {
  if (name === "bodyEnglish") {
    return { name, type: "textarea", label: "Message (English)" };
  }
  if (name === "amountKd") {
    return { name, type: "kd-amount", label: "Amount (KD)" };
  }
  return { name, type: "textarea", label: name };
}

export default function EditDrawer({
  card,
  open,
  onSave,
  onClose,
}: EditDrawerProps) {
  const editable = useMemo(() => {
    if (!card) return [] as string[];
    return TOOL_EDITABLE_PARAMS[card.toolName] ?? [];
  }, [card]);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset on card change (drawer reopen with different card).
  useEffect(() => {
    if (open && card) {
      const initial: Record<string, unknown> = {};
      for (const name of editable) {
        initial[name] = card.proposalDraft.args[name] ?? "";
      }
      setValues(initial);
      setSubmitting(false);
    }
  }, [open, card, editable]);

  // Esc → close drawer
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!card) return null;

  function isValid(): boolean {
    for (const name of editable) {
      const v = values[name];
      if (name === "bodyEnglish") {
        if (typeof v !== "string" || v.trim().length === 0) return false;
        if (v.length > 500) return false;
      } else if (name === "amountKd") {
        const n = typeof v === "number" ? v : parseFloat(String(v));
        if (Number.isNaN(n) || n <= 0) return false;
      } else {
        if (v === undefined || v === null || v === "") return false;
      }
    }
    return true;
  }

  function handleSave() {
    if (!card || !isValid() || submitting) return;
    setSubmitting(true);
    // Diff against the original draft; only emit changed keys.
    const diff: Record<string, unknown> = {};
    for (const name of editable) {
      const original = card.proposalDraft.args[name];
      const next = values[name];
      const same =
        original === next ||
        (typeof original === "number" &&
          typeof next === "string" &&
          parseFloat(next) === original);
      if (!same) {
        diff[name] = name === "amountKd" ? Number(next) : next;
      }
    }
    onSave(diff);
  }

  const subtitle = "Edit before approving";
  const title = card.driverName
    ? `Edit proposal for ${card.driverName}`
    : "Edit proposal";

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
    >
      {editable.length === 0 ? (
        <p className="text-sm text-sand-700">
          This tool has no editable fields. Approve as-is or dismiss.
        </p>
      ) : (
        <div className="space-y-5">
          {editable.map((name) => {
            const def = fieldDefFor(name);
            const v = values[name] ?? "";
            if (def.type === "textarea") {
              const text = String(v);
              const overLimit = text.length > 500;
              return (
                <div key={name}>
                  <label
                    htmlFor={`edit-${name}`}
                    className="block text-xs font-medium text-sand-700 mb-1.5"
                  >
                    {def.label}
                  </label>
                  <textarea
                    id={`edit-${name}`}
                    value={text}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [name]: e.target.value,
                      }))
                    }
                    rows={8}
                    className={cn(
                      "w-full px-3 py-2 rounded-xl border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none leading-relaxed",
                      overLimit
                        ? "border-red-400"
                        : "border-sand-300",
                    )}
                  />
                  <p
                    className={cn(
                      "mt-1 text-[11px] text-end",
                      overLimit ? "text-red-600" : "text-sand-500",
                    )}
                  >
                    {text.length}/500
                  </p>
                </div>
              );
            }
            if (def.type === "kd-amount") {
              return (
                <div key={name}>
                  <label
                    htmlFor={`edit-${name}`}
                    className="block text-xs font-medium text-sand-700 mb-1.5"
                  >
                    {def.label}
                  </label>
                  <div className="relative">
                    <span className="absolute start-3 top-1/2 -translate-y-1/2 text-xs font-mono text-sand-500 pointer-events-none">
                      KD
                    </span>
                    <input
                      id={`edit-${name}`}
                      type="number"
                      step={0.001}
                      min={0}
                      value={String(v)}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [name]: e.target.value,
                        }))
                      }
                      className="w-full ps-10 pe-3 h-10 rounded-pill border border-sand-300 bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-sand-500">
                    3-decimal precision (Kuwaiti dinar)
                  </p>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}

      <div className="mt-8 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="px-5 h-10 text-sm font-medium text-sand-800 bg-sand-100 hover:bg-sand-200 rounded-pill transition-colors duration-250 ease-sierra-out disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid() || submitting || editable.length === 0}
          className={cn(
            "px-5 h-10 text-sm font-medium text-white rounded-pill transition-colors duration-250 ease-sierra-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card",
            isValid() && !submitting && editable.length > 0
              ? "bg-primary hover:bg-primary-hover focus:ring-primary"
              : "bg-sand-300 cursor-not-allowed",
          )}
        >
          {submitting ? "Saving" : "Save & Approve"}
        </button>
      </div>
    </SlidePanel>
  );
}
