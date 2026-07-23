"use client";
// Darb 2.0 — the "irregular task" quick-filter tags from the Keeta reference
// (client revision #2). Each tag carries a live count and toggles independently.
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { QUICK_FILTERS, type QuickFilter } from "./opsFilters";

interface OpsFilterChipsProps {
  counts: Record<QuickFilter, number>;
  active: QuickFilter[];
  onToggle: (filter: QuickFilter) => void;
}

/** Tags that mean "this needs attention" get a warmer resting state. */
const URGENT: QuickFilter[] = ["late", "almostLate", "courierIssue"];

export default function OpsFilterChips({ counts, active, onToggle }: OpsFilterChipsProps) {
  const { t } = useI18n();

  const labels: Record<QuickFilter, string> = {
    largeOrder: t("opsMap.filterLargeOrder"),
    almostLate: t("opsMap.filterAlmostLate"),
    late: t("opsMap.filterLate"),
    unusualStop: t("opsMap.filterUnusualStop"),
    courierIssue: t("opsMap.filterCourierIssue"),
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {QUICK_FILTERS.map((filter) => {
        const isActive = active.includes(filter);
        const count = counts[filter] ?? 0;
        const urgent = URGENT.includes(filter) && count > 0;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(filter)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-pill border text-[11px] font-medium transition-colors",
              isActive
                ? "border-primary bg-primary/10 text-primary"
                : urgent
                  ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300"
                  : "border-sand-200 bg-white text-sand-700 hover:border-sand-300"
            )}
          >
            <span>{labels[filter]}</span>
            <span className="tabular-nums opacity-70">({count})</span>
          </button>
        );
      })}
    </div>
  );
}
