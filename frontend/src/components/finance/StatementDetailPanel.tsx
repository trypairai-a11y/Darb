"use client";
// Darb 2.0 — the detailed report behind one shop's statement (revision 4 #4).
//
// The statement list answers "what do we owe this shop". Finance kept asking
// the next question, "why", and the only way to answer it was to filter the
// ledger by hand and reconstruct the month. So a row now opens this: every
// order delivered in the period, plus the refunds and the payout, footing to
// the same closing balance the summary row shows.
//
// A DELIVERY row expands to the double-entry postings behind it, because the
// person who needs the order view and the person who needs the postings are
// often the same person ten seconds apart.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import SlidePanel from "@/components/shared/SlidePanel";
import ErrorState from "@/components/shared/ErrorState";
import { walletsApi } from "@/lib/darbApi";
import type { StatementTransaction, VendorStatementRow } from "@/types/darb";
import { downloadCsv } from "@/lib/csv";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd } from "@/i18n/format";
import { cn } from "@/lib/cn";

interface StatementDetailPanelProps {
  /** The row that was clicked. Null closes the panel. */
  statement: VendorStatementRow | null;
  onClose: () => void;
}

/** Slug for the export filename: shop code beats a uuid in a downloads folder. */
function fileSlug(statement: VendorStatementRow): string {
  const code = statement.vendor?.code ?? statement.vendor?.name ?? "shop";
  return `statement-${code}-${statement.periodStart.slice(0, 7)}`.replace(/[^A-Za-z0-9-]/g, "-");
}

/** Column sums for the drill-in. Nulls (a payout has no order total) count as 0. */
function sumRows(rows: StatementTransaction[]) {
  const add = (acc: number, v: string | null | undefined) => acc + Number(v ?? 0);
  return {
    orderTotal: rows.reduce((acc, r) => add(acc, r.orderTotalKwd), 0).toFixed(3),
    deliveryFee: rows.reduce((acc, r) => add(acc, r.deliveryFeeKwd), 0).toFixed(3),
    codNet: rows.reduce((acc, r) => add(acc, r.codNetKwd), 0).toFixed(3),
  };
}

/**
 * Revision 4 (#5) — one shop's detailed statement as CSV. Exported here rather
 * than from the list so the file matches what is on screen: the client asked
 * for the download to follow "the same concept" as the report.
 *
 * The file carries the same footing as the panel: a totals line, then the
 * opening/closing block. A statement that lands in a merchant's inbox without
 * the net balance on it is a list of orders, not a statement.
 */
export function exportStatementCsv(
  statement: VendorStatementRow,
  rows: StatementTransaction[],
  labels: {
    date: string;
    order: string;
    type: string;
    total: string;
    fee: string;
    codNet: string;
    reference: string;
    totals: string;
    openingBalance: string;
    prepaidFees: string;
    refunds: string;
    netBalance: string;
  }
) {
  const totals = sumRows(rows);
  downloadCsv(
    fileSlug(statement),
    [
      labels.date,
      labels.order,
      labels.type,
      labels.reference,
      labels.total,
      labels.fee,
      labels.codNet,
    ],
    [
      ...rows.map((r) => [
        r.date ? r.date.slice(0, 10) : "n/a",
        r.orderNumber ?? "n/a",
        r.kind,
        r.reference ?? "n/a",
        r.orderTotalKwd ?? "n/a",
        r.deliveryFeeKwd ?? "n/a",
        r.codNetKwd,
      ]),
      ["", "", "", labels.totals, totals.orderTotal, totals.deliveryFee, totals.codNet],
      ["", "", "", labels.openingBalance, "", "", statement.openingBalanceKwd],
      ["", "", "", labels.codNet, "", "", statement.codNetKwd],
      ["", "", "", labels.prepaidFees, "", "", statement.prepaidFeesKwd],
      ["", "", "", labels.refunds, "", "", statement.refundsKwd],
      ["", "", "", labels.netBalance, "", "", statement.closingBalanceKwd],
    ]
  );
}

export default function StatementDetailPanel({ statement, onClose }: StatementDetailPanelProps) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["darb", "statement-transactions", statement?.id],
    queryFn: () => walletsApi.statementTransactions(statement!.id),
    enabled: !!statement,
  });

  const rows = useMemo(() => detailQuery.data?.rows ?? [], [detailQuery.data]);
  const totals = useMemo(() => sumRows(rows), [rows]);

  const kindLabel = (kind: StatementTransaction["kind"]) =>
    kind === "REFUND"
      ? t("reports.kindRefund")
      : kind === "PAYOUT"
        ? t("reports.kindPayout")
        : t("reports.kindDelivery");

  return (
    <SlidePanel
      open={!!statement}
      onClose={onClose}
      title={statement?.vendor?.name ?? t("reports.statementDetail")}
      subtitle={
        statement
          ? `${statement.periodStart.slice(0, 10)} to ${statement.periodEnd.slice(0, 10)}`
          : undefined
      }
    >
      {!statement ? null : detailQuery.error ? (
        <ErrorState
          error={
            detailQuery.error instanceof Error
              ? detailQuery.error.message
              : t("errors.loadingData")
          }
          onRetry={() => detailQuery.refetch()}
        />
      ) : (
        <div className="space-y-5">
          {/* The net balance is the one number the reader came for, so it sits
              above the rows rather than three hundred lines below them. */}
          <div className="flex items-end justify-between gap-4 rounded-2xl bg-sand-50 border border-sand-200 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-sand-600">{t("reports.netBalance")}</p>
              <p
                dir="ltr"
                className={cn(
                  "text-2xl font-display tabular-nums mt-0.5",
                  Number(statement.closingBalanceKwd) < 0 ? "text-red-600" : "text-sand-900"
                )}
              >
                {formatKwd(statement.closingBalanceKwd, locale)}
              </p>
            </div>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() =>
                exportStatementCsv(statement, rows, {
                  date: t("wallet.date"),
                  order: t("reports.orderNumber"),
                  type: t("reports.entryType"),
                  reference: t("reports.reference"),
                  total: t("reports.orderTotal"),
                  fee: t("reports.deliveryFee"),
                  codNet: t("reports.codNet"),
                  totals: t("reports.totals"),
                  openingBalance: t("reports.openingBalance"),
                  prepaidFees: t("reports.prepaidFees"),
                  refunds: t("reports.refunds"),
                  netBalance: t("reports.netBalance"),
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
            >
              <Download size={12} aria-hidden="true" />
              {t("reports.exportCsv")}
            </button>
          </div>

          {detailQuery.isLoading ? (
            <p className="text-sm text-sand-600">{t("common.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-sand-600">{t("reports.noRows")}</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200">
                    <th className="w-6" />
                    <th className="text-start text-xs font-medium text-sand-600 py-2">
                      {t("wallet.date")}
                    </th>
                    <th className="text-start text-xs font-medium text-sand-600 py-2">
                      {t("reports.orderNumber")}
                    </th>
                    <th className="text-end text-xs font-medium text-sand-600 py-2">
                      {t("reports.orderTotal")}
                    </th>
                    <th className="text-end text-xs font-medium text-sand-600 py-2">
                      {t("reports.deliveryFee")}
                    </th>
                    <th className="text-end text-xs font-medium text-sand-600 py-2">
                      {t("reports.codNet")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const key = `${row.kind}-${row.orderId ?? i}`;
                    const open = expanded === key;
                    const expandable = row.entries.length > 0;
                    return (
                      <>
                        <tr
                          key={key}
                          className={cn(
                            "border-b border-sand-100",
                            expandable && "cursor-pointer hover:bg-sand-50"
                          )}
                          onClick={() => expandable && setExpanded(open ? null : key)}
                        >
                          <td className="py-2 text-sand-400">
                            {expandable ? (
                              open ? (
                                <ChevronDown size={13} aria-hidden="true" />
                              ) : (
                                <ChevronRight size={13} aria-hidden="true" />
                              )
                            ) : null}
                          </td>
                          <td dir="ltr" className="py-2 tabular-nums text-sand-700">
                            {row.date ? row.date.slice(0, 10) : "n/a"}
                          </td>
                          <td className="py-2">
                            <span dir="ltr" className="font-mono text-xs">
                              {row.orderNumber ?? "n/a"}
                            </span>
                            <span
                              className={cn(
                                "ms-2 inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-medium",
                                row.kind === "REFUND"
                                  ? "bg-amber-50 text-amber-700"
                                  : row.kind === "PAYOUT"
                                    ? "bg-purple-50 text-purple-600"
                                    : "bg-sand-100 text-sand-700"
                              )}
                            >
                              {kindLabel(row.kind)}
                            </span>
                          </td>
                          <td dir="ltr" className="py-2 text-end tabular-nums">
                            {row.orderTotalKwd == null
                              ? "n/a"
                              : formatKwd(row.orderTotalKwd, locale)}
                          </td>
                          <td dir="ltr" className="py-2 text-end tabular-nums">
                            {row.deliveryFeeKwd == null
                              ? "n/a"
                              : formatKwd(row.deliveryFeeKwd, locale)}
                          </td>
                          <td dir="ltr" className="py-2 text-end tabular-nums font-medium">
                            {formatKwd(row.codNetKwd, locale)}
                          </td>
                        </tr>
                        {open &&
                          row.entries.map((e) => (
                            <tr key={e.id} className="bg-sand-50/60 text-xs">
                              <td />
                              <td dir="ltr" className="py-1.5 text-sand-600">
                                {e.createdAt.slice(0, 10)}
                              </td>
                              <td className="py-1.5 text-sand-600">
                                {e.transactionType} · {e.account ?? "n/a"}
                              </td>
                              <td className="py-1.5 text-end text-sand-600">
                                {e.direction === "CREDIT" ? t("reports.credit") : t("reports.debit")}
                              </td>
                              <td dir="ltr" className="py-1.5 text-end tabular-nums text-sand-600">
                                {formatKwd(e.amountKwd, locale)}
                              </td>
                              <td dir="ltr" className="py-1.5 text-end tabular-nums text-sand-600">
                                {formatKwd(e.runningBalanceKwd, locale)}
                              </td>
                            </tr>
                          ))}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-sand-300">
                    <td />
                    <td className="py-2.5 text-xs font-medium text-sand-900" colSpan={2}>
                      {t("reports.totals")}
                    </td>
                    <td dir="ltr" className="py-2.5 text-end tabular-nums font-medium text-sand-900">
                      {formatKwd(totals.orderTotal, locale)}
                    </td>
                    <td dir="ltr" className="py-2.5 text-end tabular-nums font-medium text-sand-900">
                      {formatKwd(totals.deliveryFee, locale)}
                    </td>
                    <td
                      dir="ltr"
                      className="py-2.5 text-end tabular-nums font-semibold text-sand-900"
                    >
                      {formatKwd(totals.codNet, locale)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* The report has to foot to the number on the list row, or the
              drill-in is just a second opinion. */}
          <div className="border-t border-sand-200 pt-4 space-y-1.5 text-sm">
            <Foot label={t("reports.openingBalance")} value={statement.openingBalanceKwd} />
            <Foot label={t("reports.codNet")} value={statement.codNetKwd} />
            <Foot label={t("reports.prepaidFees")} value={statement.prepaidFeesKwd} />
            <Foot label={t("reports.refunds")} value={statement.refundsKwd} />
            <Foot
              label={t("reports.netBalance")}
              value={statement.closingBalanceKwd}
              emphasis
            />
          </div>
        </div>
      )}
    </SlidePanel>
  );
}

function Foot({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  const { locale } = useI18n();
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-sand-600", emphasis && "text-sand-900 font-medium")}>{label}</span>
      <span
        dir="ltr"
        className={cn("tabular-nums text-sand-800", emphasis && "text-sand-900 font-semibold")}
      >
        {formatKwd(value, locale)}
      </span>
    </div>
  );
}
