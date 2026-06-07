"use client";
// Phase 2 Wave 3 — Inline dismiss confirm modal (UI-SPEC §3.1.3).
// 4 preset reasons + free-text "Other" field. Submit disabled until a
// reason is selected.

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface DismissConfirmProps {
  open: boolean;
  driverName?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const PRESET_REASONS = [
  "Phone repair / known absence",
  "Driver already addressed",
  "False positive — agent over-eager",
  "Other",
];

export default function DismissConfirm({
  open,
  driverName,
  onConfirm,
  onCancel,
}: DismissConfirmProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setSelected(null);
      setOtherText("");
      setSubmitting(false);
      setTimeout(() => firstRadioRef.current?.focus(), 50);
    }
  }, [open]);

  // Esc → cancel
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const isOther = selected === "Other";
  const canSubmit =
    selected !== null && (!isOther || otherText.trim().length > 0);

  function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const reason = isOther ? `Other: ${otherText.trim()}` : (selected as string);
    onConfirm(reason);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dismiss-title"
    >
      <div
        className="absolute inset-0 bg-forest-900/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div className="relative bg-card rounded-2xl border border-sand-200 shadow-float w-full max-w-md p-6 animate-in fade-in slide-in-from-bottom-4 duration-250">
        <button
          onClick={onCancel}
          className="absolute top-4 end-4 p-1.5 rounded-pill text-sand-500 hover:text-sand-900 hover:bg-sand-100 transition-colors duration-250 ease-sierra-out"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2
          id="dismiss-title"
          className="font-display text-xl text-sand-900 leading-tight"
        >
          Why dismiss
          {driverName ? ` ${driverName}'s proposal` : " this proposal"}?
        </h2>
        <p className="mt-1.5 text-sm text-sand-700 leading-relaxed">
          Darb will remember the reason and suppress similar proposals for 7
          days.
        </p>

        <fieldset className="mt-5 space-y-2.5">
          <legend className="sr-only">Dismissal reason</legend>
          {PRESET_REASONS.map((reason, idx) => {
            const checked = selected === reason;
            return (
              <label
                key={reason}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors duration-250 ease-sierra-out",
                  checked
                    ? "border-primary bg-primary/5"
                    : "border-sand-200 hover:bg-sand-100",
                )}
              >
                <input
                  ref={idx === 0 ? firstRadioRef : undefined}
                  type="radio"
                  name="dismiss-reason"
                  value={reason}
                  checked={checked}
                  onChange={() => setSelected(reason)}
                  className="w-4 h-4 text-primary focus:ring-primary/40"
                />
                <span className="text-sm text-sand-900">{reason}</span>
              </label>
            );
          })}
        </fieldset>

        {isOther && (
          <div className="mt-3">
            <label
              htmlFor="dismiss-other-text"
              className="block text-xs font-medium text-sand-700 mb-1.5"
            >
              Tell Darb why
            </label>
            <textarea
              id="dismiss-other-text"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value.slice(0, 280))}
              rows={3}
              maxLength={280}
              className="w-full px-3 py-2 rounded-xl border border-sand-300 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              placeholder="A short note for the audit log"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-sand-500 text-end">
              {otherText.length}/280
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-5 h-10 text-sm font-medium text-sand-800 bg-sand-100 hover:bg-sand-200 rounded-pill transition-colors duration-250 ease-sierra-out disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={cn(
              "px-5 h-10 text-sm font-medium text-white rounded-pill transition-colors duration-250 ease-sierra-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card",
              canSubmit
                ? "bg-foreground hover:bg-sand-900 focus:ring-foreground"
                : "bg-sand-300 cursor-not-allowed",
            )}
          >
            {submitting ? "Dismissing" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}
