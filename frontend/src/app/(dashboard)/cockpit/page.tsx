"use client";
// Darb 2.0 PRD build — /cockpit: the founder cockpit. One ADMIN-only page
// with live operation KPIs, money position, fleet/cash rows, threshold
// alerts, zone on-time and fleet partner tables. Refreshes every 30s.
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  CheckCheck,
  Download,
  Gauge,
  Landmark,
  PackageCheck,
  Percent,
  PiggyBank,
  Timer,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import PeriodPicker, { DEFAULT_PERIOD, type Period } from "@/components/shared/PeriodPicker";
import { groupFleetsByOwner } from "@/components/darb/fleetGrouping";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole } from "@/hooks/useRole";
import { cockpitApi } from "@/lib/darbApi";
import { downloadCsv } from "@/lib/csv";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatNumber, formatPercent, formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/messages";
import { cn } from "@/lib/cn";

function pct(value: number | null | undefined, locale: Locale): string {
  return value == null ? "n/a" : formatPercent(value, locale, 1);
}

export default function CockpitPage() {
  const { t, locale } = useI18n();
  const { role } = useRole();

  // Revision #26 — the period drives every "today"-scoped figure. The live
  // tiles below (active orders, drivers online/busy, cash in the field, hub
  // cash) are a snapshot of right now and deliberately ignore it, so they are
  // labelled as such rather than silently contradicting the selected range.
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [groupByOwner, setGroupByOwner] = useState(true);
  const isToday = period.preset === "today";

  const summaryQuery = useQuery({
    queryKey: ["darb", "cockpit", "summary", period.from, period.to],
    queryFn: () => cockpitApi.summary({ from: period.from, to: period.to }),
    refetchInterval: 30_000,
    enabled: role === "ADMIN",
  });

  // In-page 403 for non-ADMIN staff (the API enforces the same gate).
  if (role !== "ADMIN") {
    return <ErrorState error={t("errors.permissionDenied")} />;
  }

  if (summaryQuery.isLoading) return <PageSkeleton statCards={4} tableRows={5} tableCols={4} />;
  if (summaryQuery.error || !summaryQuery.data) {
    return (
      <ErrorState
        error={
          summaryQuery.error instanceof Error ? summaryQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => summaryQuery.refetch()}
      />
    );
  }

  const s = summaryQuery.data;

  // Grouping off still routes through groupFleetsByOwner, which returns
  // single-member groups, so the table renders one uniform shape either way.
  const fleetRows = groupByOwner
    ? groupFleetsByOwner(s.fleet.fleets)
    : s.fleet.fleets.map((f) => ({
        key: f.fleetPartnerId,
        name: f.name,
        isGroup: false,
        members: [f],
        driversOnline: f.driversOnline,
        minDriversOnline: f.minDriversOnline,
        deliveredToday: f.deliveredToday,
        disciplineStatus: f.disciplineStatus,
      }));

  const periodLabel = isToday
    ? t("period.today")
    : period.preset === "week"
      ? t("period.thisWeek")
      : period.preset === "month"
        ? t("period.thisMonth")
        : `${period.from} to ${period.to}`;

  function exportCsv() {
    downloadCsv(
      "cockpit",
      [t("cockpit.zonesTitle"), t("cockpit.zoneDelivered"), t("cockpit.zoneOnTime")],
      [
        ...s.zones.map((z) => [
          `${z.code} ${z.name}`,
          z.deliveredToday,
          z.onTimeRate != null ? (z.onTimeRate * 100).toFixed(1) : "n/a",
        ]),
        [],
        [t("cockpit.fleetName"), t("cockpit.fleetOnline"), t("cockpit.fleetDelivered")],
        ...s.fleet.fleets.map((f) => [
          f.name,
          `${f.driversOnline}${f.minDriversOnline != null ? ` / ${f.minDriversOnline}` : ""}`,
          f.deliveredToday,
        ]),
      ] as (string | number | null | undefined)[][]
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">{t("cockpit.title")}</h1>
          <p className="text-sm text-sand-600 mt-1">
            {t("cockpit.subtitle")}{" "}
            <span className="text-xs text-sand-500" dir="ltr">
              {t("cockpit.refreshed")}: {formatTime(s.generatedAt, locale)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodPicker value={period} onChange={setPeriod} />
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
          >
            <Download size={12} aria-hidden="true" />
            {t("cockpit.exportCsv")}
          </button>
        </div>
      </div>

      {/* Operation row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t("cockpit.activeOrders")}
          value={formatNumber(s.orders.activeNow, locale)}
          icon={PackageCheck}
          trend={t("cockpit.liveNow")}
        />
        <StatCard
          title={t("cockpit.deliveredToday")}
          value={formatNumber(s.orders.deliveredToday, locale)}
          icon={CheckCheck}
          trend={periodLabel}
        />
        <StatCard
          title={t("cockpit.onTimeToday")}
          value={pct(s.orders.onTimeRateToday, locale)}
          icon={Timer}
          trend={periodLabel}
        />
      </div>

      {/* Money row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t("cockpit.feesToday")}
          value={formatKwd(s.money.feesTodayKwd, locale)}
          icon={Wallet}
          trend={periodLabel}
        />
        <StatCard
          title={t("cockpit.fleetCostToday")}
          value={formatKwd(s.money.fleetCostTodayKwd, locale)}
          icon={Truck}
          trend={periodLabel}
        />
        <StatCard
          title={t("cockpit.netMarginToday")}
          value={formatKwd(s.money.netMarginTodayKwd, locale)}
          icon={Percent}
          trend={periodLabel}
        />
        {/* Tips Today was removed at the client's request (revision #25). The
            API still returns tipsTodayKwd: drivers keep 100% of tips and
            finance reports on them, this surface just does not show it. */}
      </div>

      {/* Fleet + cash row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title={t("cockpit.driversOnline")}
          value={formatNumber(s.fleet.driversOnlineNow, locale)}
          icon={Users}
          trend={t("cockpit.liveNow")}
        />
        <StatCard
          title={t("cockpit.driversBusy")}
          value={formatNumber(s.fleet.driversBusyNow, locale)}
          icon={Gauge}
          trend={t("cockpit.liveNow")}
        />
        <StatCard
          title={t("cockpit.cashInField")}
          value={formatKwd(s.cash.driverCashInFieldKwd, locale)}
          icon={Banknote}
          trend={t("cockpit.liveNow")}
        />
        <StatCard
          title={t("cockpit.depositedToday")}
          value={formatKwd(s.cash.depositedTodayKwd, locale)}
          icon={PiggyBank}
          trend={periodLabel}
        />
        <StatCard
          title={t("cockpit.clearingBalance")}
          value={formatKwd(s.cash.clearingBalanceKwd, locale)}
          icon={Landmark}
          trend={t("cockpit.liveNow")}
        />
      </div>

      {/* Alerts */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
        <header className="px-5 py-4 border-b border-sand-200">
          <h2 className="text-sm font-medium text-sand-900">{t("cockpit.alertsTitle")}</h2>
        </header>
        {s.alerts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-sand-600">{t("cockpit.noAlerts")}</p>
        ) : (
          <ul className="divide-y divide-sand-200">
            {s.alerts.map((a, i) => (
              <li key={`${a.kind}-${i}`} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    a.severity === "HIGH" ? "bg-red-500" : "bg-amber-500"
                  )}
                  aria-hidden="true"
                />
                <p
                  className={cn(
                    "text-sm",
                    a.severity === "HIGH" ? "text-red-700" : "text-amber-700"
                  )}
                  dir="auto"
                >
                  {a.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Zones */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-sand-900">{t("cockpit.zonesTitle")}</h2>
        <DataTable
          columns={[
            {
              key: "code",
              label: t("cockpit.zoneName"),
              render: (value: string, row: { name: string }) => (
                <span>
                  <span dir="ltr" className="font-mono text-xs text-sand-600 me-2">{value}</span>
                  <span dir="auto">{row.name}</span>
                </span>
              ),
            },
            { key: "deliveredToday", label: t("cockpit.zoneDelivered") },
            {
              key: "onTimeRate",
              label: t("cockpit.zoneOnTime"),
              render: (value: number | null) => (
                <span dir="ltr" className="tabular-nums">{pct(value, locale)}</span>
              ),
            },
          ]}
          data={s.zones}
          rowKey="zoneId"
          emptyMessage={t("errors.noData")}
        />
      </section>

      {/* Fleets — commonly-owned partners roll up into one row (revision #28),
          with their individual fleets listed underneath. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-medium text-sand-900">{t("cockpit.fleetsTitle")}</h2>
          <label className="inline-flex items-center gap-2 text-xs text-sand-600 cursor-pointer">
            <input
              type="checkbox"
              checked={groupByOwner}
              onChange={(e) => setGroupByOwner(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-sand-400 text-primary focus:ring-primary/30"
            />
            {t("cockpit.groupByOwner")}
          </label>
        </div>
        <DataTable
          columns={[
            {
              key: "name",
              label: t("cockpit.fleetName"),
              render: (value: string, row: { isGroup: boolean; members: { fleetPartnerId: string; name: string }[] }) => (
                <div className="min-w-0">
                  <Link href="/fleets" className="text-primary hover:underline" dir="auto">
                    {value}
                  </Link>
                  {row.isGroup && (
                    <p className="text-xs text-sand-600 truncate" dir="auto">
                      {row.members.map((m) => m.name).join(", ")}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: "driversOnline",
              label: `${t("cockpit.fleetOnline")} / ${t("cockpit.fleetCommitted")}`,
              render: (value: number, row: { minDriversOnline: number | null }) => (
                <span dir="ltr" className="tabular-nums">
                  {value} / {row.minDriversOnline != null ? row.minDriversOnline : "n/a"}
                </span>
              ),
            },
            { key: "deliveredToday", label: t("cockpit.fleetDelivered") },
            {
              key: "disciplineStatus",
              label: t("cockpit.fleetDiscipline"),
              render: (value: string) => <StatusBadge status={value} />,
            },
          ]}
          data={fleetRows}
          rowKey="key"
          emptyMessage={t("errors.noData")}
        />
      </section>
    </div>
  );
}
