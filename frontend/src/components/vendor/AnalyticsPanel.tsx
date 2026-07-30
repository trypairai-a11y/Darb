"use client";
// The body of the merchant Grow screen: order-derived analytics. Date range
// (default last 30 days) + branch scope from VendorBranchContext; KPI
// StatCards, orders-by-day bar list, top customers table and a CSV export.
// Lifted out of the old /vendor/analytics page minus its heading, which the
// Grow screen carries.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, Repeat, ShoppingBag, Timer, Wallet } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import DateRangePicker from "@/components/shared/DateRangePicker";
import { useVendorBranch } from "@/contexts/VendorBranchContext";
import { vendorApi } from "@/lib/darbApi";
import { downloadCsv } from "@/lib/csv";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatDate, formatNumber } from "@/i18n/format";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AnalyticsPanel() {
  const { t, locale } = useI18n();
  const { branchId } = useVendorBranch();

  // Default range: the last 30 days.
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    return { from: isoDay(from), to: isoDay(to) };
  });

  const analyticsQuery = useQuery({
    queryKey: ["darb", "vendor", "analytics", range.from, range.to, branchId],
    queryFn: () =>
      vendorApi.analytics({
        from: range.from || undefined,
        to: range.to || undefined,
        branchId: branchId ?? undefined,
      }),
  });

  const data = analyticsQuery.data;
  const maxDayOrders = useMemo(
    () => Math.max(1, ...(data?.byDay ?? []).map((d) => d.orders)),
    [data]
  );

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      "vendor-analytics",
      [t("vendorExtra.byDayTitle"), t("vendorExtra.ordersTotal"), t("vendorExtra.customerTotal")],
      [
        ...data.byDay.map((d) => [d.day, d.orders, d.totalKwd]),
        [],
        [t("vendorExtra.customerPhone"), t("vendorExtra.customerOrders"), t("vendorExtra.customerTotal")],
        ...data.topCustomers.map((c) => [c.phone, c.orders, c.totalKwd]),
      ] as (string | number | null | undefined)[][]
    );
  }

  if (analyticsQuery.isLoading) return <PageSkeleton statCards={4} tableRows={6} tableCols={3} />;
  if (analyticsQuery.error || !data) {
    return (
      <ErrorState
        error={
          analyticsQuery.error instanceof Error
            ? analyticsQuery.error.message
            : t("errors.loadingData")
        }
        onRetry={() => analyticsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-end gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker
            dateFrom={range.from}
            dateTo={range.to}
            onChange={(from, to) => setRange({ from, to })}
          />
          {/* CSV only. The print-to-PDF button beside it printed the browser
              page, chrome and all, which is not a document anyone would send
              on. The CSV is the export that survives. */}
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
          >
            <Download size={12} aria-hidden="true" />
            {t("vendorExtra.exportCsv")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title={t("vendorExtra.ordersTotal")}
          value={formatNumber(data.ordersTotal, locale)}
          icon={ShoppingBag}
        />
        <StatCard
          title={t("vendorExtra.revenueTotal")}
          value={formatKwd(data.revenueKwd, locale)}
          icon={Wallet}
        />
        <StatCard
          title={t("vendorExtra.avgOrderValue")}
          value={formatKwd(data.avgOrderValueKwd, locale)}
          icon={BarChart3}
        />
        <StatCard
          title={t("vendorExtra.repeatBuyers")}
          value={formatNumber(data.repeatBuyers, locale)}
          icon={Repeat}
        />
        {/* Revision 10 (#4). The handover wait: how long our drivers stand at
            the counter between arriving and being given the order. Branch-aware
            like every other card here, because the branch scope is already on
            the query. "n/a" rather than 0 when nothing in the period had both
            stamps, since no data and instant handover are different claims. */}
        <StatCard
          title={t("vendorExtra.avgPrepTime")}
          value={
            data.avgPrepMinutes != null
              ? `${formatNumber(data.avgPrepMinutes, locale)} ${t("vendorExtra.minutesShort")}`
              : t("common.notAvailable")
          }
          icon={Timer}
          trend={
            data.avgPrepMinutes != null && data.prepSampleSize
              ? t("vendorExtra.prepFromOrders").replace("{n}", formatNumber(data.prepSampleSize, locale))
              : t("vendorExtra.avgPrepTimeHint")
          }
        />
      </div>

      {/* Orders by day — simple bar list */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
        <header className="px-5 py-4 border-b border-sand-200">
          <h2 className="text-sm font-medium text-sand-900">{t("vendorExtra.byDayTitle")}</h2>
        </header>
        {data.byDay.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-sand-600">{t("errors.noData")}</p>
        ) : (
          <ul className="p-5 space-y-2">
            {data.byDay.map((d) => (
              <li key={d.day} className="flex items-center gap-3">
                <span dir="ltr" className="w-24 shrink-0 text-xs text-sand-600 tabular-nums">
                  {formatDate(d.day, locale, { month: "short", day: "numeric" })}
                </span>
                <span className="flex-1 h-4 rounded-pill bg-sand-100 overflow-hidden">
                  <span
                    className="block h-full rounded-pill bg-primary/70"
                    style={{ width: `${Math.round((d.orders / maxDayOrders) * 100)}%` }}
                  />
                </span>
                <span dir="ltr" className="w-10 shrink-0 text-end text-xs text-sand-900 tabular-nums">
                  {d.orders}
                </span>
                <span dir="ltr" className="w-28 shrink-0 text-end text-xs text-sand-600 tabular-nums">
                  {formatKwd(d.totalKwd, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Top customers */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-sand-900">{t("vendorExtra.topCustomersTitle")}</h2>
        <DataTable
          columns={[
            {
              key: "phone",
              label: t("vendorExtra.customerPhone"),
              render: (value: string, row: { name: string | null }) => (
                <span>
                  <span dir="ltr" className="tabular-nums">{value}</span>
                  {row.name && (
                    <span dir="auto" className="block text-xs text-sand-600">
                      {row.name}
                    </span>
                  )}
                </span>
              ),
            },
            { key: "orders", label: t("vendorExtra.customerOrders") },
            {
              key: "totalKwd",
              label: t("vendorExtra.customerTotal"),
              render: (value: string) => (
                <span dir="ltr" className="tabular-nums">{formatKwd(value, locale)}</span>
              ),
            },
          ]}
          data={data.topCustomers}
          rowKey="phone"
          emptyMessage={t("errors.noData")}
        />
      </section>
    </div>
  );
}
