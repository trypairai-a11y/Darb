"use client";
import React, { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import { cleanDriverName } from "@/lib/formatters";
import {
  ArrowUp, ArrowDown, Minus, Store,
} from "lucide-react";

const TALABAT_ZONES = [
  "Ardiya", "Hawally", "Mahboula", "Khairan", "Jahra", "Mutla", "Sabha Al Saleem",
];

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span className="text-xs text-secondary font-mono">-</span>;
  const pctChange = ((current - previous) / previous) * 100;
  const isUp = pctChange > 0;
  const isFlat = Math.abs(pctChange) < 0.5;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium font-mono", {
      "text-green-600": isUp && !isFlat,
      "text-red-500": !isUp && !isFlat,
      "text-secondary": isFlat,
    })}>
      {isFlat ? <Minus size={11} /> : isUp ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {Math.abs(pctChange).toFixed(1)}%
    </span>
  );
}

/* ─── Props ─── */

interface OrderPerformanceTabProps {
  filters: Record<string, string>;
  setFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

/* ─── Main component ─── */

export default function OrderPerformanceTab({ filters, setFilters }: OrderPerformanceTabProps) {
  const [restaurantZone, setRestaurantZone] = useState("");

  const { data: perfSummary } = useApiGet<any>(
    `/api/talabat/orders/summary?dateFrom=${filters.dateFrom || ""}&dateTo=${filters.dateTo || ""}`
  );

  const restaurantParams = new URLSearchParams({ platform: "TALABAT" });
  if (filters.dateFrom) restaurantParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) restaurantParams.set("dateTo", filters.dateTo);
  if (restaurantZone) restaurantParams.set("zone", restaurantZone);
  const { data: topRestaurants } = useApiGet<any[]>(
    `/api/orders/top-restaurants?${restaurantParams}`
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-3 items-center">
        <input
          type="date"
          value={filters.dateFrom || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
        />
        <span className="text-sm text-secondary">to</span>
        <input
          type="date"
          value={filters.dateTo || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "Orders", current: perfSummary?.thisWeek?.deliveries || 0, previous: perfSummary?.lastWeek?.deliveries || 0, format: (v: number) => String(v) },
          { title: "Cash (KD)", current: perfSummary?.thisWeek?.cashKd || 0, previous: perfSummary?.lastWeek?.cashKd || 0, format: (v: number) => v.toFixed(3) },
        ].map((card) => (
          <div key={card.title} className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-medium text-secondary mb-1">{card.title}</p>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-semibold font-mono">{card.format(card.current)}</p>
              <ChangeIndicator current={card.current} previous={card.previous} />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-secondary">Last week:</span>
              <span className="text-xs font-mono text-secondary">{card.format(card.previous)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Top Branches */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Store size={14} className="text-orange-400" />
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide">Top Branches</h3>
          </div>
          <select
            value={restaurantZone}
            onChange={(e) => setRestaurantZone(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white"
          >
            <option value="">All Zones</option>
            {TALABAT_ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>
        {!topRestaurants || topRestaurants.length === 0 ? (
          <p className="text-sm text-secondary py-6 text-center">No restaurant data for this period</p>
        ) : (
          <div className="space-y-2.5">
            {topRestaurants.map((r: any, i: number) => {
              const maxOrders = topRestaurants[0]?.orders || 1;
              const pct = Math.round((r.orders / maxOrders) * 100);
              return (
                <div key={r.restaurantName} className="flex items-center gap-3">
                  <span className="w-5 text-[10px] font-mono text-secondary text-right flex-shrink-0">{i + 1}</span>
                  <div className="w-40 flex-shrink-0">
                    <p className="text-sm font-medium truncate" title={r.restaurantName}>{r.restaurantName}</p>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-full h-6 relative overflow-hidden">
                    <div
                      className="h-6 rounded-full bg-gradient-to-r from-orange-300 to-orange-500 flex items-center justify-end pr-2 transition-all duration-500"
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    >
                      <span className="text-[10px] font-semibold text-white font-mono">{r.orders}</span>
                    </div>
                  </div>
                  <div className="w-16 text-right flex-shrink-0">
                    <p className="text-xs font-mono text-secondary">
                      <span className="font-semibold text-primary">{r.orders}</span>
                      <span className="text-secondary"> ord</span>
                    </p>
                    <p className="text-[10px] font-mono text-secondary">
                      <span className="font-semibold">{r.drivers ?? 0}</span> drv
                    </p>
                  </div>
                  <div className="w-24 text-right flex-shrink-0">
                    <p className="text-xs font-mono text-orange-600">{r.cashKd.toFixed(3)} KD</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-4">All Drivers (by Orders)</h3>
        {(perfSummary?.topEarners || []).length === 0 ? (
          <p className="text-sm text-secondary py-6 text-center">No performance data available for this period</p>
        ) : (
          <div className="space-y-3">
            {(perfSummary?.topEarners || []).map((earner: any, i: number) => {
              const maxDeliveries = perfSummary?.topEarners?.[0]?.deliveries || 1;
              const pct = Math.round((earner.deliveries / maxDeliveries) * 100);
              return (
                <div key={earner.driverId || i} className="flex items-center gap-3">
                  <div className="w-32 flex-shrink-0">
                    <p className="text-sm font-medium truncate">{earner.driverName ? cleanDriverName(earner.driverName) : "\u2014"}</p>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-full h-6 relative overflow-hidden">
                    <div
                      className="h-6 rounded-full bg-gradient-to-r from-orange-400 to-orange-500 flex items-center justify-end pr-2 transition-all duration-500"
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    >
                      <span className="text-[10px] font-semibold text-white font-mono">{earner.deliveries}</span>
                    </div>
                  </div>
                  <div className="w-20 text-right flex-shrink-0">
                    <p className="text-xs font-mono text-orange-600">{(earner.cashKd || 0).toFixed(3)} KD</p>
                    <p className="text-[10px] font-mono text-green-600">{earner.utr != null ? `UTR ${earner.utr}` : "\u2014"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
