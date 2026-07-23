"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check, X } from "lucide-react";
import DateRangePicker from "./DateRangePicker";
import { useI18n } from "@/i18n/I18nProvider";

interface FilterOption {
  value: string;
  label: string;
  /**
   * Secondary identifier shown alongside the label and matched by the
   * driver-search filter. Finance searches drivers by their Darb driver ID
   * ("DRB-0001"), not by name (revision #14).
   */
  code?: string | null;
}

interface Filter {
  key: string;
  label: string;
  type: "select" | "date" | "search" | "multi-select" | "time" | "dateRange" | "driver-search";
  options?: FilterOption[];
  placeholder?: string;
  /** For dateRange type: key used for the end date value */
  toKey?: string;
}

interface FilterBarProps {
  filters: Filter[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear?: () => void;
  defaultValues?: Record<string, string>;
}

function MultiSelectFilter({
  filter,
  value,
  onChange,
}: {
  filter: Filter;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = value ? value.split(",") : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(val: string) {
    const next = selected.includes(val)
      ? selected.filter((s) => s !== val)
      : [...selected, val];
    onChange(next.join(","));
  }

  const label =
    selected.length === 0
      ? filter.label
      : selected.length === 1
      ? filter.options?.find((o) => o.value === selected[0])?.label || selected[0]
      : `${selected.length} ${t("common.selected")}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${t("common.filterBy")} ${filter.label}: ${label}`}
        className="flex items-center gap-1 ps-3 pe-8 py-2 rounded-pill border border-sand-300 bg-white text-sm text-primary hover:border-sand-400 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer whitespace-nowrap"
      >
        {label}
      </button>
      <ChevronDown size={14} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-sand-500 pointer-events-none" aria-hidden="true" />
      {open && (
        <div role="listbox" aria-label={filter.label} aria-multiselectable="true" className="absolute top-full start-0 mt-1 bg-white border border-sand-300 rounded-xl shadow-lg z-50 min-w-[180px] py-1 max-h-60 overflow-y-auto">
          {filter.options?.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(opt.value)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-start hover:bg-sand-100 transition-colors"
              >
                <span
                  aria-hidden="true"
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    isSelected ? "bg-primary border-primary text-white" : "border-sand-400"
                  }`}
                >
                  {isSelected && <Check size={10} />}
                </span>
                {opt.label}
              </button>
            );
          })}
          {selected.length > 0 && (
            <>
              <div className="border-t border-sand-200 my-1" />
              <button
                type="button"
                onClick={() => onChange("")}
                className="w-full px-3 py-2 text-sm text-start text-secondary hover:bg-sand-100 transition-colors"
              >
                {t("common.clearAll")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DriverSearchFilter({
  filter,
  value,
  onChange,
}: {
  filter: Filter;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Code matches rank above name matches so typing a driver ID lands on the
  // exact driver first even when the digits also appear inside a name.
  const suggestions = (() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];
    const options = filter.options || [];
    const byCode = options.filter((o) => (o.code ?? "").toLowerCase().includes(q));
    const byName = options.filter(
      (o) => !byCode.includes(o) && o.label.toLowerCase().includes(q)
    );
    return [...byCode, ...byName].slice(0, 10);
  })();

  function select(opt: FilterOption) {
    setQuery(opt.code ? `${opt.code} ${opt.label}` : opt.label);
    onChange(opt.value);
    setOpen(false);
  }

  function clear() {
    setQuery("");
    onChange("");
  }

  return (
    <div ref={ref} className="relative">
      <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-sand-500 pointer-events-none" />
      <input
        type="text"
        dir="auto"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }}
        onFocus={() => setOpen(true)}
        placeholder={filter.placeholder || t("common.searchDriverPlaceholder")}
        aria-label={`${t("common.searchBy")} ${filter.label}`}
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        className="ps-9 pe-7 py-2 rounded-pill border border-sand-300 bg-white text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[180px] placeholder:text-sand-500"
      />
      {query && (
        <button type="button" onClick={clear} aria-label={t("common.clearSearch")} className="absolute end-2 top-1/2 -translate-y-1/2 text-sand-500 hover:text-sand-800">
          <X size={13} aria-hidden="true" />
        </button>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute top-full start-0 mt-1 bg-white border border-sand-300 rounded-xl shadow-lg z-50 min-w-[220px] py-1 max-h-60 overflow-y-auto">
          {suggestions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => select(opt)}
              className="w-full px-3 py-2 text-sm text-start hover:bg-sand-100 transition-colors flex items-center gap-2"
            >
              {opt.code && (
                <span dir="ltr" className="font-mono text-xs text-sand-600 shrink-0">
                  {opt.code}
                </span>
              )}
              <span className="truncate" dir="auto">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterBar({ filters, values, onChange, onClear, defaultValues }: FilterBarProps) {
  const { t } = useI18n();
  const hasActiveFilters = onClear && Object.keys(values).some((k) => {
    const defaultVal = defaultValues?.[k] || "";
    return values[k] && values[k] !== defaultVal;
  });

  return (
    <div className="flex gap-3 flex-wrap items-center" role="search" aria-label={t("common.filterControls")}>
      {filters.map((filter) => {
        if (filter.type === "search") {
          return (
            <div key={filter.key} className="relative">
              <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-sand-500 pointer-events-none" />
              <input
                type="text"
                dir="auto"
                value={values[filter.key] || ""}
                onChange={(e) => onChange(filter.key, e.target.value)}
                placeholder={filter.placeholder || t("common.searchPlaceholder")}
                aria-label={`${t("common.searchBy")} ${filter.label}`}
                className="ps-9 pe-3 py-2 rounded-pill border border-sand-300 bg-white text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[220px] placeholder:text-sand-500"
              />
            </div>
          );
        }
        if (filter.type === "dateRange") {
          const toKey = filter.toKey || "dateTo";
          return (
            <DateRangePicker
              key={filter.key}
              dateFrom={values[filter.key] || ""}
              dateTo={values[toKey] || ""}
              onChange={(from, to) => {
                onChange(filter.key, from);
                onChange(toKey, to);
              }}
            />
          );
        }
        if (filter.type === "date") {
          return (
            <input
              key={filter.key}
              type="date"
              value={values[filter.key] || ""}
              onChange={(e) => onChange(filter.key, e.target.value)}
              aria-label={`${t("common.filterBy")} ${filter.label}`}
              className="px-3 py-2 rounded-pill border border-sand-300 bg-white text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          );
        }
        if (filter.type === "time") {
          return (
            <input
              key={filter.key}
              type="time"
              placeholder={filter.label || "HH:MM"}
              value={values[filter.key] || ""}
              onChange={(e) => onChange(filter.key, e.target.value)}
              aria-label={`${t("common.filterBy")} ${filter.label}`}
              className="px-3 py-2 rounded-pill border border-sand-300 bg-white text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 w-[120px] placeholder:text-sand-500 font-mono"
            />
          );
        }
        if (filter.type === "multi-select") {
          return (
            <MultiSelectFilter
              key={filter.key}
              filter={filter}
              value={values[filter.key] || ""}
              onChange={(v) => onChange(filter.key, v)}
            />
          );
        }
        if (filter.type === "driver-search") {
          return (
            <DriverSearchFilter
              key={filter.key}
              filter={filter}
              value={values[filter.key] || ""}
              onChange={(v) => onChange(filter.key, v)}
            />
          );
        }
        return (
          <div key={filter.key} className="relative">
            <select
              value={values[filter.key] || ""}
              onChange={(e) => onChange(filter.key, e.target.value)}
              aria-label={`${t("common.filterBy")} ${filter.label}`}
              className="appearance-none ps-3 pe-8 py-2 rounded-pill border border-sand-300 bg-white text-sm text-primary hover:border-sand-400 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="">{filter.label}</option>
              {filter.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-sand-500 pointer-events-none" aria-hidden="true" />
          </div>
        );
      })}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          aria-label={t("actions.clearFilters")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
        >
          <X size={14} aria-hidden="true" />
          {t("actions.clearFilters")}
        </button>
      )}
    </div>
  );
}
