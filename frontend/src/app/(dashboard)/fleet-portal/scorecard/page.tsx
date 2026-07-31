"use client";
// Darb 2.0 PRD build — /fleet-portal/scorecard: the fleet's own performance
// scorecard, computed server-side over the period the partner picks (day,
// week or month, defaulting to this month so it lines up with how payouts are
// cut). Rates arrive as 0..1 fractions and render as percentages with 1dp;
// null means not enough data yet and renders "n/a".
//
// Revision 13b, after the client saw it: five averages about a company is not
// something a supervisor can act on, because an average never names anybody.
// The tiles now cover throughput, reliability and what the period is worth,
// and underneath them the same window is drawn as the three drivers carrying
// the company and the three who are not, side by side.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCheck, Clock3, Coins, Gauge, PackageCheck, Star, Timer,
  TrendingDown, TrendingUp, Truck, Users, XCircle,
} from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import ErrorState from "@/components/shared/ErrorState";
import PeriodPicker, { type Period, presetRange } from "@/components/shared/PeriodPicker";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { fleetApi } from "@/lib/darbApi";
import type { FleetDriverScore } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatNumber, formatPercent } from "@/i18n/format";
import type { Locale } from "@/i18n/messages";
import { cn } from "@/lib/cn";

function pct(value: number | null | undefined, locale: Locale): string {
  return value == null ? "n/a" : formatPercent(value, locale, 1);
}

function num(value: number | null | undefined, locale: Locale, dp = 1): string {
  return value == null ? "n/a" : formatNumber(value, locale, { maximumFractionDigits: dp });
}

export default function FleetScorecardPage() {
  const { t, locale } = useI18n();

  const [period, setPeriod] = useState<Period>(() => presetRange("month"));

  const scorecardQuery = useQuery({
    queryKey: ["darb", "fleet", "scorecard", period.from, period.to],
    queryFn: () => fleetApi.scorecard({ from: period.from, to: period.to }),
  });

  if (scorecardQuery.isLoading) return <PageSkeleton statCards={5} tableRows={0} tableCols={1} />;
  if (scorecardQuery.error || !scorecardQuery.data) {
    return (
      <ErrorState
        error={
          scorecardQuery.error instanceof Error
            ? scorecardQuery.error.message
            : t("errors.loadingData")
        }
        onRetry={() => scorecardQuery.refetch()}
      />
    );
  }

  const s = scorecardQuery.data;
  const top = s.drivers?.top ?? [];
  const bottom = s.drivers?.bottom ?? [];

  /** The average of one field across a group, for the gap line between them. */
  const avg = (rows: FleetDriverScore[], pick: (r: FleetDriverScore) => number | null) => {
    const vals = rows.map(pick).filter((v): v is number => v != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">
          {t("fleetPortal.scorecardTitle")}
        </h1>
      </div>

      <PeriodPicker value={period} onChange={setPeriod} />

      {/* How the work went. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title={t("fleetPortal.onTimeRate")} value={pct(s.onTimeRate, locale)}
          trend={`${formatNumber(s.slaBreaches ?? 0, locale)} ${t("fleetPortal.slaBreaches")}`}
          icon={Timer} />
        <StatCard
          title={t("fleetPortal.acceptanceRate")}
          value={pct(s.acceptanceRate, locale)}
          trend={`${formatNumber(s.offersDeclined ?? 0, locale)} ${t("fleetPortal.declined")} · ${formatNumber(s.offersExpired ?? 0, locale)} ${t("fleetPortal.expired")}`}
          icon={CheckCheck}
        />
        <StatCard
          title={t("fleetPortal.utilisation")}
          value={pct(s.utilisation, locale)}
          icon={Gauge}
        />
        <StatCard
          title={t("fleetPortal.deliveredOrders")}
          value={formatNumber(s.deliveredOrders, locale)}
          icon={PackageCheck}
        />
        <StatCard
          title={t("fleetPortal.onlineHours")}
          value={num(s.onlineHours, locale)}
          trend={`${t("fleetPortal.contractedHours")}: ${num(s.contractedHours, locale)}`}
          icon={Clock3}
        />
        <StatCard
          title={t("fleetPortal.avgRating")}
          value={s.avgRating != null ? num(s.avgRating, locale, 2) : "n/a"}
          trend={`${formatNumber(s.ratingCount ?? 0, locale)} ${t("fleetPortal.ratings")}`}
          icon={Star}
        />
      </div>

      {/* Revision 13b — what the averages above are made of. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title={t("fleetPortal.activeDrivers")}
          value={formatNumber(s.activeDrivers ?? 0, locale)}
          trend={`${t("fleetPortal.ofRoster")}: ${formatNumber(s.driverCount ?? 0, locale)}`}
          icon={Users}
        />
        <StatCard
          title={t("fleetPortal.ordersPerDriver")}
          value={num(s.ordersPerDriver, locale)}
          icon={Truck}
        />
        <StatCard
          title={t("fleetPortal.ordersPerHour")}
          value={num(s.ordersPerOnlineHour, locale, 2)}
          icon={Gauge}
        />
        <StatCard
          title={t("fleetPortal.medianDeliveryTime")}
          value={
            s.medianDeliveryMinutes != null
              ? `${num(s.medianDeliveryMinutes, locale)} ${t("fleetPortal.minutes")}`
              : "n/a"
          }
          icon={Timer}
        />
        <StatCard
          title={t("fleetPortal.failedOrders")}
          value={formatNumber(s.failedOrders ?? 0, locale)}
          trend={`${pct(s.failureRate, locale)} ${t("fleetPortal.ofAssigned")}`}
          icon={XCircle}
        />
        <StatCard
          title={t("fleetPortal.earningsInPeriod")}
          value={s.earningsKwd ? formatKwd(s.earningsKwd, locale) : "n/a"}
          icon={Coins}
        />
      </div>

      {/* Best three against worst three. Two columns rather than one ranked
          list of everybody: the client asked to compare the ends, and a full
          league table is a thing nobody reads past the top of. */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg text-sand-900">{t("fleetPortal.driverComparison")}</h2>
          <p className="text-sm text-sand-600 mt-0.5" dir="auto">
            {t("fleetPortal.driverComparisonHint").replace(
              "{n}",
              String(s.drivers?.minOrders ?? 5),
            )}
          </p>
        </div>

        {top.length === 0 && bottom.length === 0 ? (
          <p className="px-4 py-6 rounded-xl border border-sand-200 bg-white text-sm text-sand-600">
            {t("fleetPortal.notEnoughToRank")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DriverColumn
                title={t("fleetPortal.topThree")}
                rows={top}
                tone="good"
                emptyLabel={t("fleetPortal.notEnoughToRank")}
              />
              <DriverColumn
                title={t("fleetPortal.bottomThree")}
                rows={bottom}
                tone="bad"
                emptyLabel={t("fleetPortal.noBottomThree")}
              />
            </div>

            {/* The gap, said once in plain numbers. Two tables side by side
                still leave the reader doing the subtraction. */}
            {top.length > 0 && bottom.length > 0 && (
              <div className="rounded-xl border border-sand-200 bg-white px-4 py-3">
                <p className="text-xs font-medium text-sand-700 mb-2">
                  {t("fleetPortal.theGap")}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: t("fleetPortal.onTimeRate"),
                      a: avg(top, (r) => r.onTimeRate),
                      b: avg(bottom, (r) => r.onTimeRate),
                      as: "pct" as const,
                    },
                    {
                      label: t("fleetPortal.acceptanceRate"),
                      a: avg(top, (r) => r.acceptanceRate),
                      b: avg(bottom, (r) => r.acceptanceRate),
                      as: "pct" as const,
                    },
                    {
                      label: t("fleetPortal.rating"),
                      a: avg(top, (r) => r.avgRating),
                      b: avg(bottom, (r) => r.avgRating),
                      as: "num" as const,
                    },
                    {
                      label: t("fleetPortal.orders"),
                      a: avg(top, (r) => r.deliveredOrders),
                      b: avg(bottom, (r) => r.deliveredOrders),
                      as: "num" as const,
                    },
                  ].map((row) => (
                    <div key={row.label}>
                      <p className="text-[11px] text-sand-500">{row.label}</p>
                      <p className="text-sm tabular-nums" dir="ltr">
                        <span className="text-forest-700 font-medium">
                          {row.as === "pct" ? pct(row.a, locale) : num(row.a, locale, 2)}
                        </span>
                        <span className="text-sand-400"> vs </span>
                        <span className="text-red-600 font-medium">
                          {row.as === "pct" ? pct(row.b, locale) : num(row.b, locale, 2)}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {(s.drivers?.unranked ?? 0) > 0 && (
          <p className="text-xs text-sand-500" dir="auto">
            {t("fleetPortal.unrankedDrivers")
              .replace("{count}", String(s.drivers?.unranked ?? 0))
              .replace("{n}", String(s.drivers?.minOrders ?? 5))}
          </p>
        )}
      </section>
    </div>
  );
}

/** One end of the list. Same columns on both sides so they read as a pair. */
function DriverColumn({
  title,
  rows,
  tone,
  emptyLabel,
}: {
  title: string;
  rows: FleetDriverScore[];
  tone: "good" | "bad";
  emptyLabel: string;
}) {
  const { t, locale } = useI18n();
  const Icon = tone === "good" ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-2xl border border-sand-200 bg-white overflow-hidden">
      <header
        className={cn(
          "flex items-center gap-2 px-4 py-3 border-b",
          tone === "good"
            ? "bg-forest-50 border-forest-100 text-forest-900"
            : "bg-red-50 border-red-100 text-red-900",
        )}
      >
        <Icon size={15} aria-hidden="true" />
        <span className="text-sm font-medium">{title}</span>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-sand-600">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-sand-200">
          {rows.map((r, i) => (
            <li key={r.driverId} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-sand-900 truncate" dir="auto">
                    {i + 1}. {r.name}
                  </p>
                  <p className="text-[11px] text-sand-500" dir="ltr">
                    {r.driverCode ?? "n/a"} · {r.vehicleType}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-lg font-display tabular-nums shrink-0",
                    tone === "good" ? "text-forest-700" : "text-red-600",
                  )}
                  dir="ltr"
                >
                  {r.score != null ? formatNumber(r.score, locale, { maximumFractionDigits: 1 }) : "n/a"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-sand-600">
                <span dir="ltr">
                  {t("fleetPortal.orders")} {formatNumber(r.deliveredOrders, locale)}
                </span>
                <span dir="ltr">
                  {t("fleetPortal.onTime")} {pct(r.onTimeRate, locale)}
                </span>
                <span dir="ltr">
                  {t("fleetPortal.accepted")} {pct(r.acceptanceRate, locale)}
                </span>
                <span dir="ltr">
                  {t("fleetPortal.rating")}{" "}
                  {r.avgRating != null
                    ? formatNumber(r.avgRating, locale, { maximumFractionDigits: 1 })
                    : "n/a"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
