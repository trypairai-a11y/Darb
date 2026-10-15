"use client";

// Phase 3 Wave 4 — AskDarbWhyDrawer.
// Renders the bulk-endpoint pre-warmed score explanation by default.
// Refresh button hits GET /api/drivers/:id/score-explanation?refresh=1.
// Per UI-SPEC §3.3.4.

import { useState } from "react";
import { Sparkles, RefreshCw, X } from "lucide-react";
import { useApiQuery } from "@/hooks/useApi";
import { useI18n } from "@/i18n/I18nProvider";
import type { DriverFileScoreExplanation } from "@/types/driver-file";

export interface AskDarbWhyDrawerProps {
  driverId: string;
  /** Pre-warmed explanation text from the bulk /file response. */
  preWarmed: DriverFileScoreExplanation;
}

export default function AskDarbWhyDrawer({ driverId, preWarmed }: AskDarbWhyDrawerProps) {
  const { t } = useI18n();
  const d = (key: string) => t(`driverFile.${key}`);
  const [open, setOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // Only fetch when the user clicks Refresh — first open uses the pre-warmed text.
  const wantFresh = open && refreshTick > 0;
  const { data: live, isLoading: isFetching, error } = useApiQuery<DriverFileScoreExplanation>(
    ["driver-score-explanation", driverId, String(refreshTick)],
    wantFresh ? `/api/drivers/${driverId}/score-explanation?refresh=1` : null,
    {
      staleTime: 60 * 60 * 1000,
    },
  );

  const explanation: DriverFileScoreExplanation = live ?? preWarmed;
  const unavailable = explanation?.text === "Score explanation unavailable.";

  return (
    <div>
      <button
        type="button"
        data-testid="ask-darb-why-trigger"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus:ring-2 focus:ring-primary/40 rounded-md px-1"
        aria-expanded={open}
      >
        <Sparkles size={12} aria-hidden="true" />
        {d("askWhy")}
      </button>
      {open && (
        <div
          data-testid="ask-darb-why-drawer"
          role="region"
          aria-label={d("darbRead")}
          className="bg-primary/5 border border-primary/15 rounded-xl p-4 mt-3 relative"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-widest text-primary font-medium">
              {d("darbRead")}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sand-700 hover:text-foreground"
              aria-label={d("closeDrawer")}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          {isFetching ? (
            <div className="text-sm text-primary animate-pulse">{d("thinking")}</div>
          ) : error ? (
            <div className="text-sm text-red-700">
              {d("explainError")}
            </div>
          ) : unavailable ? (
            <div className="text-sm text-sand-700 italic">
              {d("explainUnavailable")}
            </div>
          ) : (
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-line">
              {explanation?.text ?? ""}
            </div>
          )}
          <div className="text-[10px] font-mono text-sand-700 mt-3 flex items-center justify-between">
            <span>{explanation?.cached ? d("cached") : d("fresh")}</span>
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              disabled={isFetching}
              className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={d("refreshAria")}
            >
              <RefreshCw size={10} aria-hidden="true" />
              {d("refresh")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
