"use client";
import { useState, useMemo } from "react";
import { cn } from "@/lib/cn";
import { ArrowUp, ArrowDown, ArrowUpDown, Download, CheckSquare, Square, MinusSquare } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import { triggerDownload } from "@/utils/downloadBlob";

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any, index: number) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  sortKey?: string;
  headerTitle?: string;
  exportValue?: (value: any, row: any) => string | number;
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

export interface BulkAction {
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "danger";
  onClick: (selectedIds: string[]) => void;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  onRowClick?: (row: any) => void;
  emptyMessage?: React.ReactNode;
  pagination?: PaginationProps;
  exportFilename?: string;
  loading?: boolean;
  /** Enable checkbox column + bulk action bar */
  selectable?: boolean;
  /** Actions shown when rows are selected */
  bulkActions?: BulkAction[];
  /** Key used to identify rows for selection. Defaults to "id" */
  rowKey?: string;
}

type SortDir = "asc" | "desc";

export default function DataTable({
  columns,
  data,
  onRowClick,
  emptyMessage,
  pagination,
  exportFilename,
  loading = false,
  selectable = false,
  bulkActions,
  rowKey = "id",
}: DataTableProps) {
  const { t } = useI18n();
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const resolvedEmpty = emptyMessage ?? t("errors.noData");

  function handleSort(col: Column) {
    if (col.sortable === false) return;
    const key = col.sortKey || col.key;
    if (sortCol === key) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortCol(null);
        setSortDir("asc");
      }
    } else {
      setSortCol(key);
      setSortDir("asc");
    }
  }

  const sortedData = useMemo(() => {
    if (!sortCol) return data;
    return [...data].sort((a, b) => {
      let aVal = a[sortCol];
      let bVal = b[sortCol];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortCol, sortDir]);

  function handleExport() {
    const headers = columns.map((c) => c.label);
    const rows = sortedData.map((row) =>
      columns.map((col) => {
        const raw = row[col.key];
        if (col.exportValue) return col.exportValue(raw, row);
        if (raw == null) return "";
        if (typeof raw === "object") return JSON.stringify(raw);
        return raw;
      })
    );

    const csvContent = [
      headers.join(","),
      ...rows.map((r) =>
        r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    triggerDownload(
      blob,
      `${exportFilename || "export"}-${new Date().toISOString().split("T")[0]}.csv`
    );
  }

  const allPageIds = sortedData.map((r) => r[rowKey]).filter(Boolean) as string[];
  const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));
  const someSelected = allPageIds.some((id) => selectedIds.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allPageIds));
    }
  }

  function toggleRow(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
      {/* Bulk action bar */}
      {selectable && selectedIds.size > 0 && bulkActions && bulkActions.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-primary/5 border-b border-primary/10">
          <span className="text-sm font-medium text-primary">{selectedIds.size} {t("common.selected")}</span>
          <div className="flex items-center gap-2 ms-auto">
            {bulkActions.map((action, i) => (
              <button
                key={i}
                onClick={() => { action.onClick(Array.from(selectedIds)); setSelectedIds(new Set()); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                  action.variant === "danger"
                    ? "bg-red-50 text-red-600 hover:bg-red-100"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-secondary hover:text-foreground ms-2"
            >
              {t("common.clear")}
            </button>
          </div>
        </div>
      )}

      {/* Export button */}
      {exportFilename && (
        <div className="flex justify-end px-5 pt-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sand-800 bg-sand-100 hover:bg-sand-200 rounded-pill transition-colors duration-250 ease-sierra-out"
            aria-label={t("table.exportAria")}
          >
            <Download size={12} aria-hidden="true" />
            {t("table.exportCsv")}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full" role="table">
          <thead role="rowgroup">
            <tr className="border-b border-sand-200" role="row">
              {selectable && (
                <th className="w-10 px-3 py-3" role="columnheader">
                  <button onClick={toggleAll} className="text-secondary hover:text-primary transition-colors" aria-label={allSelected ? t("table.deselectAllRows") : t("table.selectAllRows")}>
                    {allSelected ? <CheckSquare size={16} /> : someSelected ? <MinusSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
              )}
              {columns.map((col) => {
                const isSortable = col.sortable !== false;
                const key = col.sortKey || col.key;
                const isActive = sortCol === key;
                return (
                  <th
                    key={col.key}
                    role="columnheader"
                    onClick={() => isSortable && handleSort(col)}
                    title={col.headerTitle}
                    className={cn(
                      "text-start text-xs font-medium text-secondary px-5 py-3 select-none",
                      isSortable && "cursor-pointer hover:text-primary transition-colors",
                      col.headerTitle && "cursor-help",
                      col.className
                    )}
                    aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {isSortable && (
                        isActive ? (
                          sortDir === "asc" ? (
                            <ArrowUp size={12} className="text-primary" aria-hidden="true" />
                          ) : (
                            <ArrowDown size={12} className="text-primary" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100" aria-hidden="true" />
                        )
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm text-secondary">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    {t("table.loadingRow")}
                  </div>
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-5 py-12 text-center text-sm text-secondary">
                  {resolvedEmpty}
                </td>
              </tr>
            ) : (
              sortedData.map((row, i) => {
                const id = row[rowKey] as string;
                const isSelected = selectable && selectedIds.has(id);
                return (
                <tr
                  key={id || i}
                  role="row"
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "border-b border-sand-200 last:border-0 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-sand-100/60",
                    isSelected && "bg-primary/5"
                  )}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                  aria-label={onRowClick ? `View details for row ${i + 1}` : undefined}
                >
                  {selectable && (
                    <td className="w-10 px-3 py-3" role="cell">
                      <button onClick={(e) => toggleRow(id, e)} className="text-secondary hover:text-primary transition-colors" aria-label={isSelected ? t("table.deselectRow") : t("table.selectRow")}>
                        {isSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                      </button>
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} role="cell" className={cn("px-5 py-3 text-sm whitespace-nowrap", col.className)}>
                      {col.render ? col.render(row[col.key], row, i) : row[col.key] ?? "-"}
                    </td>
                  ))}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-sand-200" role="navigation" aria-label={t("table.previousPage") + " / " + t("table.nextPage")}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-secondary">
              {((pagination.page - 1) * pagination.limit) + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} {t("common.of")} {pagination.total}
            </span>
            {pagination.onLimitChange && (
              <select
                value={pagination.limit}
                onChange={(e) => pagination.onLimitChange!(Number(e.target.value))}
                className="text-xs border border-sand-300 rounded-pill px-3 py-1 bg-card"
                aria-label={t("table.rowsPerPage")}
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n} {t("common.perPage")}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg text-secondary hover:bg-sand-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label={t("table.previousPage")}
            >
              <DirectionalIcon kind="chevron-back" size={14} aria-hidden="true" />
            </button>
            <span className="text-xs text-secondary px-2">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded-lg text-secondary hover:bg-sand-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label={t("table.nextPage")}
            >
              <DirectionalIcon kind="chevron-forward" size={14} aria-hidden="true" />
            </button>
            {/* F14 — page-jump */}
            {pagination.totalPages > 10 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.currentTarget.elements.namedItem("jump") as HTMLInputElement);
                  const n = Math.max(1, Math.min(pagination.totalPages, parseInt(input.value || "1", 10)));
                  pagination.onPageChange(n);
                }}
                className="flex items-center gap-1 ms-2"
              >
                <span className="text-xs text-secondary">{t("common.goToPage")}</span>
                <input
                  name="jump"
                  type="number"
                  min={1}
                  max={pagination.totalPages}
                  defaultValue={pagination.page}
                  className="w-14 text-xs border border-sand-300 rounded-pill px-2.5 py-1 bg-card"
                  aria-label={t("common.goToPage")}
                />
                <button type="submit" className="text-xs font-medium text-primary hover:underline">{t("common.jump")}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
