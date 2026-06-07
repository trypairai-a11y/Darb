"use client";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export interface GapRow {
  storeId: string | null;
  storeName: string;
  chainName: string;
  area: string | null;
  trailing30Orders: number;
  targetPerDriverPerDay: number;
  neededDrivers: number;
  currentDrivers: number;
  gap: number;
  vehicleType: "CAR" | "BIKE";
  recommendation: string;
}

interface Props {
  rows: GapRow[];
}

function gapColor(gap: number) {
  if (gap <= 0) return "bg-green-50 text-green-700";
  if (gap === 1) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

type SortKey = "gap" | "trailing30Orders" | "currentDrivers" | "storeName";

export default function HeadcountGapTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("gap");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv) : (av ?? 0) - (bv ?? 0);
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, dir]);

  const toggle = (k: SortKey) => {
    if (sortKey === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir("desc"); }
  };
  const Icon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown size={12} className="inline text-secondary" /> :
      dir === "asc" ? <ArrowUp size={12} className="inline" /> : <ArrowDown size={12} className="inline" />;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
      <div className="p-5 border-b border-gray-100">
        <h3 className="text-base font-semibold">Headcount vs. demand</h3>
        <p className="text-xs text-secondary mt-0.5">Needed = round((trailing 30-day orders / 30) / target-per-driver-per-day). Red rows first.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-secondary uppercase">
            <tr>
              <th className="text-left p-3 cursor-pointer" onClick={() => toggle("storeName")}>Branch <Icon k="storeName" /></th>
              <th className="text-left p-3">Chain</th>
              <th className="text-left p-3">Area</th>
              <th className="text-left p-3">Vehicle</th>
              <th className="text-right p-3 cursor-pointer" onClick={() => toggle("trailing30Orders")}>30d Orders <Icon k="trailing30Orders" /></th>
              <th className="text-right p-3">Needed</th>
              <th className="text-right p-3 cursor-pointer" onClick={() => toggle("currentDrivers")}>Current <Icon k="currentDrivers" /></th>
              <th className="text-right p-3 cursor-pointer" onClick={() => toggle("gap")}>Gap <Icon k="gap" /></th>
              <th className="text-left p-3">Recommended action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-secondary">No active branches yet.</td></tr>
            ) : sorted.map((r) => (
              <tr key={r.storeId ?? r.storeName} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="p-3 font-medium">{r.storeName}</td>
                <td className="p-3 text-secondary">{r.chainName}</td>
                <td className="p-3 text-secondary">{r.area ?? "—"}</td>
                <td className="p-3 text-secondary">{r.vehicleType === "BIKE" ? "Bike" : "Car"}</td>
                <td className="p-3 text-right font-mono">{r.trailing30Orders.toLocaleString()}</td>
                <td className="p-3 text-right font-mono">{r.neededDrivers}</td>
                <td className="p-3 text-right font-mono">{r.currentDrivers}</td>
                <td className={cn("p-3 text-right font-semibold rounded-md", gapColor(r.gap))}>{r.gap > 0 ? `+${r.gap}` : r.gap}</td>
                <td className="p-3 text-sm">{r.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
