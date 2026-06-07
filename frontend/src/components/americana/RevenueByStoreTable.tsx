"use client";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export interface StoreRevenueRow {
  storeId: string | null;
  storeName: string;
  chainId: string | null;
  chainName: string;
  area: string | null;
  orders: number;
  ordersLM: number;
  rate: number | null;
  vehicleType: "CAR" | "BIKE";
  revenue: number | null;
  revenueLM: number | null;
  deltaPct: number | null;
  trend: number[];
  drivers: number;
}

interface Props {
  rows: StoreRevenueRow[];
  loading?: boolean;
  onSelect?: (row: StoreRevenueRow) => void;
}

function formatKD(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(3)} KD`;
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <span className="text-secondary">—</span>;
  const max = Math.max(...values, 1);
  const w = 80, h = 24;
  const pts = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} className="text-americana" />
    </svg>
  );
}

type SortKey = "storeName" | "chainName" | "orders" | "rate" | "revenue" | "revenueLM" | "deltaPct";

export default function RevenueByStoreTable({ rows, loading, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [chainFilter, setChainFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("");

  const chains = useMemo(() => Array.from(new Set(rows.map((r) => r.chainName))).sort(), [rows]);
  const areas = useMemo(() => Array.from(new Set(rows.map((r) => r.area).filter(Boolean) as string[])).sort(), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      (!chainFilter || r.chainName === chainFilter) &&
      (!areaFilter || r.area === areaFilter) &&
      (!vehicleFilter || r.vehicleType === vehicleFilter)
    );
  }, [rows, chainFilter, areaFilter, vehicleFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv) : (av ?? 0) - (bv ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const Icon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown size={12} className="inline text-secondary" /> :
      sortDir === "asc" ? <ArrowUp size={12} className="inline" /> : <ArrowDown size={12} className="inline" />;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <div>
          <h3 className="text-base font-semibold">Revenue by branch (month)</h3>
          <p className="text-xs text-secondary mt-0.5">Margin column available in v2 (DA3).</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <select value={chainFilter} onChange={(e) => setChainFilter(e.target.value)} className="px-2 py-1 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">All chains</option>
            {chains.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className="px-2 py-1 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">All areas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} className="px-2 py-1 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">Car + Bike</option>
            <option value="CAR">Car</option>
            <option value="BIKE">Bike</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-secondary uppercase">
            <tr>
              <th className="text-left p-3 cursor-pointer" onClick={() => toggleSort("storeName")}>Branch <Icon k="storeName" /></th>
              <th className="text-left p-3 cursor-pointer" onClick={() => toggleSort("chainName")}>Chain <Icon k="chainName" /></th>
              <th className="text-right p-3 cursor-pointer" onClick={() => toggleSort("orders")}>Orders <Icon k="orders" /></th>
              <th className="text-right p-3 cursor-pointer" onClick={() => toggleSort("rate")}>Rate <Icon k="rate" /></th>
              <th className="text-right p-3 cursor-pointer" onClick={() => toggleSort("revenue")}>Revenue (month) <Icon k="revenue" /></th>
              <th className="text-right p-3 cursor-pointer" onClick={() => toggleSort("revenueLM")}>Rev LM <Icon k="revenueLM" /></th>
              <th className="text-right p-3 cursor-pointer" onClick={() => toggleSort("deltaPct")}>Δ% <Icon k="deltaPct" /></th>
              <th className="text-left p-3">Trend</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center p-6 text-secondary">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={8} className="text-center p-6 text-secondary">No data for this month yet.</td></tr>
            ) : sorted.map((r) => (
              <tr
                key={r.storeId ?? r.storeName}
                className={cn("border-b border-gray-50 hover:bg-gray-50 transition-colors", onSelect && "cursor-pointer")}
                onClick={() => onSelect?.(r)}
              >
                <td className="p-3 font-medium">{r.storeName}</td>
                <td className="p-3 text-secondary">{r.chainName}</td>
                <td className="p-3 text-right font-mono">{r.orders.toLocaleString()}</td>
                <td className="p-3 text-right font-mono">{r.rate != null ? r.rate.toFixed(3) : <span className="text-red-500" title="No applicable rate">—</span>}</td>
                <td className="p-3 text-right font-mono font-semibold">{formatKD(r.revenue)}</td>
                <td className="p-3 text-right font-mono text-secondary">{formatKD(r.revenueLM)}</td>
                <td className={cn("p-3 text-right font-medium", r.deltaPct != null && r.deltaPct >= 0 ? "text-green-600" : r.deltaPct != null ? "text-red-600" : "text-secondary")}>
                  {r.deltaPct == null ? "—" : `${r.deltaPct > 0 ? "+" : ""}${r.deltaPct.toFixed(1)}%`}
                </td>
                <td className="p-3"><Sparkline values={r.trend} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
