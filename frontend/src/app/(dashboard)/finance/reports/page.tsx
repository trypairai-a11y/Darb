"use client";
// Darb 2.0 — /finance/reports: financial reports and exports.
//
// The finance overview has always linked a "Reports" card, but the target
// route did not exist and rendered a 404 (client revision #12). This is that
// page. It adds no new backend surface: every view reads an endpoint finance
// already exposes, and every view exports to CSV through lib/csv.
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { walletsApi, unwrapList, fetchAllPages } from "@/lib/darbApi";
import type {
  Remittance,
  VendorStatementRow,
  WalletEntry,
  WalletReconciliationRun,
} from "@/types/darb";
import { downloadCsv } from "@/lib/csv";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";
import { cn } from "@/lib/cn";

type View = "ledger" | "vendor-statements" | "remittances" | "reconciliation";

const VIEWS: View[] = ["ledger", "vendor-statements", "remittances", "reconciliation"];

function isView(value: string | null): value is View {
  return VIEWS.includes(value as View);
}

/** First day of the current month, as YYYY-MM-DD. */
function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function FinanceReportsPage() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();

  // The finance overview stat cards deep-link straight into a view, optionally
  // pre-filtered by ledger entry type.
  const initialView = searchParams.get("view");
  const initialType = searchParams.get("type") ?? "";
  const [view, setView] = useState<View>(isView(initialView) ? initialView : "ledger");
  const [filters, setFilters] = useState<Record<string, string>>({
    dateFrom: monthStart(),
    type: initialType,
  });

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

  const remittancesQuery = useQuery({
    queryKey: ["darb", "reports", "remittances"],
    queryFn: () => walletsApi.remittances({ limit: 100 }),
    enabled: view === "remittances",
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
  const remittances = useMemo(
    () => unwrapList<Remittance>(remittancesQuery.data),
    [remittancesQuery.data]
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
        : view === "remittances"
          ? remittancesQuery
          : reconciliationQuery;

  const viewLabels: Record<View, string> = {
    ledger: t("reports.viewLedger"),
    "vendor-statements": t("reports.viewVendorStatements"),
    remittances: t("reports.viewRemittances"),
    reconciliation: t("reports.viewReconciliation"),
  };

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

  const remittanceColumns = [
    {
      key: "createdAt",
      label: t("wallet.date"),
      render: (v: string) => <span dir="ltr">{formatDateTime(v, locale)}</span>,
    },
    {
      key: "driver",
      label: t("wallet.driver"),
      sortable: false,
      render: (v: Remittance["driver"], row: Remittance) => (
        <span dir="auto">
          {v?.driverCode && (
            <span dir="ltr" className="font-mono text-xs text-sand-600 me-2">
              {v.driverCode}
            </span>
          )}
          {v?.name ?? row.driverId}
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
    { key: "method", label: t("wallet.method") },
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
      downloadCsv(
        "vendor-statements",
        [
          t("reports.vendor"),
          t("reports.period"),
          t("reports.codNet"),
          t("reports.closingBalance"),
          t("table.status"),
        ],
        statements.map((s) => [
          s.vendor?.name ?? "n/a",
          `${s.periodStart.slice(0, 10)} to ${s.periodEnd.slice(0, 10)}`,
          s.codNetKwd,
          s.closingBalanceKwd,
          s.status,
        ])
      );
      return;
    }
    if (view === "remittances") {
      downloadCsv(
        "remittances",
        [t("wallet.date"), t("wallet.driver"), t("wallet.amount"), t("wallet.method")],
        remittances.map((r) => [
          r.createdAt,
          r.driver?.name ?? r.driverId,
          r.amountKwd,
          r.method,
        ])
      );
      return;
    }
    downloadCsv(
      "reconciliation",
      [t("reports.runDate"), t("table.status")],
      runs.map((r) => [r.runDate, r.status])
    );
  }

  const rowCount =
    view === "ledger"
      ? ledger.length
      : view === "vendor-statements"
        ? statements.length
        : view === "remittances"
          ? remittances.length
          : runs.length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">{t("reports.title")}</h1>
          <p className="text-sm text-sand-600 mt-1">{t("reports.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={rowCount === 0}
          className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
        >
          <Download size={12} aria-hidden="true" />
          {t("reports.exportCsv")}
        </button>
      </div>

      {/* View picker */}
      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit flex-wrap">
        {VIEWS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={cn(
              "px-4 h-9 text-sm font-medium rounded-pill transition-colors",
              view === key
                ? "bg-white text-sand-900 shadow-soft"
                : "text-sand-600 hover:text-sand-900"
            )}
          >
            {viewLabels[key]}
          </button>
        ))}
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
        <DataTable
          columns={statementColumns}
          data={statements}
          emptyMessage={
            <span className="inline-flex items-center gap-2">
              <FileText size={14} aria-hidden="true" />
              {t("reports.noStatements")}
            </span>
          }
        />
      ) : view === "remittances" ? (
        <DataTable
          columns={remittanceColumns}
          data={remittances}
          emptyMessage={t("reports.noRows")}
        />
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
