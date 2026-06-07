"use client";
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { MOCK_INTEL } from "@/mocks/v2";

export default function IntelligencePage() {
  const [loading, setLoading] = useState(true);
  useEffect(() => { setTimeout(() => setLoading(false), 300); }, []);

  return (
    <div className="w-full max-w-none space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Intelligence</h1>
        <p className="mt-1 text-sm text-secondary">Trends, KPIs, and analytics. Deep reports buried — ask Darb (⌘K) if you need a specific number.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Active drivers" value={loading ? "…" : `${MOCK_INTEL.driverCount}`} />
        <Stat label="Avg composite score" value={loading ? "…" : MOCK_INTEL.avgCompositeScore.toFixed(1)} />
        <Stat label="Top zone by orders" value={loading ? "…" : MOCK_INTEL.topZoneByOrders} />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-secondary">Weekly orders</p>
            <p className="mt-1 text-3xl font-semibold text-foreground">{loading ? "…" : MOCK_INTEL.weeklyOrders.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-1 text-emerald-600">
            <TrendingUp size={16} />
            <span className="text-sm font-medium">{MOCK_INTEL.weeklyOrderTrend}</span>
          </div>
        </div>
        <div className="mt-6 flex h-40 items-end gap-2">
          {[22, 34, 41, 38, 55, 60, 72].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-lg bg-gradient-to-t from-sky-200 to-sky-400" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-secondary">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
