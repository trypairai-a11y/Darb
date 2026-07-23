"use client";
// Darb 2.0 — Today / This week / This month presets plus a custom range
// (client revision #26). Emits YYYY-MM-DD strings, which is what the cockpit
// API takes; the caller decides which tiles the period applies to.
import { CalendarDays } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

export type PeriodPreset = "today" | "week" | "month" | "custom";

export interface Period {
  preset: PeriodPreset;
  from: string;
  to: string;
}

function iso(date: Date): string {
  // Local calendar date, not UTC: toISOString() would roll a Kuwait evening
  // back to the previous day.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Resolve a preset into a concrete inclusive range ending today. */
export function presetRange(preset: Exclude<PeriodPreset, "custom">): Period {
  const today = new Date();
  const to = iso(today);
  if (preset === "today") return { preset, from: to, to };
  if (preset === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6); // rolling 7 days, today included
    return { preset, from: iso(start), to };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { preset, from: iso(start), to };
}

export const DEFAULT_PERIOD: Period = presetRange("today");

interface PeriodPickerProps {
  value: Period;
  onChange: (period: Period) => void;
}

export default function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  const { t } = useI18n();

  const presets: Array<{ key: Exclude<PeriodPreset, "custom">; label: string }> = [
    { key: "today", label: t("period.today") },
    { key: "week", label: t("period.thisWeek") },
    { key: "month", label: t("period.thisMonth") },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1 bg-sand-100 rounded-pill p-1">
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onChange(presetRange(preset.key))}
            className={cn(
              "px-3 h-8 text-xs font-medium rounded-pill transition-colors",
              value.preset === preset.key
                ? "bg-white text-sand-900 shadow-soft"
                : "text-sand-600 hover:text-sand-900"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-pill border border-sand-300 bg-white">
        <CalendarDays size={13} className="text-sand-500" aria-hidden="true" />
        <input
          type="date"
          value={value.from}
          max={value.to}
          aria-label={t("period.from")}
          onChange={(e) =>
            onChange({ preset: "custom", from: e.target.value, to: value.to })
          }
          className="bg-transparent text-xs text-sand-800 focus:outline-none"
        />
        <span className="text-xs text-sand-400">-</span>
        <input
          type="date"
          value={value.to}
          min={value.from}
          aria-label={t("period.to")}
          onChange={(e) =>
            onChange({ preset: "custom", from: value.from, to: e.target.value })
          }
          className="bg-transparent text-xs text-sand-800 focus:outline-none"
        />
      </div>
    </div>
  );
}
