"use client";
// Revision 20 — Admin › Dashboard and forecast.
//
// "this tab will show where are we now and what to expect later in numbers."
//
// Two halves, side by side, and the second one is only as confident as its
// history allows. Every projection carries the sample it was built from and a
// plain sentence saying how it was worked out, because a forecast that cannot
// say how much data is behind it is a guess with a decimal point on it, and an
// owner shown one will act on it. With less than a fortnight of deliveries the
// screen says so instead of drawing a line.
//
// The chart is inline SVG rather than a charting library: it is one series of
// daily points with a dashed projection, the page already loads a map, and a
// second rendering runtime for two paths is not a trade worth making.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Store, Truck, Users, GraduationCap, Package, CircleDollarSign, FileText, TriangleAlert } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import StatCard from "@/components/shared/StatCard";
import { cockpitApi } from "@/lib/darbApi";
import type { ForecastPoint } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatNumber } from "@/i18n/format";
import { cn } from "@/lib/cn";

/**
 * A history-then-projection line. Actuals solid, projection dashed, with the
 * join marked — the dash IS the disclaimer, and it is the first thing read.
 */
function TrendChart({
  history,
  projection,
  field,
}: {
  history: ForecastPoint[];
  projection: ForecastPoint[];
  field: "orders" | "revenueKwd";
}) {
  const W = 720;
  const H = 160;
  const PAD = 8;

  const points = useMemo(() => [...history, ...projection], [history, projection]);
  const max = Math.max(1, ...points.map((p) => p[field]));
  const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  const path = (slice: ForecastPoint[], offset: number) =>
    slice.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i + offset).toFixed(1)} ${y(p[field]).toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-40"
      role="img"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={path(history, 0)} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
      {projection.length > 0 && (
        <path
          // Start the dashed run at the last actual so the two lines meet.
          d={path(
            [history[history.length - 1] ?? projection[0]!, ...projection],
            Math.max(0, history.length - 1),
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="5 4"
          className="text-sand-400"
        />
      )}
    </svg>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0) return <span className="text-xs text-sand-400">n/a</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return (
    <span className={cn("text-xs font-medium", pct >= 0 ? "text-forest-700" : "text-red-600")}>
      {pct >= 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

export default function AdminDashboardTab() {
  const { t, locale } = useI18n();

  const query = useQuery({
    queryKey: ["darb", "admin-snapshot"],
    queryFn: () => cockpitApi.snapshot(),
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <PageSkeleton statCards={4} tableRows={4} tableCols={4} />;
  if (query.error) {
    return (
      <ErrorState
        error={query.error instanceof Error ? query.error.message : t("errors.loadingData")}
        onRetry={() => query.refetch()}
      />
    );
  }

  const snap = query.data!;
  const f = snap.forecast;
  const forecastable = f.projectedOrders !== null;

  return (
    <div className="space-y-6">
      {/* ── Where we are ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-display text-lg text-sand-900">{t("adminHub.now")}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={t("adminHub.ordersToday")}
            value={formatNumber(snap.now.ordersToday, locale)}
            icon={Package}
          />
          <StatCard
            title={t("adminHub.deliveredToday")}
            value={formatNumber(snap.now.deliveredToday, locale)}
            icon={Package}
          />
          <StatCard
            title={t("adminHub.revenueToday")}
            value={formatKwd(snap.now.revenueTodayKwd, locale)}
            icon={CircleDollarSign}
          />
          <StatCard
            title={t("adminHub.activeDrivers")}
            value={formatNumber(snap.now.activeDrivers, locale)}
            icon={Users}
            trend={
              snap.now.driversInTraining > 0
                ? `${formatNumber(snap.now.driversInTraining, locale)} ${t("adminHub.driversInTraining")}`
                : undefined
            }
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={t("adminHub.activeVendors")}
            value={formatNumber(snap.now.activeVendors, locale)}
            icon={Store}
          />
          <StatCard
            title={t("adminHub.activeFleets")}
            value={formatNumber(snap.now.activeFleets, locale)}
            icon={Truck}
          />
          <StatCard
            title={t("adminHub.documentsWaiting")}
            value={formatNumber(snap.now.documentsWaiting, locale)}
            icon={FileText}
            highlight={snap.now.documentsWaiting > 0}
          />
          <StatCard
            title={t("adminHub.openDisputes")}
            value={formatNumber(snap.now.openDisputes, locale)}
            icon={TriangleAlert}
            highlight={snap.now.openDisputes > 0}
          />
        </div>
      </section>

      {/* ── Month to date, against the same stretch of last month ────────── */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5">
        <h2 className="font-display text-lg text-sand-900">{t("adminHub.monthToDate")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-3">
          <div>
            <p className="text-xs text-sand-600">{t("hq.tabOrders")}</p>
            <div className="flex items-baseline gap-2">
              <p className="font-display text-2xl text-sand-900 tabular-nums">
                {formatNumber(snap.monthToDate.orders, locale)}
              </p>
              <Delta now={snap.monthToDate.orders} before={snap.monthToDate.previousOrders} />
            </div>
            <p className="text-xs text-sand-500 mt-0.5">
              {t("adminHub.vsLastMonth")}: {formatNumber(snap.monthToDate.previousOrders, locale)}
            </p>
          </div>
          <div>
            <p className="text-xs text-sand-600">{t("adminHub.revenueToday").replace(" today", "")}</p>
            <div className="flex items-baseline gap-2">
              <p className="font-display text-2xl text-sand-900 tabular-nums">
                {formatKwd(snap.monthToDate.revenueKwd, locale)}
              </p>
              <Delta
                now={snap.monthToDate.revenueKwd}
                before={snap.monthToDate.previousRevenueKwd}
              />
            </div>
            <p className="text-xs text-sand-500 mt-0.5">
              {t("adminHub.vsLastMonth")}: {formatKwd(snap.monthToDate.previousRevenueKwd, locale)}
            </p>
          </div>
        </div>
      </section>

      {/* ── What to expect ──────────────────────────────────────────────── */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-lg text-sand-900">{t("adminHub.forecast")}</h2>
          {forecastable && f.growthFactor !== null && (
            <span className="text-sm text-sand-600">
              {t("adminHub.growth")}:{" "}
              <span
                className={cn(
                  "font-medium",
                  f.growthFactor >= 1 ? "text-forest-700" : "text-red-600",
                )}
              >
                {f.growthFactor >= 1 ? "+" : ""}
                {Math.round((f.growthFactor - 1) * 100)}%
              </span>
            </span>
          )}
        </div>

        {!forecastable ? (
          <p className="text-sm text-sand-600 bg-sand-50 rounded-2xl px-4 py-6 text-center">
            {t("adminHub.notEnoughHistory")}
            <span className="block text-xs text-sand-500 mt-1">{f.basis}</span>
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard
                title={t("adminHub.projectedOrders")}
                value={formatNumber(f.projectedOrders ?? 0, locale)}
                icon={Package}
              />
              <StatCard
                title={t("adminHub.projectedRevenue")}
                value={formatKwd(f.projectedRevenueKwd ?? 0, locale)}
                icon={CircleDollarSign}
              />
            </div>

            <div className="text-primary">
              <TrendChart history={f.history} projection={f.projection} field="orders" />
            </div>

            {/* The working, in words. This is not decoration: a number an owner
                cannot interrogate is a number they will either over-trust or
                ignore, and both are worse than a caveated one. */}
            <p className="text-xs text-sand-500">
              <span className="font-medium">{t("adminHub.basisLabel")}: </span>
              {f.basis}
            </p>
          </>
        )}
      </section>

      {/* A thing that needs a person, surfaced where the owner already looks. */}
      {snap.now.onboardingWaiting > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <GraduationCap size={15} className="text-amber-700 shrink-0" aria-hidden="true" />
          <p className="text-sm text-amber-800">
            {formatNumber(snap.now.onboardingWaiting, locale)} {t("adminHub.onboardingWaiting")}
          </p>
        </div>
      )}
    </div>
  );
}
