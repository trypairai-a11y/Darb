"use client";
// Phase 2 Wave 3 — Audit log page (UI-SPEC §3.2). Reuses the existing
// shared FilterBar + DataTable; row click opens AuditEntryDetail in a
// SlidePanel.

import { useCallback, useEffect, useState } from "react";
import {
  listAuditActions,
  getAuditAction,
  rollbackAuditAction,
  type ListAuditParams,
} from "@/lib/decisionsApi";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import ErrorState from "@/components/shared/ErrorState";
import AuditEntryDetail from "@/components/decisions/AuditEntryDetail";
import { useToast } from "@/components/shared/Toast";
import { useRole } from "@/hooks/useRole";
import type {
  AgentActionDetail,
  AgentActionRow,
} from "@/types/decisions";

const PAGE_LIMIT = 25;

const TOOL_OPTIONS = [
  { value: "draftCourierMessage", label: "Draft courier message" },
  { value: "flagForReview", label: "Flag for review" },
  { value: "proposeCashReminder", label: "Propose cash reminder" },
  { value: "applyPenalty", label: "Apply penalty" },
  { value: "suspendDriver", label: "Suspend driver" },
];

const OUTCOME_OPTIONS = [
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
  { value: "rolled_back", label: "Rolled back" },
];

const SUBJECT_OPTIONS = [
  { value: "Driver", label: "Driver" },
  { value: "Shift", label: "Shift" },
  { value: "CashRecord", label: "Cash record" },
  { value: "Order", label: "Order" },
  { value: "Violation", label: "Violation" },
];

export default function DecisionsAuditPage() {
  const toastApi = useToast();
  const { isOpsManager } = useRole();
  const [rows, setRows] = useState<AgentActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [detailEntry, setDetailEntry] = useState<AgentActionDetail | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: ListAuditParams = {
        page,
        limit: PAGE_LIMIT,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        toolName: filters.toolName || undefined,
        outcome: (filters.outcome as ListAuditParams["outcome"]) || undefined,
        subjectType: filters.subjectType || undefined,
      };
      const data = await listAuditActions(params);
      setRows(data.rows);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Couldn't load audit log.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  function handleFilterChange(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  async function handleRowClick(row: AgentActionRow) {
    try {
      const detail = await getAuditAction(row.id);
      setDetailEntry(detail);
      setDetailOpen(true);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Couldn't load entry.";
      toastApi.error(msg);
    }
  }

  async function handleRollback(reason: string) {
    if (!detailEntry) return;
    try {
      await rollbackAuditAction(detailEntry.id, reason);
      toastApi.success("Rollback recorded");
      setDetailOpen(false);
      setDetailEntry(null);
      fetchRows();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Couldn't rollback.";
      toastApi.error(msg);
    }
  }

  const columns = [
    {
      key: "createdAt",
      label: "Time",
      render: (v: string) => (
        <span className="text-xs font-mono text-sand-700">
          {new Date(v).toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    { key: "toolName", label: "Tool" },
    {
      key: "subjectId",
      label: "Subject",
      render: (_v: string, row: AgentActionRow) => (
        <span className="text-xs text-sand-700">
          {row.subjectType}
          {row.subjectId ? ` · ${row.subjectId.slice(0, 8)}` : ""}
        </span>
      ),
    },
    {
      key: "approverId",
      label: "Approver",
      render: (v: string | null) => (
        <span className="text-xs text-sand-700">{v ? v.slice(0, 8) : "—"}</span>
      ),
    },
    {
      key: "outcome",
      label: "Outcome",
      render: (v: AgentActionRow["outcome"]) => {
        const styles: Record<typeof v, string> = {
          success: "text-primary bg-primary/10",
          failure: "text-red-700 bg-red-50",
          rolled_back: "text-sand-800 bg-sand-100",
        } as const;
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${styles[v]}`}
          >
            {v.replace("_", " ")}
          </span>
        );
      },
    },
  ];

  return (
    <div className="w-full max-w-none px-2 sm:px-6 py-6">
      <h1 className="font-display text-display-sm text-sand-900">
        Audit · What Darb did
      </h1>
      <p className="text-sm text-sand-600 mt-1">
        Every action proposed, approved, dismissed, or rolled back.
      </p>

      <div className="mt-5">
        <FilterBar
          filters={[
            { key: "dateFrom", label: "From", type: "date" },
            { key: "dateTo", label: "To", type: "date" },
            {
              key: "toolName",
              label: "Tool",
              type: "select",
              options: TOOL_OPTIONS,
            },
            {
              key: "outcome",
              label: "Outcome",
              type: "select",
              options: OUTCOME_OPTIONS,
            },
            {
              key: "subjectType",
              label: "Subject",
              type: "select",
              options: SUBJECT_OPTIONS,
            },
          ]}
          values={filters}
          onChange={handleFilterChange}
          onClear={() => setFilters({})}
        />
      </div>

      <div className="mt-4">
        {error ? (
          <ErrorState error={error} onRetry={fetchRows} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            loading={loading}
            onRowClick={handleRowClick}
            emptyMessage="No audit rows match these filters. Try widening the date range or tool filter."
            pagination={{
              page,
              totalPages,
              total,
              limit: PAGE_LIMIT,
              onPageChange: setPage,
            }}
          />
        )}
      </div>

      <AuditEntryDetail
        entry={detailEntry}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailEntry(null);
        }}
        canRollback={isOpsManager}
        onRollback={handleRollback}
      />
    </div>
  );
}
