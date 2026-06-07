"use client";
import Link from "next/link";
import { useApiGet } from "@/hooks/useApi";
import StatCard from "@/components/shared/StatCard";
import PlatformBadge from "@/components/shared/PlatformBadge";
import {
  Users, CheckCircle2, DollarSign, AlertTriangle, CheckCircle,
  Sparkles, ChevronDown, ChevronUp, RefreshCw, ArrowRight, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import InsightBanner from "@/components/shared/InsightBanner";
import { cn } from "@/lib/cn";
import { useState, useMemo } from "react";
import api from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { formatCurrencyCompact, formatDate, formatDateTime } from "@/i18n/format";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceDot } from "recharts";

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  createdAt: string;
  driver?: { name: string; platform: string };
  status: string;
}

interface Driver {
  id: string;
  name: string;
  phone: string;
  platform: string;
  companyId: string;
  photoUrl?: string | null;
  status: string;
  company?: { id: string; name: string };
}

interface Company {
  id: string;
  name: string;
  platform: string;
}

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-yellow-500",
  LOW: "bg-gray-400",
};
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const PLATFORM_COLORS: Record<string, { line: string }> = {
  KEETA:     { line: "#F59E0B" },
  TALABAT:   { line: "#EF4444" },
  DELIVEROO: { line: "#10B981" },
  AMERICANA: { line: "#3B82F6" },
};

function ymd(d: Date) { return d.toLocaleDateString("en-CA"); }

export default function OverviewPage() {
  const { t, locale } = useI18n();
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [companyId, setCompanyId] = useState<string>("ALL");

  const today = new Date();
  const todayStr = ymd(today);
  const ydayDate = new Date(today); ydayDate.setDate(ydayDate.getDate() - 1);
  const ydayStr = ymd(ydayDate);

  // Calendar-month boundaries
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const companyParam = companyId !== "ALL" ? `&companyId=${companyId}` : "";
  const companyOnlyParam = companyId !== "ALL" ? `?companyId=${companyId}` : "";

  const { data: companiesData } = useApiGet<{ data: Company[] } | Company[]>("/api/companies");
  const { data: driversData } = useApiGet<{ data: Driver[]; pagination: { total: number } }>(
    `/api/drivers?limit=500${companyParam}`,
  );
  const { data: alertsData } = useApiGet<{ data: Alert[]; pagination: any }>("/api/alerts?status=ACTIVE&limit=50");
  const { data: digest, refetch: refetchDigest } = useApiGet<any>("/api/ai/digest");
  const { data: cashData } = useApiGet<any>(`/api/cash?status=PENDING&limit=500${companyParam}`);
  const { data: shiftsCompleted } = useApiGet<{ pagination: { total: number } }>(
    `/api/shifts?status=COMPLETED&dateFrom=${todayStr}&dateTo=${todayStr}&limit=1${companyParam}`,
  );
  const { data: shiftsTotalToday } = useApiGet<{ pagination: { total: number } }>(
    `/api/shifts?dateFrom=${todayStr}&dateTo=${todayStr}&limit=1${companyParam}`,
  );
  const { data: ordersToday } = useApiGet<any>(`/api/orders/summary?dateFrom=${todayStr}&dateTo=${todayStr}${companyParam}`);
  const { data: ordersYesterday } = useApiGet<any>(`/api/orders/summary?dateFrom=${ydayStr}&dateTo=${ydayStr}${companyParam}`);
  const { data: attendanceSummary } = useApiGet<any>(`/api/attendance/summary${companyOnlyParam}`);

  // Total violations across all platforms (lifetime, tenant-scoped)
  const { data: violationsSummary } = useApiGet<{ total: number }>("/api/violations/summary");

  // Per-platform daily aggregates: this month + last month (server-aggregated)
  const { data: ordersThisMonth } = useApiGet<{ data: any[] }>(
    `/api/orders/daily-by-platform?dateFrom=${ymd(monthStart)}&dateTo=${todayStr}${companyParam}`,
  );
  const { data: ordersLastMonth } = useApiGet<{ data: any[] }>(
    `/api/orders/daily-by-platform?dateFrom=${ymd(lastMonthStart)}&dateTo=${ymd(lastMonthEnd)}${companyParam}`,
  );

  // KPI summary: this month + last month
  const kpiCompanyParam = companyId !== "ALL" ? `&companyId=${companyId}` : "";
  const { data: kpiThisMonth } = useApiGet<{ overallScore: number }>(
    `/api/kpi/summary?dateFrom=${ymd(monthStart)}&dateTo=${todayStr}${kpiCompanyParam}`,
  );
  const { data: kpiLastMonth } = useApiGet<{ overallScore: number }>(
    `/api/kpi/summary?dateFrom=${ymd(lastMonthStart)}&dateTo=${ymd(lastMonthEnd)}${kpiCompanyParam}`,
  );

  const handleRefreshDigest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    try {
      await api.post("/api/ai/digest/generate");
      await refetchDigest();
    } catch {
      // silently fail
    } finally {
      setRefreshing(false);
    }
  };

  const companies: Company[] = Array.isArray(companiesData)
    ? companiesData
    : (companiesData as any)?.data ?? [];

  const allDrivers: Driver[] = driversData?.data ?? [];
  const totalDrivers = driversData?.pagination?.total ?? allDrivers.length;
  const alerts = alertsData?.data || [];
  const completedToday = shiftsCompleted?.pagination?.total || 0;
  const totalShiftsToday = shiftsTotalToday?.pagination?.total || 0;
  const pendingCash = (cashData?.data || []).reduce(
    (s: number, r: any) => s + Number(r.pendingDues || 0),
    0,
  );
  const totalViolations = violationsSummary?.total ?? 0;

  // Order counts (today vs yesterday)
  const todayOrderCount = Number(ordersToday?.totalDeliveries ?? 0);
  const ydayOrderCount = Number(ordersYesterday?.totalDeliveries ?? 0);
  const dodPct = ydayOrderCount > 0
    ? Math.round(((todayOrderCount - ydayOrderCount) / ydayOrderCount) * 100)
    : null;

  // Overall KPI score: this month vs last
  const kpiScoreNow = kpiThisMonth?.overallScore != null ? Math.round(Number(kpiThisMonth.overallScore)) : null;
  const kpiScoreLast = kpiLastMonth?.overallScore != null ? Math.round(Number(kpiLastMonth.overallScore)) : null;
  const kpiDeltaPct = kpiScoreNow != null && kpiScoreLast != null && kpiScoreLast > 0
    ? Math.round(((kpiScoreNow - kpiScoreLast) / kpiScoreLast) * 100)
    : null;

  const presentRate = useMemo(() => {
    const present = attendanceSummary?.present ?? 0;
    const total = (attendanceSummary?.present ?? 0) + (attendanceSummary?.late ?? 0) + (attendanceSummary?.absent ?? 0);
    return total > 0 ? Math.round((present / total) * 100) : null;
  }, [attendanceSummary]);

  const sortedAlerts = useMemo(() => {
    return [...alerts].sort(
      (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
    );
  }, [alerts]);
  const visibleAlerts = showAllAlerts ? sortedAlerts : sortedAlerts.slice(0, 5);

  const headline = useMemo(() => {
    if (alerts.length === 0) return "Quiet morning. All systems green.";
    const critical = alerts.filter((a) => a.severity === "CRITICAL").length;
    if (critical > 0) return `${critical} critical alert${critical > 1 ? "s" : ""} need your attention.`;
    if (alerts.length >= 10) return `Active morning — ${alerts.length} alerts to triage.`;
    return `Steady morning. ${alerts.length} alert${alerts.length > 1 ? "s" : ""} open.`;
  }, [alerts]);

  // Per-platform charts: total this month vs last month + daily series (overlaid)
  const platformCharts = useMemo(() => {
    const platforms = ["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"];
    const tm = ordersThisMonth?.data || [];
    const lm = ordersLastMonth?.data || [];
    const lastMonthDays = lastMonthEnd.getDate();

    return platforms.map((platform) => {
      const tmRows = tm.filter((r: any) => r.platform === platform);
      const lmRows = lm.filter((r: any) => r.platform === platform);
      const tmTotal = tmRows.reduce((s: number, r: any) => s + (r.orderCount || 0), 0);
      const lmTotal = lmRows.reduce((s: number, r: any) => s + (r.orderCount || 0), 0);
      const change = lmTotal > 0 ? Math.round(((tmTotal - lmTotal) / lmTotal) * 100) : null;
      const driverCount = allDrivers.filter((d) => d.platform === platform && d.status === "ACTIVE").length;
      const avgPerDriver = driverCount > 0 ? Math.round(tmTotal / driverCount) : null;

      // Index both months by day-of-month so they align on the same x-axis
      const tmByDom = new Map<number, number>();
      for (const r of tmRows) {
        const dom = new Date(r.date).getUTCDate();
        tmByDom.set(dom, (tmByDom.get(dom) || 0) + (r.orderCount || 0));
      }
      const lmByDom = new Map<number, number>();
      for (const r of lmRows) {
        const dom = new Date(r.date).getUTCDate();
        lmByDom.set(dom, (lmByDom.get(dom) || 0) + (r.orderCount || 0));
      }

      const todayDom = today.getDate();
      const maxDom = Math.max(lastMonthDays, todayDom);
      const series: { day: number; thisMonth: number | null; lastMonth: number | null }[] = [];
      for (let d = 1; d <= maxDom; d++) {
        series.push({
          day: d,
          thisMonth: d <= todayDom ? (tmByDom.get(d) || 0) : null,
          lastMonth: d <= lastMonthDays ? (lmByDom.get(d) || 0) : null,
        });
      }
      return { platform, tmTotal, lmTotal, change, series, avgPerDriver, driverCount };
    });
  }, [ordersThisMonth, ordersLastMonth, lastMonthEnd, today, allDrivers]);

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Company filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <FilterChip active={companyId === "ALL"} onClick={() => setCompanyId("ALL")}>
          All Companies
        </FilterChip>
        {companies.map((c) => (
          <FilterChip key={c.id} active={companyId === c.id} onClick={() => setCompanyId(c.id)}>
            {c.name}
          </FilterChip>
        ))}
      </div>

      {/* Morning Briefing */}
      {digest && (
        <div className="bg-gradient-to-r from-primary/5 to-blue-50 rounded-2xl p-5 border border-primary/10">
          <button
            onClick={() => setBriefingOpen(!briefingOpen)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">{t("overview.morningBriefing")}</span>
              <span className="text-[10px] text-secondary">
                {digest.date ? formatDate(digest.date, locale) : t("labels.today")}
              </span>
              <button
                onClick={handleRefreshDigest}
                disabled={refreshing}
                className="ms-1 p-1 rounded-lg hover:bg-primary/10 transition-colors disabled:opacity-50"
                title={t("overview.regenerateDigest")}
                aria-label={t("overview.regenerateDigest")}
              >
                <RefreshCw size={13} className={cn("text-secondary", refreshing && "animate-spin")} />
              </button>
            </div>
            {briefingOpen ? <ChevronUp size={16} className="text-secondary" /> : <ChevronDown size={16} className="text-secondary" />}
          </button>

          {briefingOpen && (
            <div className="mt-3 space-y-3">
              <p className="text-base font-semibold text-foreground leading-snug">{headline}</p>

              <div className="flex flex-wrap gap-2">
                <Chip label="Orders today" value={todayOrderCount.toLocaleString()} trendPct={dodPct} />
                <Chip label="Shifts completed" value={`${completedToday} / ${totalShiftsToday}`} />
                <Chip label="Attendance" value={presentRate != null ? `${presentRate}%` : "—"} />
              </div>

              {digest.content?.recommendations?.length > 0 && (
                <div className="pt-3 border-t border-primary/10">
                  <p className="text-[10px] font-medium text-secondary uppercase mb-1.5">{t("overview.recommendations")}</p>
                  <ul className="space-y-1">
                    {digest.content.recommendations.map((r: string, i: number) => (
                      <li key={i} className="text-xs text-primary flex items-start gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Insights */}
      <InsightBanner context="dashboard" maxInsights={3} />

      {/* KPI Score + Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Link href="/kpis" className="contents">
          <KpiScoreCard scoreNow={kpiScoreNow} scoreLast={kpiScoreLast} deltaPct={kpiDeltaPct} />
        </Link>
        <Link href="/talabat/drivers" className="contents">
          <StatCard title={t("overview.totalDrivers")} value={totalDrivers} icon={Users} />
        </Link>
        <Link href="/attendance" className="contents">
          <StatCard title="Shifts Completed" value={`${completedToday} / ${totalShiftsToday}`} icon={CheckCircle2} />
        </Link>
        <Link href="/talabat/cash" className="contents">
          <StatCard
            title="Overdue Cash"
            value={formatCurrencyCompact(pendingCash, locale)}
            icon={DollarSign}
            highlight={pendingCash > 0}
          />
        </Link>
        <Link href="/talabat/violations" className="contents">
          <StatCard
            title="Total Violations"
            value={totalViolations}
            icon={AlertTriangle}
            highlight={totalViolations > 0}
          />
        </Link>
      </div>

      {/* Per-platform charts — positioned above alerts */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Orders · this month vs last
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {platformCharts.map((p) => (
            <PlatformChartCard key={p.platform} {...p} />
          ))}
        </div>
      </div>

      {/* Alerts */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {t("overview.todaysAlerts")}
            {alerts.length > 0 && (
              <span className="ms-2 text-xs font-medium text-red-600">{alerts.length} open</span>
            )}
          </h2>
          {sortedAlerts.length > 5 && (
            <button
              onClick={() => setShowAllAlerts((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {showAllAlerts ? "Show top 5" : `View all (${sortedAlerts.length})`}
              <ArrowRight size={12} />
            </button>
          )}
        </div>
        {sortedAlerts.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 shadow-sm text-center">
            <CheckCircle size={40} className="mx-auto text-green-400 mb-3" />
            <p className="text-sm font-medium text-foreground">{t("overview.allClear")}</p>
            <p className="text-xs text-secondary mt-1">{t("overview.noActiveAlerts")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleAlerts.map((alert) => (
              <div
                key={alert.id}
                className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-200"
              >
                <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", SEVERITY_DOT[alert.severity])} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="text-xs text-secondary mt-0.5 truncate">{alert.message}</p>
                </div>
                {alert.driver && <PlatformBadge platform={alert.driver.platform} />}
                <span className="text-xs text-secondary whitespace-nowrap">
                  {formatDateTime(alert.createdAt, locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
        active
          ? "bg-gray-900 text-white shadow-sm"
          : "bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-gray-300",
      )}
    >
      {children}
    </button>
  );
}

function Chip({ label, value, trendPct }: { label: string; value: string; trendPct?: number | null }) {
  const TrendIcon = trendPct == null ? null : trendPct > 0 ? TrendingUp : trendPct < 0 ? TrendingDown : Minus;
  const trendColor = trendPct == null ? "" : trendPct > 0 ? "text-green-600" : trendPct < 0 ? "text-red-600" : "text-gray-500";
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/80 backdrop-blur ring-1 ring-primary/10 px-3 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-secondary">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
      {TrendIcon && (
        <span className={cn("inline-flex items-center gap-0.5 text-[11px]", trendColor)}>
          <TrendIcon size={11} />
          {Math.abs(trendPct!)}%
        </span>
      )}
    </span>
  );
}

function KpiScoreCard({ scoreNow, scoreLast, deltaPct }: { scoreNow: number | null; scoreLast: number | null; deltaPct: number | null }) {
  const isUp = deltaPct != null && deltaPct > 0;
  const isDown = deltaPct != null && deltaPct < 0;
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const pillCls = isUp
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : isDown
    ? "bg-red-50 text-red-700 ring-red-100"
    : "bg-gray-50 text-gray-600 ring-gray-100";
  return (
    <div className="group bg-card border border-sand-200 dark:border-border rounded-2xl p-5 shadow-soft transition-all duration-400 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px] cursor-pointer">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-sand-600 mb-3 truncate">Overall KPI Score</p>
          <div className="flex items-baseline gap-2">
            <p className="font-display text-4xl leading-none tracking-tight text-sand-900 dark:text-foreground">
              {scoreNow != null ? `${scoreNow}%` : "—"}
            </p>
            {deltaPct != null && (
              <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1", pillCls)}>
                <TrendIcon size={10} />
                {Math.abs(deltaPct)}%
              </span>
            )}
          </div>
          <p className="text-xs text-sand-600 mt-2.5 truncate">
            {scoreLast != null && scoreLast > 0 ? (
              <>vs <span className="font-medium text-foreground">{scoreLast}%</span> last month</>
            ) : (
              "No data for last month"
            )}
          </p>
        </div>
        <div className="h-9 w-9 shrink-0 rounded-pill bg-sand-100 dark:bg-sand-900/40 flex items-center justify-center text-sand-700 transition-colors duration-400 ease-sierra-out group-hover:bg-primary/10 group-hover:text-primary">
          <TrendingUp size={16} />
        </div>
      </div>
    </div>
  );
}

function PlatformChartCard({ platform, tmTotal, lmTotal, change, series, avgPerDriver, driverCount }:
  { platform: string; tmTotal: number; lmTotal: number; change: number | null; series: { day: number; thisMonth: number | null; lastMonth: number | null }[]; avgPerDriver: number | null; driverCount: number }) {
  const colors = PLATFORM_COLORS[platform] ?? PLATFORM_COLORS.KEETA;
  const isUp = change != null && change > 0;
  const isDown = change != null && change < 0;
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const trendPillCls = isUp
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : isDown
    ? "bg-red-50 text-red-700 ring-red-100"
    : "bg-gray-50 text-gray-600 ring-gray-100";
  const deltaAbs = Math.abs(tmTotal - lmTotal).toLocaleString();
  const deltaSign = isUp ? "+" : isDown ? "−" : "";

  // Last point on the this-month series (the "today" marker)
  const todayPoint = (() => {
    for (let i = series.length - 1; i >= 0; i--) {
      const v = series[i].thisMonth;
      if (v != null) return { day: series[i].day, value: v };
    }
    return null;
  })();
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-700">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: colors.line, boxShadow: `0 0 0 3px ${colors.line}1A` }}
          />
          {platform}
        </span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", trendPillCls)}>
          <TrendIcon size={11} />
          {change == null ? "—" : `${Math.abs(change)}%`}
        </span>
      </div>

      <div className="mb-1">
        <p className="text-[10px] uppercase tracking-wider text-secondary">This month</p>
        <p className="text-[28px] leading-none font-display tracking-tight text-foreground mt-1">
          {tmTotal.toLocaleString()}
        </p>
      </div>
      <p className="text-[11px] text-secondary mb-2">
        {deltaSign && <span className={cn("font-medium", isUp ? "text-emerald-600" : isDown ? "text-red-600" : "text-gray-500")}>
          {deltaSign}{deltaAbs}
        </span>}
        {deltaSign && " vs "}
        <span className="text-gray-500">{lmTotal.toLocaleString()} last month</span>
      </p>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-[11px] uppercase tracking-wider text-secondary">Avg / driver</span>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {avgPerDriver != null ? avgPerDriver.toLocaleString() : "—"}
        </span>
        <span className="text-[10px] text-gray-400">· {driverCount} drivers</span>
      </div>

      <div className="h-20 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 6, right: 6, left: 6, bottom: 2 }}>
            <defs>
              <linearGradient id={`g-${platform}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.line} stopOpacity={0.22} />
                <stop offset="100%" stopColor={colors.line} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`g-lm-${platform}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6B7280" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#6B7280" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" hide />
            <YAxis hide />
            <Tooltip
              cursor={{ stroke: colors.line, strokeOpacity: 0.3, strokeWidth: 1 }}
              contentStyle={{ fontSize: 11, padding: "6px 10px", borderRadius: 10, border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
              labelFormatter={(d) => `Day ${d}`}
              formatter={(v: any, name: any) => {
                if (v == null) return [null, null] as any;
                const label = name === "thisMonth" ? "This month" : "Last month";
                return [`${v} orders`, label];
              }}
            />
            <Area
              type="monotone"
              dataKey="lastMonth"
              stroke="#9CA3AF"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={1}
              fill={`url(#g-lm-${platform})`}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="thisMonth"
              stroke={colors.line}
              strokeWidth={2.25}
              fill={`url(#g-${platform})`}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            {todayPoint && (
              <ReferenceDot
                x={todayPoint.day}
                y={todayPoint.value}
                r={3}
                fill={colors.line}
                stroke="#fff"
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
