"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useApiGet } from "@/hooks/useApi";
import StatCard from "@/components/shared/StatCard";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Info,
  TrendingDown,
  Users,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { formatNumber } from "@/i18n/format";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface DriverRow {
  driverId: string;
  driverName: string;
  empId: string | null;
  position: string | null;
  totalOrders: number;
  pctOfBranchAvg: number;
  deltaFromAvg: number;
  isUnderperforming: boolean;
}

interface BranchRow {
  storeId: string;
  storeName: string;
  chainName: string;
  area: string | null;
  driverCount: number;
  totalOrders: number;
  avgOrdersPerDriver: number;
  underperformerCount: number;
  drivers: DriverRow[];
}

interface SingleDriverRow {
  storeId: string;
  storeName: string;
  chainName: string;
  area: string | null;
  driverId: string;
  driverName: string;
  totalOrders: number;
}

interface ApiResponse {
  month: string;
  threshold: number;
  branches: BranchRow[];
  singleDriverBranches: SingleDriverRow[];
}

const THRESHOLD_OPTIONS = [
  { v: 0.7, label: "70%" },
  { v: 0.8, label: "80%" },
  { v: 0.9, label: "90%" },
  { v: 1.0, label: "100%" },
];

function pctBadge(pct: number, threshold: number) {
  const value = `${Math.round(pct * 100)}%`;
  if (pct >= 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700">
        <ArrowUpRight size={12} /> {value}
      </span>
    );
  }
  if (pct < threshold) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-rose-50 text-rose-700">
        <ArrowDownRight size={12} /> {value}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700">
      <ArrowDownRight size={12} /> {value}
    </span>
  );
}

function toCsv(rows: BranchRow[]): string {
  const header = [
    "Branch",
    "Chain",
    "Area",
    "Drivers",
    "Branch Avg Orders",
    "Driver",
    "Emp ID",
    "Position",
    "Total Orders",
    "% of Branch Avg",
    "Underperforming",
  ];
  const lines: string[] = [header.join(",")];
  for (const b of rows) {
    for (const d of b.drivers) {
      lines.push(
        [
          JSON.stringify(b.storeName),
          JSON.stringify(b.chainName),
          JSON.stringify(b.area ?? ""),
          b.driverCount,
          b.avgOrdersPerDriver.toFixed(1),
          JSON.stringify(d.driverName),
          JSON.stringify(d.empId ?? ""),
          d.position ?? "",
          d.totalOrders,
          (d.pctOfBranchAvg * 100).toFixed(1),
          d.isUnderperforming ? "yes" : "no",
        ].join(","),
      );
    }
  }
  return lines.join("\n");
}

export default function AmericanaBranchPerformancePage() {
  const { locale } = useI18n();
  const [month, setMonth] = useState(currentMonth());
  const [threshold, setThreshold] = useState(0.8);
  const [chain, setChain] = useState<string>("");
  const [area, setArea] = useState<string>("");
  const [position, setPosition] = useState<string>("");

  const { data, loading } = useApiGet<ApiResponse>(
    `/api/americana/branch-performance?month=${month}&threshold=${threshold}`,
  );

  const allBranches = data?.branches ?? [];
  const singleDriverBranches = data?.singleDriverBranches ?? [];

  const chains = useMemo(
    () =>
      Array.from(
        new Set([
          ...allBranches.map((b) => b.chainName),
          ...singleDriverBranches.map((b) => b.chainName),
        ]),
      )
        .filter(Boolean)
        .sort(),
    [allBranches, singleDriverBranches],
  );
  const areas = useMemo(
    () =>
      Array.from(
        new Set([
          ...allBranches.map((b) => b.area).filter(Boolean) as string[],
          ...(singleDriverBranches.map((b) => b.area).filter(Boolean) as string[]),
        ]),
      ).sort(),
    [allBranches, singleDriverBranches],
  );

  const branches = useMemo(() => {
    return allBranches
      .filter((b) => !chain || b.chainName === chain)
      .filter((b) => !area || b.area === area)
      .map((b) => {
        if (!position) return b;
        const drivers = b.drivers.filter(
          (d) => (d.position || "").toLowerCase() === position.toLowerCase(),
        );
        const driverCount = drivers.length;
        const totalOrders = drivers.reduce((s, d) => s + d.totalOrders, 0);
        const avg = driverCount > 0 ? totalOrders / driverCount : 0;
        const recomputed = drivers
          .map((d) => ({
            ...d,
            pctOfBranchAvg: avg > 0 ? d.totalOrders / avg : 0,
            deltaFromAvg: d.totalOrders - avg,
            isUnderperforming: avg > 0 && d.totalOrders / avg < threshold,
          }))
          .sort((a, z) => a.totalOrders - z.totalOrders);
        return {
          ...b,
          drivers: recomputed,
          driverCount,
          totalOrders,
          avgOrdersPerDriver: avg,
          underperformerCount: recomputed.filter((d) => d.isUnderperforming).length,
        };
      })
      .filter((b) => b.driverCount >= 2)
      .sort(
        (a, z) =>
          z.underperformerCount - a.underperformerCount ||
          z.driverCount - a.driverCount ||
          a.storeName.localeCompare(z.storeName),
      );
  }, [allBranches, chain, area, position, threshold]);

  const singleFiltered = useMemo(
    () =>
      singleDriverBranches
        .filter((b) => !chain || b.chainName === chain)
        .filter((b) => !area || b.area === area),
    [singleDriverBranches, chain, area],
  );

  const totalUnderperformers = branches.reduce(
    (s, b) => s + b.underperformerCount,
    0,
  );
  const totalDrivers = branches.reduce((s, b) => s + b.driverCount, 0);
  const branchesWithIssues = branches.filter((b) => b.underperformerCount > 0).length;

  const downloadCsv = () => {
    const csv = toCsv(branches);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `americana-underperformers-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-americana" />
          <div>
            <h1 className="text-xl font-semibold">Branch Performance</h1>
            <p className="text-xs text-sand-600 mt-0.5">
              Drivers below their branch's average orders / driver
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-xl bg-white"
          />
          <button
            onClick={downloadCsv}
            disabled={branches.length === 0}
            className="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Underperformers"
          value={loading ? "…" : formatNumber(totalUnderperformers, locale)}
          icon={TrendingDown}
          highlight={totalUnderperformers > 0}
          trend={`< ${Math.round(threshold * 100)}% of branch avg`}
        />
        <StatCard
          title="Branches with issues"
          value={loading ? "…" : `${branchesWithIssues} / ${branches.length}`}
          icon={Building2}
          trend={
            totalDrivers > 0
              ? `Across ${formatNumber(totalDrivers, locale)} drivers`
              : "—"
          }
        />
        <StatCard
          title="Single-driver branches"
          value={loading ? "…" : formatNumber(singleFiltered.length, locale)}
          icon={Info}
          trend="No comparison possible"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-sand-200 rounded-2xl px-4 py-3 shadow-soft">
        <span className="text-xs uppercase tracking-[0.14em] font-medium text-sand-600 mr-1">
          Filter
        </span>
        <select
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="px-3 py-1.5 text-sm border border-sand-200 rounded-xl bg-white"
        >
          <option value="">All chains</option>
          {chains.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="px-3 py-1.5 text-sm border border-sand-200 rounded-xl bg-white"
        >
          <option value="">All areas</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className="px-3 py-1.5 text-sm border border-sand-200 rounded-xl bg-white"
        >
          <option value="">All positions</option>
          <option value="Car">Car</option>
          <option value="Bike">Bike</option>
        </select>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-sand-600 mr-1">Threshold</span>
          {THRESHOLD_OPTIONS.map((opt) => (
            <button
              key={opt.v}
              onClick={() => setThreshold(opt.v)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                threshold === opt.v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-sand-200 bg-white text-sand-700 hover:bg-sand-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Single-driver branches notice */}
      {singleFiltered.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {singleFiltered.length}{" "}
              {singleFiltered.length === 1 ? "branch has" : "branches have"} only one
              driver — no comparison possible
            </p>
            <p className="text-xs text-amber-800/80 mt-1">
              {singleFiltered
                .slice(0, 6)
                .map((b) => `${b.storeName} (${b.driverName})`)
                .join(" · ")}
              {singleFiltered.length > 6 ? ` · +${singleFiltered.length - 6} more` : ""}
            </p>
          </div>
        </div>
      )}

      {/* Branch list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-sand-200 bg-white"
            />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <div className="bg-white border border-sand-200 rounded-2xl p-10 text-center text-sand-600 text-sm shadow-soft">
          No branches with multiple drivers in {month}.
        </div>
      ) : (
        <div className="space-y-4">
          {branches.map((b) => (
            <div
              key={b.storeId}
              className="bg-white border border-sand-200 rounded-2xl shadow-soft overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-sand-100">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display text-lg tracking-tight text-sand-900">
                      {b.storeName}
                    </h2>
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                      {b.chainName}
                    </span>
                    {b.area && (
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-sand-100 text-sand-700">
                        {b.area}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-sand-600 mt-1">
                    <Users size={11} className="inline -mt-0.5 mr-1" />
                    {b.driverCount} drivers · {formatNumber(b.totalOrders, locale)} orders ·
                    avg{" "}
                    <span className="font-medium text-sand-900">
                      {b.avgOrdersPerDriver.toFixed(1)}
                    </span>
                    /driver
                  </p>
                </div>
                {b.underperformerCount > 0 ? (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                    {b.underperformerCount} below {Math.round(threshold * 100)}%
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    All on target
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sand-50/60 text-[11px] uppercase tracking-[0.12em] text-sand-600">
                    <tr>
                      <th className="text-left px-5 py-2 font-medium">Driver</th>
                      <th className="text-left px-3 py-2 font-medium">Emp ID</th>
                      <th className="text-left px-3 py-2 font-medium">Position</th>
                      <th className="text-right px-3 py-2 font-medium">Orders</th>
                      <th className="text-right px-3 py-2 font-medium">vs Avg</th>
                      <th className="text-right px-5 py-2 font-medium">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.drivers.map((d) => (
                      <tr
                        key={d.driverId}
                        className={`border-t border-sand-100 ${
                          d.isUnderperforming ? "bg-rose-50/40" : ""
                        }`}
                      >
                        <td className="px-5 py-2.5">
                          <Link
                            href={`/drivers/${d.driverId}?from=americana`}
                            className="font-medium text-sand-900 hover:text-primary"
                          >
                            {d.driverName}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-sand-600">
                          {d.empId || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-sand-700">
                          {d.position || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatNumber(d.totalOrders, locale)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {pctBadge(d.pctOfBranchAvg, threshold)}
                        </td>
                        <td
                          className={`px-5 py-2.5 text-right tabular-nums ${
                            d.deltaFromAvg < 0 ? "text-rose-700" : "text-emerald-700"
                          }`}
                        >
                          {d.deltaFromAvg >= 0 ? "+" : ""}
                          {d.deltaFromAvg.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
