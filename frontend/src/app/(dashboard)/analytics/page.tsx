"use client";
import { useApiGet } from "@/hooks/useApi";
import StatCard from "@/components/shared/StatCard";
import PlatformBadge from "@/components/shared/PlatformBadge";
import { cn } from "@/lib/cn";
import { downloadBlob } from "@/utils/downloadBlob";
import InsightBanner from "@/components/shared/InsightBanner";
import {
  Users, Package, DollarSign, ShieldCheck,
  TrendingUp, TrendingDown, Minus,
  Zap, FileText, Play, Download,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface PlatformBreakdown {
  platform: string;
  drivers: number;
  ordersToday: number;
  ordersWeek: number;
  avgOrdersPerDriver: number;
  activeRate: number;
}

interface FleetOverview {
  totalDrivers: number;
  activeDrivers: number;
  totalOrdersToday: number;
  totalOrdersThisWeek: number;
  platformBreakdown: PlatformBreakdown[];
  cashPending: { total: number; overdue: number };
  violationScore: number;
  alerts: { active: number; critical: number };
}

interface PlatformComparison {
  platform: string;
  drivers: number;
  ordersPerDriverPerDay: number;
  revenuePerOrder: number;
  violationRate: number;
  attendanceRate: number;
  avgShiftHours: number;
}

interface TopPerformer {
  rank: number;
  driverId: string;
  name: string;
  platform: string;
  compositeScore: number;
  trend: "UP" | "DOWN" | "STABLE";
}

// ─── Platform Styling ───────────────────────────────────

const PLATFORM_STYLES: Record<string, { dot: string; border: string; bg: string }> = {
  KEETA:      { dot: "bg-keeta",      border: "border-keeta/30",      bg: "bg-keeta/5" },
  TALABAT:    { dot: "bg-talabat",    border: "border-talabat/30",    bg: "bg-talabat/5" },
  DELIVEROO:  { dot: "bg-deliveroo",  border: "border-deliveroo/30",  bg: "bg-deliveroo/5" },
  AMERICANA:  { dot: "bg-americana",  border: "border-americana/30",  bg: "bg-americana/5" },
};

// ─── Helpers ────────────────────────────────────────────

function bestInColumn(rows: PlatformComparison[], key: keyof PlatformComparison): string {
  if (rows.length === 0) return "";
  let best = rows[0];
  for (const r of rows) {
    if ((r[key] as number) > (best[key] as number)) best = r;
  }
  return best.platform;
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "UP") return <TrendingUp size={14} className="text-green-500" />;
  if (trend === "DOWN") return <TrendingDown size={14} className="text-red-500" />;
  return <Minus size={14} className="text-gray-400" />;
}

// ─── Page ───────────────────────────────────────────────

export default function AnalyticsPage() {
  const { data: overview, loading: loadingOverview } = useApiGet<FleetOverview>("/api/analytics/fleet-overview");
  const { data: comparison, loading: loadingComparison } = useApiGet<PlatformComparison[]>("/api/analytics/platform-comparison");
  const { data: performers, loading: loadingPerformers } = useApiGet<TopPerformer[]>("/api/analytics/top-performers");

  const platforms = overview?.platformBreakdown || [];
  const comparisonData = comparison || [];

  // Determine best values for highlighting
  const bestDrivers = bestInColumn(comparisonData, "drivers");
  const bestOrders = bestInColumn(comparisonData, "ordersPerDriverPerDay");
  const bestShift = bestInColumn(comparisonData, "avgShiftHours");
  const bestAttendance = bestInColumn(comparisonData, "attendanceRate");
  const bestViolation = bestInColumn(comparisonData, "violationRate");

  return (
    <div className="space-y-8 w-full max-w-none">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Fleet Analytics</h1>
        <p className="text-sm text-secondary mt-1">Cross-Platform Overview</p>
      </div>

      {/* AI Insights */}
      <InsightBanner context="analytics" maxInsights={3} />

      {/* Platform Comparison Cards */}
      <div className="grid grid-cols-4 gap-4">
        {(["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"] as const).map((key) => {
          const p = platforms.find((b) => b.platform === key);
          const style = PLATFORM_STYLES[key];
          return (
            <div
              key={key}
              className={cn(
                "rounded-2xl p-5 border transition-all duration-200 hover:shadow-md",
                style.border,
                style.bg
              )}
            >
              <div className="flex items-center gap-2 mb-4">
                <span className={cn("w-2.5 h-2.5 rounded-full", style.dot)} />
                <span className="text-sm font-semibold text-foreground">{key}</span>
              </div>
              {loadingOverview ? (
                <div className="space-y-2">
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-20" />
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-16" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-secondary">Drivers</span>
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {p?.drivers || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-secondary">Orders Today</span>
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {p?.ordersToday || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-secondary">Avg/Driver</span>
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {p?.avgOrdersPerDriver?.toFixed(1) || "0.0"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-secondary">Active Rate</span>
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {p ? (p.activeRate * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fleet KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Drivers"
          value={overview?.totalDrivers || 0}
          icon={Users}
        />
        <StatCard
          title="Orders This Week"
          value={overview?.totalOrdersThisWeek?.toLocaleString() || "0"}
          icon={Package}
        />
        <StatCard
          title="Cash Pending"
          value={`KD ${Number(overview?.cashPending?.total || 0).toFixed(0)}`}
          icon={DollarSign}
          highlight={(overview?.cashPending?.total || 0) > 1000}
        />
        <StatCard
          title="Violation Score"
          value={`${overview?.violationScore || 0}%`}
          icon={ShieldCheck}
        />
      </div>

      {/* Platform Comparison Table */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Platform Comparison</h2>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Platform</th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">Drivers</th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">Avg Orders/Day</th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">Avg Shift Hours</th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">Attendance Rate</th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">Violation</th>
              </tr>
            </thead>
            <tbody>
              {loadingComparison ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-sm text-secondary">Loading...</td>
                </tr>
              ) : comparisonData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-sm text-secondary">No data available</td>
                </tr>
              ) : (
                comparisonData.map((row) => (
                  <tr key={row.platform} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "w-2 h-2 rounded-full",
                          PLATFORM_STYLES[row.platform]?.dot || "bg-gray-300"
                        )} />
                        <span className="text-sm font-medium text-foreground">{row.platform}</span>
                      </div>
                    </td>
                    <td className={cn(
                      "text-right px-5 py-3 text-sm font-mono",
                      row.platform === bestDrivers ? "text-green-600 font-semibold" : "text-foreground"
                    )}>
                      {row.drivers}
                    </td>
                    <td className={cn(
                      "text-right px-5 py-3 text-sm font-mono",
                      row.platform === bestOrders ? "text-green-600 font-semibold" : "text-foreground"
                    )}>
                      {row.ordersPerDriverPerDay.toFixed(1)}
                    </td>
                    <td className={cn(
                      "text-right px-5 py-3 text-sm font-mono",
                      row.platform === bestShift ? "text-green-600 font-semibold" : "text-foreground"
                    )}>
                      {row.avgShiftHours.toFixed(1)}h
                    </td>
                    <td className={cn(
                      "text-right px-5 py-3 text-sm font-mono",
                      row.platform === bestAttendance ? "text-green-600 font-semibold" : "text-foreground"
                    )}>
                      {row.attendanceRate}%
                    </td>
                    <td className={cn(
                      "text-right px-5 py-3 text-sm font-mono",
                      row.platform === bestViolation ? "text-green-600 font-semibold" : "text-foreground"
                    )}>
                      {row.violationRate}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Performers Leaderboard */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Top Performers</h2>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loadingPerformers ? (
            <div className="p-8 text-center text-sm text-secondary">Loading...</div>
          ) : !performers || performers.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary">No AI scores available yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {performers.map((p) => (
                <div
                  key={p.driverId}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors"
                >
                  {/* Rank */}
                  <span className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0",
                    p.rank <= 3 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"
                  )}>
                    {p.rank}
                  </span>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  </div>

                  {/* Platform Badge */}
                  <PlatformBadge platform={p.platform} />

                  {/* Score Bar */}
                  <div className="w-32 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${p.compositeScore}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-semibold text-foreground w-7 text-right">
                      {p.compositeScore}
                    </span>
                  </div>

                  {/* Trend */}
                  <TrendIcon trend={p.trend} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl shadow-sm border border-gray-100 text-sm font-medium text-foreground hover:shadow-md hover:border-gray-200 transition-all duration-200">
            <Play size={16} className="text-primary" />
            Run Rules Engine
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl shadow-sm border border-gray-100 text-sm font-medium text-foreground hover:shadow-md hover:border-gray-200 transition-all duration-200">
            <Zap size={16} className="text-primary" />
            Generate AI Digest
          </button>
          <button
            onClick={() => downloadBlob("/api/analytics/export/platform-comparison", "platform-comparison.xlsx").catch(console.error)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl shadow-sm border border-gray-100 text-sm font-medium text-foreground hover:shadow-md hover:border-gray-200 transition-all duration-200"
          >
            <FileText size={16} className="text-primary" />
            Export Platform Report
          </button>
          <button
            onClick={() => downloadBlob("/api/analytics/export/top-performers", "top-performers.xlsx").catch(console.error)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl shadow-sm border border-gray-100 text-sm font-medium text-foreground hover:shadow-md hover:border-gray-200 transition-all duration-200"
          >
            <Download size={16} className="text-primary" />
            Export Top Performers
          </button>
        </div>
      </div>
    </div>
  );
}
