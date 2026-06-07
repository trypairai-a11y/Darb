"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useApiGet } from "@/hooks/useApi";
import {
  DollarSign,
  ShoppingBag,
  Users,
  ShieldAlert,
  Settings2,
  CalendarDays,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Award,
  Building2,
  Store,
  Activity,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useI18n } from "@/i18n/I18nProvider";
import { formatCurrency, formatNumber } from "@/i18n/format";
import { cn } from "@/lib/cn";

const AMERICANA = "#3B82F6";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map((v) => parseInt(v, 10));
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

function pct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function MoMChip({ delta, compact = false }: { delta: number | null; compact?: boolean }) {
  if (delta == null || !isFinite(delta))
    return <span className="text-[11px] text-sand-500">no prior data</span>;
  const positive = delta >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        compact ? "text-[10px]" : "text-[11px]",
        positive ? "text-emerald-600" : "text-rose-600",
      )}
    >
      <Icon size={compact ? 10 : 12} />
      {pct(delta)}
      {!compact && <span className="text-sand-500 font-normal">vs LM</span>}
    </span>
  );
}

function Sparkline({
  values,
  color = AMERICANA,
  height = 36,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (!values.length) return null;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id={`spk-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#spk-${color.replace("#", "")})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function HeroKpi({
  label,
  value,
  delta,
  spark,
  icon: Icon,
  footer,
}: {
  label: string;
  value: string;
  delta?: number | null;
  spark?: number[];
  icon: any;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-sand-200 dark:border-border rounded-2xl p-5 shadow-soft">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-sand-600">
          {label}
        </p>
        <div className="h-7 w-7 rounded-pill bg-sand-100 dark:bg-sand-900/40 flex items-center justify-center text-sand-700">
          <Icon size={13} />
        </div>
      </div>
      <p className="font-display text-3xl tracking-tight leading-none text-sand-900 dark:text-foreground">
        {value}
      </p>
      <div className="mt-3 flex items-center justify-between min-h-[20px]">
        <div>{delta !== undefined ? <MoMChip delta={delta ?? null} /> : footer}</div>
        {spark && spark.length > 1 && (
          <div className="w-24">
            <Sparkline values={spark} height={28} />
          </div>
        )}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  href,
  hint,
  children,
  className,
}: {
  title: string;
  href?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card border border-sand-200 dark:border-border rounded-2xl shadow-soft overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-sand-900 dark:text-foreground">{title}</h3>
          {hint && <p className="text-[11px] text-sand-500 mt-0.5">{hint}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-medium text-sand-600 hover:text-primary transition-colors"
          >
            View all <ChevronRight size={13} />
          </Link>
        )}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

function HBar({
  label,
  value,
  max,
  suffix,
  meta,
  color = AMERICANA,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  meta?: React.ReactNode;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-sand-800 dark:text-foreground truncate">{label}</span>
        <span className="text-sand-600 tabular-nums whitespace-nowrap">
          {meta ?? `${formatNumber(value)}${suffix ? ` ${suffix}` : ""}`}
        </span>
      </div>
      <div className="h-1.5 bg-sand-100 dark:bg-sand-900/40 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function TierPip({ tier, count }: { tier: "GOLD" | "SILVER" | "BRONZE"; count: number }) {
  const styles = {
    GOLD: "bg-amber-50 text-amber-700 ring-amber-200",
    SILVER: "bg-sand-100 text-sand-700 ring-sand-200",
    BRONZE: "bg-orange-50 text-orange-700 ring-orange-200",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1",
        styles[tier],
      )}
    >
      {count} {tier}
    </span>
  );
}

const VIOLATION_LABEL: Record<string, string> = {
  AMERICANA_LATE_ARRIVAL: "Late arrival",
  AMERICANA_NO_SHOW: "No-show",
  AMERICANA_EARLY_DEPARTURE_QUIT: "Early departure",
};

export default function AmericanaOverviewPage() {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState(currentMonth());

  const { data, loading } = useApiGet<any>(`/api/americana/overview?month=${month}`);
  const { data: driverSummary } = useApiGet<any>(`/api/americana/drivers/summary`);
  const { data: violationsSummary } = useApiGet<any>(
    `/api/violations/summary?platform=AMERICANA`,
  );
  const { data: performance } = useApiGet<any>(
    `/api/americana/performance?month=${month}`,
  );
  const { data: branchPerformance } = useApiGet<any>(
    `/api/americana/branch-performance?month=${month}&threshold=0.8`,
  );

  const revenueByStore: any[] = data?.revenueByStore ?? [];
  const chainMix = data?.chainMix;
  const headcountGap: any[] = data?.headcountGap ?? [];

  const metrics = useMemo(() => {
    const totalRevenue = revenueByStore.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const totalRevenueLM = revenueByStore.reduce((s, r) => s + (r.revenueLM ?? 0), 0);
    const totalOrders = revenueByStore.reduce((s, r) => s + r.orders, 0);
    const totalOrdersLM = revenueByStore.reduce((s, r) => s + (r.ordersLM ?? 0), 0);
    const drivers = revenueByStore.reduce((s, r) => s + (r.drivers ?? 0), 0);
    return {
      totalRevenue,
      totalRevenueLM,
      revenueDelta:
        totalRevenueLM > 0 ? ((totalRevenue - totalRevenueLM) / totalRevenueLM) * 100 : null,
      totalOrders,
      totalOrdersLM,
      ordersDelta:
        totalOrdersLM > 0 ? ((totalOrders - totalOrdersLM) / totalOrdersLM) * 100 : null,
      drivers,
      activeStores: revenueByStore.length,
    };
  }, [revenueByStore]);

  const totalDriversAll = driverSummary?.totalDrivers ?? metrics.drivers;
  const activeDriversCount = driverSummary?.activeDrivers ?? metrics.drivers;

  const tierCounts = useMemo(() => {
    const entries: any[] = performance?.entries ?? [];
    return {
      gold: entries.filter((e) => e.tier === "GOLD").length,
      silver: entries.filter((e) => e.tier === "SILVER").length,
      bronze: entries.filter((e) => e.tier === "BRONZE").length,
    };
  }, [performance]);

  const topPerformer = (performance?.entries ?? [])[0] ?? null;

  const violationsTotal = violationsSummary?.total ?? 0;
  const violationsPending = violationsSummary?.pendingAppeals ?? 0;
  const violationsByType: { type: string; count: number }[] = (violationsSummary?.byType ?? [])
    .slice()
    .sort((a: any, b: any) => b.count - a.count);

  const trend: { month: string; revenue: number }[] = chainMix?.trend ?? [];
  const trendChartData = trend.map((p) => ({
    month: monthLabel(p.month),
    revenue: Math.round(p.revenue),
    isCurrent: p.month === month,
  }));

  const ordersDailyTrend = useMemo(() => {
    // Aggregate today's daily orders across all stores from revenueByStore.trend
    const lengths = revenueByStore.map((r) => r.trend?.length ?? 0);
    const maxLen = Math.max(0, ...lengths);
    const out: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      let sum = 0;
      for (const r of revenueByStore) sum += r.trend?.[i] ?? 0;
      out.push(sum);
    }
    return out;
  }, [revenueByStore]);

  const topStores = [...revenueByStore]
    .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
    .slice(0, 5);

  const chainSlices: { chainId: string | null; chainName: string; revenue: number; orders: number; share: number }[] =
    chainMix?.current ?? [];

  const branches: any[] = branchPerformance?.branches ?? [];
  const totalUnderperformers = branches.reduce(
    (s, b) => s + (b.underperformerCount ?? 0),
    0,
  );

  const avgRevPerDriverDay = useMemo(() => {
    const today = new Date();
    const monthDate = (() => {
      const [y, m] = month.split("-").map((v) => parseInt(v, 10));
      return new Date(y, m - 1, 1);
    })();
    const isCurrentMonth =
      today.getFullYear() === monthDate.getFullYear() &&
      today.getMonth() === monthDate.getMonth();
    const daysElapsed = isCurrentMonth
      ? today.getDate()
      : new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const driverDays = Math.max(1, totalDriversAll * daysElapsed);
    return metrics.totalRevenue / driverDays;
  }, [metrics.totalRevenue, totalDriversAll, month]);

  const concentrationAlert = chainMix?.concentrationAlert;
  const missingRateCount = revenueByStore.filter((r) => r.orders > 0 && r.rate == null).length;
  const criticalGap = headcountGap.filter((r: any) => r.gap >= 2).length;

  const showAlerts = concentrationAlert || missingRateCount > 0 || criticalGap > 0;

  // Chain palette
  const CHAIN_COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#EF4444"];

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-americana" />
            <h1 className="text-xl font-semibold">{t("americana.overviewTitle")}</h1>
          </div>
          <p className="text-xs text-sand-500 mt-1.5 ml-[22px]">
            {totalDriversAll} drivers · {metrics.activeStores} branches ·{" "}
            {chainSlices.length} chains
            {chainMix?.topChain && (
              <>
                {" · "}top chain{" "}
                <span className="text-sand-700 font-medium">
                  {chainMix.topChain.chainName}
                </span>{" "}
                ({Math.round((chainMix.topChain.share ?? 0) * 100)}%)
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-1.5 text-sm border border-sand-200 rounded-xl bg-white"
          />
          <a
            href={`/api/americana/export?month=${month}`}
            className="px-3 py-1.5 text-sm font-medium border border-sand-200 rounded-xl hover:bg-sand-50 transition-colors"
            target="_blank"
            rel="noreferrer"
          >
            {t("americana.exportForAccounting")}
          </a>
        </div>
      </div>

      {/* Hero KPIs */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-sand-200 bg-white"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HeroKpi
            label={t("americana.revenueMtd")}
            value={metrics.totalRevenue > 0 ? formatCurrency(metrics.totalRevenue, locale) : "—"}
            delta={metrics.revenueDelta}
            spark={trend.map((p) => p.revenue)}
            icon={DollarSign}
          />
          <HeroKpi
            label={t("americana.ordersMtd")}
            value={formatNumber(metrics.totalOrders, locale)}
            delta={metrics.ordersDelta}
            spark={ordersDailyTrend.length > 1 ? ordersDailyTrend : undefined}
            icon={ShoppingBag}
          />
          <HeroKpi
            label={t("americana.activeDrivers")}
            value={
              totalDriversAll > 0
                ? `${activeDriversCount} / ${totalDriversAll}`
                : String(activeDriversCount)
            }
            icon={Users}
            footer={
              tierCounts.gold + tierCounts.silver + tierCounts.bronze > 0 ? (
                <div className="flex items-center gap-1">
                  {tierCounts.gold > 0 && <TierPip tier="GOLD" count={tierCounts.gold} />}
                  {tierCounts.silver > 0 && <TierPip tier="SILVER" count={tierCounts.silver} />}
                  {tierCounts.bronze > 0 && <TierPip tier="BRONZE" count={tierCounts.bronze} />}
                </div>
              ) : (
                <span className="text-[11px] text-sand-500">no scoring yet</span>
              )
            }
          />
          <HeroKpi
            label="Avg / driver-day"
            value={
              avgRevPerDriverDay > 0
                ? formatCurrency(avgRevPerDriverDay, locale)
                : "—"
            }
            icon={Activity}
            footer={
              topPerformer?.driverName ? (
                <span className="text-[11px] text-sand-600 truncate">
                  Top: <span className="text-sand-800 font-medium">{topPerformer.driverName}</span>{" "}
                  · {formatNumber(topPerformer.totalOrders ?? 0, locale)} orders
                </span>
              ) : (
                <span className="text-[11px] text-sand-500">—</span>
              )
            }
          />
        </div>
      )}

      {/* Alerts */}
      {showAlerts && (
        <div className="flex flex-wrap items-center gap-2">
          {concentrationAlert && chainMix?.topChain && (
            <Link
              href="/americana/orders"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100"
            >
              {chainMix.topChain.chainName} ={" "}
              {Math.round((chainMix.topChain.share ?? 0) * 100)}% of revenue
            </Link>
          )}
          {criticalGap > 0 && (
            <Link
              href="/americana/drivers"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium hover:bg-rose-100"
            >
              {criticalGap} {criticalGap === 1 ? "branch" : "branches"} understaffed
            </Link>
          )}
          {missingRateCount > 0 && (
            <Link
              href="/americana/settings/chains"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100"
            >
              {missingRateCount} {missingRateCount === 1 ? "store" : "stores"} missing rates
            </Link>
          )}
        </div>
      )}

      {/* Revenue trend + Chain mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Revenue trend"
          hint="Last 6 months · KD"
          href="/americana/orders"
          className="lg:col-span-2"
        >
          {trendChartData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendChartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AMERICANA} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={AMERICANA} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#8b8675", fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#8b8675", fontSize: 11 }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ stroke: "#cfc9b8", strokeWidth: 1 }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e0d2",
                      fontSize: 12,
                      padding: "8px 10px",
                    }}
                    formatter={(v: any) => [`${formatCurrency(Number(v), locale)}`, "Revenue"]}
                    labelStyle={{ color: "#67614f", fontWeight: 500, marginBottom: 4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={AMERICANA}
                    strokeWidth={2}
                    fill="url(#rev-grad)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-xs text-sand-500">
              No trend data
            </div>
          )}
        </SectionCard>

        <SectionCard title="Chain mix" hint={`This month · ${chainSlices.length} chains`}>
          {chainSlices.length > 0 ? (
            <div className="space-y-4 mt-1">
              {chainSlices.map((c, i) => (
                <HBar
                  key={c.chainId ?? c.chainName}
                  label={c.chainName}
                  value={c.revenue}
                  max={chainSlices[0]?.revenue ?? 1}
                  meta={
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {Math.round((c.share ?? 0) * 100)}%
                      </span>
                      <span className="text-sand-400">·</span>
                      <span className="tabular-nums">{formatNumber(c.orders, locale)} ord</span>
                    </span>
                  }
                  color={CHAIN_COLORS[i % CHAIN_COLORS.length]}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-sand-500 py-6 text-center">No chain data</p>
          )}
        </SectionCard>
      </div>

      {/* Top stores + Branch performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="Top stores by revenue"
          hint="This month · click to drill in"
          href="/americana/branch-performance"
        >
          {topStores.length > 0 ? (
            <ul className="divide-y divide-sand-100">
              {topStores.map((s, idx) => {
                const max = topStores[0]?.revenue ?? 1;
                const fillPct = max > 0 ? Math.max(2, Math.round(((s.revenue ?? 0) / max) * 100)) : 0;
                return (
                  <li key={s.storeId ?? s.storeName} className="py-3 first:pt-1 last:pb-1">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold text-sand-500 tabular-nums w-5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-sand-900 dark:text-foreground truncate">
                              {s.storeName}
                            </p>
                            <p className="text-[11px] text-sand-500 truncate">
                              {s.chainName}
                              {s.area ? ` · ${s.area}` : ""} · {s.drivers}{" "}
                              {s.drivers === 1 ? "driver" : "drivers"}
                            </p>
                          </div>
                          <div className="text-right whitespace-nowrap">
                            <p className="text-sm font-semibold text-sand-900 dark:text-foreground tabular-nums">
                              {s.revenue != null ? formatCurrency(s.revenue, locale) : "—"}
                            </p>
                            <div className="flex items-center justify-end gap-2 mt-0.5">
                              <span className="text-[11px] text-sand-500 tabular-nums">
                                {formatNumber(s.orders, locale)} ord
                              </span>
                              <MoMChip delta={s.deltaPct} compact />
                            </div>
                          </div>
                        </div>
                        <div className="h-1 bg-sand-100 dark:bg-sand-900/40 rounded-full overflow-hidden mt-2">
                          <div
                            className="h-full bg-americana rounded-full"
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-sand-500 py-8 text-center">No stores active this month</p>
          )}
        </SectionCard>

        <SectionCard
          title="Branch performance"
          hint={
            branches.length > 0
              ? `${totalUnderperformers} ${
                  totalUnderperformers === 1 ? "driver" : "drivers"
                } below 80% of branch avg`
              : "Need ≥2 drivers per branch to compare"
          }
          href="/americana/branch-performance"
        >
          {branches.length > 0 ? (
            <ul className="space-y-3">
              {branches.slice(0, 5).map((b: any) => {
                const avg = b.avgOrdersPerDriver ?? 0;
                const driversList: any[] = b.drivers ?? [];
                const issues = b.underperformerCount ?? 0;
                return (
                  <li key={b.storeId} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-sand-900 dark:text-foreground truncate">
                          {b.storeName}
                        </p>
                        <p className="text-[11px] text-sand-500 truncate">
                          {b.chainName}
                          {b.area ? ` · ${b.area}` : ""} · {b.driverCount}{" "}
                          {b.driverCount === 1 ? "driver" : "drivers"} · avg{" "}
                          {formatNumber(Math.round(avg), locale)} ord
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1",
                          issues > 0
                            ? "bg-rose-50 text-rose-700 ring-rose-200"
                            : "bg-emerald-50 text-emerald-700 ring-emerald-200",
                        )}
                      >
                        {issues > 0 ? `${issues} below avg` : "all on target"}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {driversList.map((d) => {
                        const pctOfAvg = d.pctOfBranchAvg ?? 0;
                        const w = Math.max(8, Math.min(100, Math.round(pctOfAvg * 100)));
                        const color = d.isUnderperforming ? "#F43F5E" : AMERICANA;
                        return (
                          <div
                            key={d.driverId}
                            className="flex-1 h-1.5 bg-sand-100 dark:bg-sand-900/40 rounded-full overflow-hidden"
                            title={`${d.driverName} — ${formatNumber(
                              d.totalOrders,
                              locale,
                            )} orders (${Math.round(pctOfAvg * 100)}% of branch avg)`}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${w}%`, backgroundColor: color }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-sand-500 py-8 text-center">
              No comparable branches yet
            </p>
          )}
        </SectionCard>
      </div>

      {/* Violations + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Violations"
          hint={
            violationsTotal > 0
              ? `${violationsTotal} total · ${violationsPending} pending appeals`
              : "No violations recorded"
          }
          href="/americana/violations"
          className="lg:col-span-2"
        >
          {violationsByType.length > 0 ? (
            <div className="space-y-4 mt-1">
              {violationsByType.slice(0, 4).map((v) => (
                <HBar
                  key={v.type}
                  label={VIOLATION_LABEL[v.type] ?? v.type.replace(/_/g, " ").toLowerCase()}
                  value={v.count}
                  max={violationsByType[0].count}
                  suffix={v.count === 1 ? "case" : "cases"}
                  color="#F43F5E"
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <ShieldAlert size={20} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-xs text-sand-500">No violations recorded this period</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Quick actions" hint="Jump to a tab">
          <div className="grid grid-cols-2 gap-2 mt-1">
            <QuickAction href="/americana/drivers" icon={Users} label="Drivers" />
            <QuickAction href="/americana/orders" icon={ShoppingBag} label="Orders" />
            <QuickAction href="/americana/shifts" icon={CalendarDays} label="Shifts" />
            <QuickAction href="/americana/violations" icon={ShieldAlert} label="Violations" />
            <QuickAction
              href="/americana/branch-performance"
              icon={BarChart3}
              label="Branches"
            />
            <QuickAction href="/americana/settings" icon={Settings2} label="Settings" />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: any;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 px-3 py-2.5 rounded-xl border border-sand-200 hover:border-primary/30 hover:bg-sand-50 transition-colors text-xs font-medium text-sand-700"
    >
      <Icon size={14} className="text-sand-500 group-hover:text-primary transition-colors" />
      <span>{label}</span>
      <ChevronRight size={12} className="ml-auto text-sand-400 group-hover:text-primary transition-colors" />
    </Link>
  );
}
