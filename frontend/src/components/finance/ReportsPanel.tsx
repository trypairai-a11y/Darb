"use client";
// The report tabs of the Money screen: ledger, shop statements and the nightly
// reconciliation checks. Every view reads an endpoint finance already exposes
// and exports to CSV through lib/csv.
//
// Lifted out of the old /finance/reports page. Two things changed on the way
// over (revision #31): the view is now owned by the Money screen, which merged
// its own two-tab strip and this one's four-tab strip into a single row; and
// the "remittances" view is gone, because it was a read-only copy of the Cash
// handed in tab sitting two clicks away from it.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import StatementDetailPanel, {
  exportStatementCsv,
} from "@/components/finance/StatementDetailPanel";
import { walletsApi, unwrapList, fetchAllPages } from "@/lib/darbApi";
import type {
  StatementTransaction,
  VendorStatementRow,
  WalletEntry,
  WalletReconciliationRun,
} from "@/types/darb";
import { downloadCsv } from "@/lib/csv";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";
import { cn } from "@/lib/cn";

export type ReportView = "ledger" | "vendor-statements" | "reconciliation";

/** First day of the current month, as YYYY-MM-DD. */
function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

interface ReportsPanelProps {
  /** Owned by the Money screen so one segment strip drives everything. */
  view: ReportView;
  /** Ledger entry type the stat cards deep-link with, e.g. PLATFORM_REVENUE. */
  initialType?: string;
}

export default function ReportsPanel({ view, initialType = "" }: ReportsPanelProps) {
  const { t, locale } = useI18n();

  const [filters, setFilters] = useState<Record<string, string>>({
    dateFrom: monthStart(),
    type: initialType,
  });
  // Revision 4 (#4) — the row a user drilled into, if any.
  const [openStatement, setOpenStatement] = useState<VendorStatementRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const dateFrom = filters.dateFrom || monthStart();
  const dateTo = filters.dateTo || "";
  const entryType = filters.type || "";

  const ledgerQuery = useQuery({
    queryKey: ["darb", "reports", "ledger", dateFrom, dateTo, entryType],
    queryFn: () =>
      fetchAllPages<WalletEntry>((p) => walletsApi.entries(p), {
        dateFrom,
        ...(dateTo ? { dateTo } : {}),
        ...(entryType ? { type: entryType } : {}),
      }),
    enabled: view === "ledger",
  });

  const statementsQuery = useQuery({
    queryKey: ["darb", "reports", "vendor-statements"],
    queryFn: () => walletsApi.vendorStatements({ limit: 100 }),
    enabled: view === "vendor-statements",
  });

  const reconciliationQuery = useQuery({
    queryKey: ["darb", "reports", "reconciliation"],
    queryFn: () => walletsApi.reconciliation({ limit: 60 }),
    enabled: view === "reconciliation",
  });

  const ledger = useMemo(() => ledgerQuery.data ?? [], [ledgerQuery.data]);
  const statements = useMemo(
    () => unwrapList<VendorStatementRow>(statementsQuery.data),
    [statementsQuery.data]
  );
  const runs = useMemo(
    () => unwrapList<WalletReconciliationRun>(reconciliationQuery.data),
    [reconciliationQuery.data]
  );

  const activeQuery =
    view === "ledger"
      ? ledgerQuery
      : view === "vendor-statements"
        ? statementsQuery
        : reconciliationQuery;

  const ledgerColumns = [
    {
      key: "createdAt",
      label: t("wallet.date"),
      render: (v: string) => <span dir="ltr">{formatDateTime(v, locale)}</span>,
    },
    {
      key: "transaction",
      label: t("reports.entryType"),
      sortable: false,
      render: (v: WalletEntry["transaction"]) => (
        <span>{v?.type ?? "n/a"}</span>
      ),
    },
    {
      key: "direction",
      label: t("reports.direction"),
      render: (v: string) => (
        <span
          className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium",
            v === "CREDIT" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
          )}
        >
          {v === "CREDIT" ? t("reports.credit") : t("reports.debit")}
        </span>
      ),
    },
    {
      key: "amountKwd",
      label: t("wallet.amount"),
      render: (v: string) => (
        <span dir="ltr" className="tabular-nums font-medium">
          {formatKwd(v, locale)}
        </span>
      ),
    },
    {
      key: "runningBalanceKwd",
      label: t("reports.runningBalance"),
      render: (v: string | null) =>
        v ? (
          <span dir="ltr" className="tabular-nums">
            {formatKwd(v, locale)}
          </span>
        ) : (
          <span className="text-sand-400">n/a</span>
        ),
    },
  ];

  const statementColumns = [
    {
      key: "vendor",
      label: t("reports.vendor"),
      sortable: false,
      render: (v: VendorStatementRow["vendor"]) => (
        <span dir="auto">{v?.name ?? "n/a"}</span>
      ),
    },
    {
      key: "periodStart",
      label: t("reports.period"),
      render: (v: string, row: VendorStatementRow) => (
        <span dir="ltr" className="tabular-nums text-sand-700">
          {v.slice(0, 10)} to {row.periodEnd.slice(0, 10)}
        </span>
      ),
    },
    {
      key: "codNetKwd",
      label: t("reports.codNet"),
      render: (v: string) => (
        <span dir="ltr" className="tabular-nums">
          {formatKwd(v, locale)}
        </span>
      ),
    },
    {
      key: "closingBalanceKwd",
      label: t("reports.closingBalance"),
      render: (v: string) => (
        <span dir="ltr" className="tabular-nums font-medium">
          {formatKwd(v, locale)}
        </span>
      ),
    },
    {
      key: "status",
      label: t("table.status"),
      render: (v: string) => <StatusBadge status={v} />,
    },
  ];

  const reconciliationColumns = [
    {
      key: "runDate",
      label: t("reports.runDate"),
      render: (v: string) => <span dir="ltr">{formatDateTime(v, locale)}</span>,
    },
    {
      key: "status",
      label: t("table.status"),
      render: (v: string) => <StatusBadge status={v} />,
    },
  ];

  function handleExport() {
    if (view === "ledger") {
      downloadCsv(
        "ledger",
        [t("wallet.date"), t("reports.entryType"), t("reports.direction"), t("wallet.amount")],
        ledger.map((e) => [e.createdAt, e.transaction?.type ?? "n/a", e.direction, e.amountKwd])
      );
      return;
    }
    if (view === "vendor-statements") {
      void exportStatementsPerShop();
      return;
    }
    downloadCsv(
      "reconciliation",
      [t("reports.runDate"), t("table.status")],
      runs.map((r) => [r.runDate, r.status])
    );
  }

  /**
   * Revision 4 (#5). The old export was one flat file with a summary row per
   * shop per period, which is not a statement anybody can send to a merchant.
   * Now each listed statement is fetched and written as its own detailed file,
   * matching the drill-in report exactly — the client's "same concept".
   *
   * Sequential on purpose: a browser fires a download per file, and twenty
   * parallel ones trip pop-up blocking.
   */
  async function exportStatementsPerShop() {
    setExporting(true);
    try {
      for (const statement of statements) {
        try {
          const detail = await walletsApi.statementTransactions(statement.id);
          exportStatementCsv(statement, detail.rows as StatementTransaction[], exportLabels);
        } catch {
          // One shop failing must not cost the caller the other nineteen.
        }
      }
    } finally {
      setExporting(false);
    }
  }

  const exportLabels = {
    date: t("wallet.date"),
    order: t("reports.orderNumber"),
    type: t("reports.entryType"),
    reference: t("reports.reference"),
    total: t("reports.orderTotal"),
    fee: t("reports.deliveryFee"),
    codNet: t("reports.codNet"),
  };

  const rowCount =
    view === "ledger" ? ledger.length : view === "vendor-statements" ? statements.length : runs.length;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          disabled={rowCount === 0 || exporting}
          className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
        >
          <Download size={12} aria-hidden="true" />
          {exporting ? t("common.processing") : t("reports.exportCsv")}
        </button>
      </div>

      {view === "ledger" && (
        <FilterBar
          filters={[
            { key: "dateFrom", label: t("reports.from"), type: "date" },
            { key: "dateTo", label: t("reports.to"), type: "date" },
            {
              key: "type",
              label: t("reports.entryType"),
              type: "select",
              options: [
                { value: "PLATFORM_REVENUE", label: t("reports.typePlatformRevenue") },
                { value: "FLEET_COST", label: t("reports.typeFleetCost") },
                { value: "DRIVER_CASH", label: t("reports.typeDriverCash") },
                { value: "VENDOR_PAYABLE", label: t("reports.typeVendorPayable") },
              ],
            },
          ]}
          values={filters}
          onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
          onClear={() => setFilters({ dateFrom: monthStart(), type: "" })}
        />
      )}

      {activeQuery.isLoading ? (
        <PageSkeleton statCards={0} tableRows={8} tableCols={5} />
      ) : activeQuery.error ? (
        <ErrorState
          error={
            activeQuery.error instanceof Error
              ? activeQuery.error.message
              : t("errors.loadingData")
          }
          onRetry={() => activeQuery.refetch()}
        />
      ) : view === "ledger" ? (
        <DataTable columns={ledgerColumns} data={ledger} emptyMessage={t("reports.noRows")} />
      ) : view === "vendor-statements" ? (
        <>
          <DataTable
            columns={statementColumns}
            data={statements}
            onRowClick={(row) => setOpenStatement(row as VendorStatementRow)}
            emptyMessage={
              <span className="inline-flex items-center gap-2">
                <FileText size={14} aria-hidden="true" />
                {t("reports.noStatements")}
              </span>
            }
          />
          <StatementDetailPanel
            statement={openStatement}
            onClose={() => setOpenStatement(null)}
          />
        </>
      ) : (
        <DataTable
          columns={reconciliationColumns}
          data={runs}
          emptyMessage={t("reports.noRuns")}
        />
      )}
    </div>
  );
}
