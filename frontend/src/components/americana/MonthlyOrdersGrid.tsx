"use client";
import { useMemo } from "react";
import { cn } from "@/lib/cn";

export interface MonthlyRow {
  month: string;            // "YYYY-MM"
  storeName: string | null;
  chainName: string | null;
  position: string | null;
  totalOrders: number;
  dailyOrders: Record<string, number>;
}

interface Props {
  rows: MonthlyRow[];
  loading?: boolean;
}

function colorForVolume(v: number, max: number) {
  if (v === 0) return "bg-gray-50";
  const ratio = Math.min(1, v / Math.max(1, max));
  if (ratio > 0.75) return "bg-americana text-white";
  if (ratio > 0.5) return "bg-americana/70 text-white";
  if (ratio > 0.25) return "bg-americana/40 text-white";
  return "bg-americana/20";
}

export default function MonthlyOrdersGrid({ rows, loading }: Props) {
  const daysInMonth = (ym: string) => {
    const [y, m] = ym.split("-").map((v) => parseInt(v, 10));
    return new Date(y, m, 0).getDate();
  };

  const maxVol = useMemo(() => {
    let max = 0;
    for (const r of rows) {
      for (const v of Object.values(r.dailyOrders ?? {})) {
        max = Math.max(max, Number(v) || 0);
      }
    }
    return max || 1;
  }, [rows]);

  if (loading) return <div className="text-sm text-secondary p-6">Loading…</div>;
  if (rows.length === 0) return <div className="text-sm text-secondary p-6">No Americana activity for this driver yet.</div>;

  return (
    <div className="space-y-5">
      {rows.map((r) => {
        const days = daysInMonth(r.month);
        return (
          <div key={r.month} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold">{r.month}</p>
                <p className="text-xs text-secondary">
                  {r.chainName ? `${r.chainName} · ${r.storeName ?? ""}` : "Branch unknown"}
                  {r.position ? ` · ${r.position}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-secondary">Total</p>
                <p className="text-base font-semibold">{r.totalOrders.toLocaleString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-[repeat(31,minmax(22px,1fr))] gap-1">
              {Array.from({ length: days }, (_, i) => {
                const key = String(i + 1).padStart(2, "0");
                const v = Number(r.dailyOrders?.[key] ?? 0);
                return (
                  <div
                    key={key}
                    title={`Day ${i + 1}: ${v}`}
                    className={cn(
                      "aspect-square rounded text-[10px] flex items-center justify-center font-mono",
                      colorForVolume(v, maxVol)
                    )}
                  >
                    {v > 0 ? v : ""}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
