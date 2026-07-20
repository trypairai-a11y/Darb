"use client";
// Darb 2.0 — /vendor/wallet: balance StatCard + the shared WalletLedgerTable
// over GET /api/vendor/wallet/entries, plus monthly statements — a month list
// whose Download CSV buttons pull that month's entries (month + date-range
// params) and build the file client-side.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2, Wallet } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import WalletLedgerTable from "@/components/darb/WalletLedgerTable";
import { vendorApi, unwrapList, fetchAllPages } from "@/lib/darbApi";
import { downloadCsv } from "@/lib/csv";
import type { WalletEntry } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, localeTag } from "@/i18n/format";

const STATEMENT_MONTHS = 6;

interface MonthOption {
  /** "YYYY-MM" */
  key: string;
  label: string;
  dateFrom: string;
  dateTo: string;
}

function lastMonths(count: number, localeStr: string): MonthOption[] {
  const out: MonthOption[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const pad = (n: number) => String(n).padStart(2, "0");
    const lastDay = new Date(year, month + 1, 0).getDate();
    out.push({
      key: `${year}-${pad(month + 1)}`,
      label: new Intl.DateTimeFormat(localeStr, { year: "numeric", month: "long" }).format(d),
      dateFrom: `${year}-${pad(month + 1)}-01`,
      dateTo: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
    });
  }
  return out;
}

export default function VendorWalletPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);

  const walletQuery = useQuery({
    queryKey: ["darb", "vendor", "wallet"],
    queryFn: () => vendorApi.wallet(),
    refetchInterval: 60_000,
  });

  const entriesQuery = useQuery({
    queryKey: ["darb", "vendor", "wallet-entries", page, limit],
    queryFn: () => vendorApi.walletEntries({ page, limit }),
    refetchInterval: 30_000,
  });
  const entries = useMemo(() => unwrapList<WalletEntry>(entriesQuery.data), [entriesQuery.data]);
  const pagination =
    entriesQuery.data && !Array.isArray(entriesQuery.data)
      ? (entriesQuery.data as { pagination?: { page: number; limit: number; total: number; totalPages: number } })
          .pagination
      : undefined;

  const months = useMemo(() => lastMonths(STATEMENT_MONTHS, localeTag(locale)), [locale]);

  async function downloadStatement(month: MonthOption) {
    setDownloadingMonth(month.key);
    try {
      // Paged: the server clamps limit to 100, so a >100-entry month used to
      // export a statement whose running balance did not tie out.
      const rows = await fetchAllPages<WalletEntry>((p) => vendorApi.walletEntries(p), {
        month: month.key,
        dateFrom: month.dateFrom,
        dateTo: month.dateTo,
      });
      if (rows.length === 0) {
        toast.info(t("reportsPage.noData"));
        return;
      }
      downloadCsv(
        `statement-${month.key}`,
        [
          t("wallet.date"),
          t("wallet.type"),
          t("wallet.orderRef"),
          t("wallet.debit"),
          t("wallet.credit"),
          t("wallet.runningBalance"),
        ],
        rows.map((e) => [
          e.createdAt,
          e.transaction?.type ?? "",
          e.transaction?.order?.orderNumber ?? e.transaction?.orderId ?? "",
          e.direction === "DEBIT" ? String(e.amountKwd) : "",
          e.direction === "CREDIT" ? String(e.amountKwd) : "",
          String(e.runningBalanceKwd ?? ""),
        ])
      );
    } catch {
      toast.error(t("reportsPage.exportFailed"));
    } finally {
      setDownloadingMonth(null);
    }
  }

  if (walletQuery.isLoading || entriesQuery.isLoading) {
    return <PageSkeleton statCards={1} tableRows={8} tableCols={6} />;
  }
  if (entriesQuery.error) {
    return (
      <ErrorState
        error={
          entriesQuery.error instanceof Error ? entriesQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => entriesQuery.refetch()}
      />
    );
  }

  const balance = walletQuery.data?.balanceKwd ?? walletQuery.data?.account?.balanceKwd;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("darbNav.vendorWallet")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("vendorPortal.statementsHint")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t("vendorPortal.walletBalance")}
          value={balance != null ? formatKwd(balance, locale) : "—"}
          icon={Wallet}
        />
      </div>

      <WalletLedgerTable
        entries={entries}
        loading={entriesQuery.isFetching && entries.length === 0}
        pagination={
          pagination
            ? {
                page: pagination.page,
                totalPages: pagination.totalPages,
                total: pagination.total,
                limit: pagination.limit,
                onPageChange: setPage,
                onLimitChange: (n) => {
                  setLimit(n);
                  setPage(1);
                },
              }
            : undefined
        }
        exportFilename="vendor-wallet"
      />

      {/* Monthly statements */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
        <header className="px-5 py-4 border-b border-sand-200">
          <h2 className="text-sm font-medium text-sand-900">{t("vendorPortal.statements")}</h2>
          <p className="text-xs text-sand-600 mt-0.5">{t("vendorPortal.statementsHint")}</p>
        </header>
        <ul className="divide-y divide-sand-200">
          {months.map((m) => (
            <li key={m.key} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="flex items-center gap-2.5 text-sm text-sand-900">
                <FileText size={15} className="text-sand-500" aria-hidden="true" />
                {m.label}
              </span>
              <button
                type="button"
                onClick={() => void downloadStatement(m)}
                disabled={downloadingMonth === m.key}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
              >
                {downloadingMonth === m.key ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download size={12} aria-hidden="true" />
                )}
                {downloadingMonth === m.key
                  ? t("reportsPage.preparing")
                  : t("vendorPortal.downloadCsv")}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
