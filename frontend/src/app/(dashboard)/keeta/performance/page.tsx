"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import StatCard from "@/components/shared/StatCard";
import { cn } from "@/lib/cn";
import InsightBanner from "@/components/shared/InsightBanner";
import {
  Users,
  CalendarCheck,
  Clock,
  Package,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ChevronLeft,
} from "lucide-react";

/** Safely convert Prisma Decimal (returned as string) to number */
function n(v: any): number {
  return v != null ? Number(v) : 0;
}

/** Format minutes as "Xh Ym" */
function fmtMinutes(mins: any): string {
  const m = Math.round(n(mins));
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

function YesNoBadge({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-50 text-green-600">
      <CheckCircle2 size={11} /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-600">
      <XCircle size={11} /> No
    </span>
  );
}

function OnTimeBar({ rate }: { rate: number }) {
  const pct = Math.min(100, Math.max(0, n(rate)));
  const color =
    pct >= 90 ? "bg-green-400" : pct >= 70 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-20">
        <div
          className={cn("h-1.5 rounded-full", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-secondary font-mono">
        {n(rate).toFixed(1)}%
      </span>
    </div>
  );
}

export default function KeetaPerformancePage() {
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);

  const params = new URLSearchParams({
    dateFrom: date,
    dateTo: date,
    limit: "100",
  });
  if (filters.search) params.set("search", filters.search);

  const { data: summary } = useApiGet<any>(
    `/api/keeta/metrics/summary?dateFrom=${date}&dateTo=${date}`
  );
  const { data, loading } = useApiGet<any>(`/api/keeta/metrics?${params}`);
  const metrics: any[] = data?.data || [];

  const prevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split("T")[0]);
  };

  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().split("T")[0]);
  };

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-keeta" />
        <h1 className="text-xl font-semibold">Keeta - Daily Performance</h1>
        <span className="text-sm text-secondary">Sidra</span>
      </div>

      {/* AI Insights */}
      <InsightBanner context="keeta/performance" platform="KEETA" maxInsights={2} />

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Drivers"
          value={summary?.totalDrivers ?? metrics.length}
          icon={Users}
        />
        <StatCard
          title="Valid Days"
          value={summary?.validDays ?? 0}
          icon={CalendarCheck}
        />
        <StatCard
          title="Avg On-Time Rate"
          value={`${n(summary?.avgOnTimeRate).toFixed(1)}%`}
          icon={Clock}
          highlight={n(summary?.avgOnTimeRate) < 70}
        />
        <StatCard
          title="Total Delivered"
          value={summary?.totalDelivered ?? 0}
          icon={Package}
        />
      </div>

      {/* Date picker & Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
          <button
            onClick={prevDay}
            className="p-1 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm font-medium border-0 focus:outline-none bg-transparent"
          />
          <button
            onClick={nextDay}
            className="p-1 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <FilterBar
          filters={[
            {
              key: "search",
              type: "search",
              label: "Search",
              placeholder: "Search driver...",
            },
          ]}
          values={filters}
          onChange={(k, v) => setFilters({ ...filters, [k]: v })}
        />
      </div>

      {/* Metrics Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">
                  Driver
                </th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">
                  Vehicle
                </th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">
                  On-Shift?
                </th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">
                  Valid Day?
                </th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">
                  Online Time
                </th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">
                  Delivered
                </th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">
                  Accepted
                </th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">
                  On-Time Rate
                </th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">
                  Avg Del. Time
                </th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">
                  Rejected
                </th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">
                  Overdue
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-5 py-12 text-center text-sm text-secondary"
                  >
                    {loading
                      ? "Loading..."
                      : "No performance metrics found for this date"}
                  </td>
                </tr>
              ) : (
                metrics.map((row: any) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-5 py-3 text-sm font-medium">
                      {row.driver?.name || row.driverName || "-"}
                    </td>
                    <td className="px-5 py-3 text-sm text-secondary font-mono">
                      {row.vehiclePlate || row.driver?.vehiclePlate || "-"}
                    </td>
                    <td className="px-5 py-3">
                      <YesNoBadge value={!!row.onShift} />
                    </td>
                    <td className="px-5 py-3">
                      <YesNoBadge value={!!row.validDay} />
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-secondary">
                      {fmtMinutes(row.onlineMinutes)}
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-mono font-medium">
                      {row.deliveredTasks ?? "-"}
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-mono text-secondary">
                      {row.acceptedTasks ?? "-"}
                    </td>
                    <td className="px-5 py-3">
                      <OnTimeBar rate={row.onTimeRate} />
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-mono text-secondary">
                      {row.avgDeliveryTime != null
                        ? `${n(row.avgDeliveryTime).toFixed(0)}m`
                        : "-"}
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-mono">
                      <span
                        className={cn(
                          n(row.rejectedTasks) > 0
                            ? "text-red-500"
                            : "text-secondary"
                        )}
                      >
                        {row.rejectedTasks ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-mono">
                      <span
                        className={cn(
                          n(row.overdueTasks) > 0
                            ? "text-amber-600"
                            : "text-secondary"
                        )}
                      >
                        {row.overdueTasks ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <ChevronRight size={15} className="text-gray-300" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.driver?.name || selected?.driverName || "Driver Detail"}
        subtitle="Keeta / Sidra - Daily Performance"
      >
        {selected && (
          <div className="space-y-5">
            {/* Driver Info Header */}
            <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100">
              <p className="text-xs text-yellow-600 font-medium uppercase tracking-wide mb-1">
                Driver
              </p>
              <p className="text-lg font-semibold text-yellow-800">
                {selected.driver?.name || selected.driverName || "-"}
              </p>
              <p className="text-sm text-yellow-600 font-mono mt-0.5">
                {selected.vehiclePlate || selected.driver?.vehiclePlate || "-"}{" "}
                &middot; {date}
              </p>
            </div>

            {/* Shift & Validity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                <p className="text-[10px] text-secondary uppercase font-medium">
                  On-Shift
                </p>
                <YesNoBadge value={!!selected.onShift} />
              </div>
              <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                <p className="text-[10px] text-secondary uppercase font-medium">
                  Valid Day
                </p>
                <YesNoBadge value={!!selected.validDay} />
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">
                  Online Time
                </p>
                <p className="text-xl font-semibold mt-0.5 font-mono">
                  {fmtMinutes(selected.onlineMinutes)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">
                  Delivered
                </p>
                <p className="text-xl font-semibold mt-0.5 font-mono">
                  {selected.deliveredTasks ?? 0}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">
                  Accepted
                </p>
                <p className="text-xl font-semibold mt-0.5 font-mono">
                  {selected.acceptedTasks ?? 0}
                </p>
              </div>
            </div>

            {/* On-Time Rate */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-secondary font-medium uppercase">
                  On-Time Rate
                </p>
                <span className="text-lg font-semibold font-mono">
                  {n(selected.onTimeRate).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={cn(
                    "h-2.5 rounded-full transition-all",
                    n(selected.onTimeRate) >= 90
                      ? "bg-green-400"
                      : n(selected.onTimeRate) >= 70
                        ? "bg-amber-400"
                        : "bg-red-400"
                  )}
                  style={{
                    width: `${Math.min(100, Math.max(0, n(selected.onTimeRate)))}%`,
                  }}
                />
              </div>
            </div>

            {/* Additional Stats */}
            <div className="grid grid-cols-2 gap-3">
              {[
                [
                  "Avg Delivery Time",
                  selected.avgDeliveryTime != null
                    ? `${n(selected.avgDeliveryTime).toFixed(0)} min`
                    : "-",
                ],
                ["Rejected Tasks", selected.rejectedTasks ?? 0],
                ["Overdue Tasks", selected.overdueTasks ?? 0],
                [
                  "Completion Rate",
                  selected.completionRate != null
                    ? `${n(selected.completionRate).toFixed(1)}%`
                    : "-",
                ],
                [
                  "Acceptance Rate",
                  selected.acceptanceRate != null
                    ? `${n(selected.acceptanceRate).toFixed(1)}%`
                    : "-",
                ],
                ["Date", date],
              ].map(([label, val]) => (
                <div key={label as string} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">
                    {label}
                  </p>
                  <p className="text-sm font-medium mt-0.5 font-mono">{val}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
