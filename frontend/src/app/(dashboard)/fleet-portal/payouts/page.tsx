"use client";
// Darb 2.0 PRD build — /fleet-portal/payouts: monthly payout statements plus
// the running current-month earnings (delivered orders x flat fee) with a
// per-order breakdown and CSV export.
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { fleetApi } from "@/lib/darbApi";
import { downloadCsv } from "@/lib/csv";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd, formatNumber, localeTag } from "@/i18n/format";

export default function FleetPayoutsPage() {
  const { t, locale } = useI18n();

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
            render: (value: string) => <StatusBadge status={value} />,
          },
        ]}
        data={statements}
        emptyMessage={t("fleetPortal.noStatements")}
      />

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
    </div>
  );
}
