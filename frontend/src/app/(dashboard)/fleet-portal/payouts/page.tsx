"use client";
// Darb 2.0 PRD build — /fleet-portal/payouts: monthly payout statements plus
// the running current-month earnings (delivered orders x flat fee) with a
// per-order breakdown and CSV export.
//
// Revision 13 (#8) — Darb used to move a statement from Final to Paid on its
// own. The delivery company confirms the figure first now, or disputes it with
// a reason that opens a Payout request carrying the numbers. postFleetPayout
// refuses an unconfirmed statement, so this is the gate and not a courtesy.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, MessageSquareWarning } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { fleetApi } from "@/lib/darbApi";
import { downloadCsv } from "@/lib/csv";
import type { FleetStatementRow } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd, formatNumber, localeTag } from "@/i18n/format";

export default function FleetPayoutsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [disputing, setDisputing] = useState<FleetStatementRow | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const statementsQuery = useQuery({
    queryKey: ["darb", "fleet", "statements"],
    queryFn: () => fleetApi.statements(),
  });
  const earningsQuery = useQuery({
    queryKey: ["darb", "fleet", "earnings"],
    queryFn: () => fleetApi.earnings(),
  });

  if (statementsQuery.isLoading || earningsQuery.isLoading) {
    return <PageSkeleton statCards={0} tableRows={6} tableCols={5} />;
  }
  if (statementsQuery.error) {
    return (
      <ErrorState
        error={
          statementsQuery.error instanceof Error
            ? statementsQuery.error.message
            : t("errors.loadingData")
        }
        onRetry={() => statementsQuery.refetch()}
      />
    );
  }

  const statements = statementsQuery.data ?? [];
  const earnings = earningsQuery.data;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "statements"] });

  const fail = (err: unknown) =>
    toast.error(
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave"),
    );

  async function confirm(row: FleetStatementRow) {
    try {
      await fleetApi.confirmStatement(row.id);
      toast.success(t("fleetPortal.statementConfirmed"));
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function dispute() {
    if (!disputing) return;
    setSaving(true);
    try {
      await fleetApi.disputeStatement(disputing.id, reason.trim());
      toast.success(t("fleetPortal.statementDisputed"));
      setDisputing(null);
      setReason("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = (iso: string) =>
    new Intl.DateTimeFormat(localeTag(locale), { year: "numeric", month: "long" }).format(
      new Date(iso)
    );

  function exportEarnings() {
    if (!earnings) return;
    downloadCsv(
      "fleet-earnings",
      [
        t("dispatch.orderNumber"),
        t("fleetPortal.driverName"),
        t("darbOrderStatus.delivered"),
        t("fleetPortal.feePerOrder"),
      ],
      earnings.orders.map((o) => [o.orderNumber, o.driverName ?? "n/a", o.deliveredAt, o.feeKwd])
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">
          {t("fleetPortal.payoutsTitle")}
        </h1>
      </div>

      <DataTable
        columns={[
          {
            key: "periodStart",
            label: t("fleetPortal.period"),
            render: (value: string) => <span dir="ltr">{monthLabel(value)}</span>,
          },
          { key: "deliveredOrders", label: t("fleetPortal.orders") },
          {
            key: "feePerOrderKwd",
            label: t("fleetPortal.feePerOrder"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums">{formatKwd(value, locale)}</span>
            ),
          },
          {
            key: "totalKwd",
            label: t("fleetPortal.total"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums font-medium">{formatKwd(value, locale)}</span>
            ),
          },
          {
            key: "status",
            label: t("fleetPortal.statementStatus"),
            render: (value: string, row: FleetStatementRow) => (
              <span className="inline-flex items-center gap-2">
                <StatusBadge status={value} />
                {value === "DISPUTED" && row.disputeReason && (
                  <span className="text-xs text-red-600" dir="auto">{row.disputeReason}</span>
                )}
              </span>
            ),
          },
          {
            // Only what this row can actually do. A paid month has nothing to
            // confirm, and a confirmed one says so rather than offering the
            // button again.
            key: "id",
            label: "",
            sortable: false,
            render: (_v: unknown, row: FleetStatementRow) =>
              row.status === "PAID" ? null : row.status === "CONFIRMED" ? (
                <span className="text-xs text-sand-500">{t("fleetPortal.awaitingDarb")}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void confirm(row)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-primary text-white text-xs font-medium hover:opacity-90"
                  >
                    <Check size={12} aria-hidden="true" />
                    {t("fleetPortal.confirmPayout")}
                  </button>
                  {row.status !== "DISPUTED" && (
                    <button
                      type="button"
                      onClick={() => { setDisputing(row); setReason(""); }}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-pill border border-sand-300 text-xs font-medium text-sand-700 hover:bg-sand-100"
                    >
                      <MessageSquareWarning size={12} aria-hidden="true" />
                      {t("fleetPortal.disputePayout")}
                    </button>
                  )}
                </span>
              ),
          },
        ]}
        data={statements}
        emptyMessage={t("fleetPortal.noStatements")}
      />

      <p className="text-xs text-sand-600" dir="auto">
        {t("fleetPortal.confirmHint")}
      </p>

      {/* Current month earnings */}
      {earnings && (
        <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
          <header className="px-5 py-4 border-b border-sand-200 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-medium text-sand-900">{t("fleetPortal.earningsTitle")}</h2>
              <p className="text-xs text-sand-600 mt-0.5" dir="ltr">
                {formatNumber(earnings.deliveredOrders, locale)} x{" "}
                {formatKwd(earnings.feePerOrderKwd, locale)} ={" "}
                <span className="font-medium text-sand-900">
                  {formatKwd(earnings.totalKwd, locale)}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={exportEarnings}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
            >
              <Download size={12} aria-hidden="true" />
              {t("table.exportCsv")}
            </button>
          </header>
          {earnings.orders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-sand-600">{t("errors.noData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-sand-200">
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("dispatch.orderNumber")}
                    </th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("fleetPortal.driverName")}
                    </th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("darbOrderStatus.delivered")}
                    </th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("fleetPortal.feePerOrder")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {earnings.orders.map((o) => (
                    <tr key={o.id} className="border-b border-sand-200 last:border-0">
                      <td dir="ltr" className="px-5 py-3 text-sm font-mono">{o.orderNumber}</td>
                      <td dir="auto" className="px-5 py-3 text-sm">{o.driverName ?? "n/a"}</td>
                      <td dir="ltr" className="px-5 py-3 text-sm tabular-nums">
                        {formatDateTime(o.deliveredAt, locale)}
                      </td>
                      <td dir="ltr" className="px-5 py-3 text-sm tabular-nums">
                        {formatKwd(o.feeKwd, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* A dispute is a sentence Darb can act on, not a flag. The reason
          becomes the first message on a Payout request carrying the period,
          the order count and the total. */}
      <SlidePanel
        open={disputing !== null}
        onClose={() => setDisputing(null)}
        title={t("fleetPortal.disputePayout")}
        subtitle={disputing ? monthLabel(disputing.periodStart) : undefined}
      >
        <div className="space-y-4">
          <p className="text-sm text-sand-600" dir="auto">{t("fleetPortal.disputeHint")}</p>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">
              {t("fleetPortal.disputeReason")}
            </span>
            <textarea
              rows={5}
              dir="auto"
              className="w-full px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={saving || reason.trim().length < 10}
            onClick={() => void dispute()}
            className="w-full h-11 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? t("common.processing") : t("fleetPortal.disputePayout")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
