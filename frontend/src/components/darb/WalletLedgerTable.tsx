// Darb 2.0 — wallet ledger presented through the shared DataTable:
// date · transaction-type chip · order ref · debit · credit · running balance.
"use client";
import DataTable from "@/components/shared/DataTable";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";
import type { WalletEntry, WalletTxType } from "@/types/darb";

const TX_STYLES: Record<WalletTxType, string> = {
  COD_SETTLEMENT: "bg-green-50 text-green-700",
  PREPAID_SETTLEMENT: "bg-blue-50 text-blue-600",
  REMITTANCE: "bg-purple-50 text-purple-600",
  ADJUSTMENT: "bg-amber-50 text-amber-700",
  VENDOR_PAYOUT: "bg-indigo-50 text-indigo-600",
};

const TX_I18N: Record<WalletTxType, string> = {
  COD_SETTLEMENT: "wallet.txCodSettlement",
  PREPAID_SETTLEMENT: "wallet.txPrepaidSettlement",
  REMITTANCE: "wallet.txRemittance",
  ADJUSTMENT: "wallet.txAdjustment",
  VENDOR_PAYOUT: "wallet.txVendorPayout",
};

interface WalletLedgerTableProps {
  entries: WalletEntry[];
  loading?: boolean;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    limit: number;
    onPageChange: (page: number) => void;
    onLimitChange?: (limit: number) => void;
  };
  exportFilename?: string;
}

export default function WalletLedgerTable({
  entries,
  loading,
  pagination,
  exportFilename,
}: WalletLedgerTableProps) {
  const { t, locale } = useI18n();

  const columns = [
    {
      key: "createdAt",
      label: t("wallet.date"),
      render: (v: string) => (
        <span className="text-sand-800 whitespace-nowrap">{formatDateTime(v, locale)}</span>
      ),
    },
    {
      key: "transaction",
      label: t("wallet.type"),
      sortable: false,
      render: (_: unknown, row: WalletEntry) => {
        const type = row.transaction?.type;
        if (!type) return <span className="text-sand-500">—</span>;
        return (
          <span
            className={cn(
              "inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium",
              TX_STYLES[type] ?? "bg-sand-200 text-sand-800"
            )}
          >
            {TX_I18N[type] ? t(TX_I18N[type]) : type}
          </span>
        );
      },
      exportValue: (_: unknown, row: WalletEntry) => row.transaction?.type ?? "",
    },
    {
      key: "orderRef",
      label: t("wallet.orderRef"),
      sortable: false,
      render: (_: unknown, row: WalletEntry) => (
        <span dir="ltr" className="font-mono text-xs text-sand-700">
          {row.transaction?.order?.orderNumber ?? row.transaction?.orderId ?? "—"}
        </span>
      ),
      exportValue: (_: unknown, row: WalletEntry) =>
        row.transaction?.order?.orderNumber ?? row.transaction?.orderId ?? "",
    },
    {
      key: "debit",
      label: t("wallet.debit"),
      sortable: false,
      render: (_: unknown, row: WalletEntry) =>
        row.direction === "DEBIT" ? (
          <span dir="ltr" className="tabular-nums font-medium text-sand-900">
            {formatKwd(row.amountKwd, locale)}
          </span>
        ) : (
          <span className="text-sand-400">—</span>
        ),
      exportValue: (_: unknown, row: WalletEntry) =>
        row.direction === "DEBIT" ? String(row.amountKwd) : "",
    },
    {
      key: "credit",
      label: t("wallet.credit"),
      sortable: false,
      render: (_: unknown, row: WalletEntry) =>
        row.direction === "CREDIT" ? (
          <span dir="ltr" className="tabular-nums font-medium text-sand-900">
            {formatKwd(row.amountKwd, locale)}
          </span>
        ) : (
          <span className="text-sand-400">—</span>
        ),
      exportValue: (_: unknown, row: WalletEntry) =>
        row.direction === "CREDIT" ? String(row.amountKwd) : "",
    },
    {
      key: "runningBalanceKwd",
      label: t("wallet.runningBalance"),
      render: (v: WalletEntry["runningBalanceKwd"]) => (
        <span dir="ltr" className="tabular-nums text-sand-800">
          {formatKwd(v, locale)}
        </span>
      ),
      exportValue: (v: WalletEntry["runningBalanceKwd"]) => String(v ?? ""),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={entries}
      loading={loading}
      pagination={pagination}
      exportFilename={exportFilename}
      emptyMessage={t("wallet.noEntries")}
    />
  );
}
