"use client";
import React, { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import { cleanDriverName } from "@/lib/formatters";
import { ArrowUp, ArrowDown, Minus, Store } from "lucide-react";

type PlatformKey = "TALABAT" | "KEETA" | "DELIVEROO" | "AMERICANA";

interface ColorSet {
  /** text accent (e.g. "text-keeta") */
  accent: string;
  /** bar gradient `from-X to-Y` (e.g. "from-yellow-300 to-yellow-500") */
  gradient: string;
  /** focus ring colour for date inputs (e.g. "focus:ring-yellow-200") */
  ring: string;
  /** bottom-right cash text colour (e.g. "text-yellow-600") */
  cashText: string;
}

const PLATFORM_COLORS: Record<PlatformKey, ColorSet> = {
  TALABAT: {
    accent: "text-talabat",
    gradient: "from-orange-300 to-orange-500",
    ring: "focus:ring-orange-200",
    cashText: "text-orange-600",
  },
  KEETA: {
    accent: "text-keeta",
    gradient: "from-yellow-300 to-yellow-500",
    ring: "focus:ring-yellow-200",
    cashText: "text-yellow-600",
  },
  DELIVEROO: {
    accent: "text-deliveroo",
    gradient: "from-teal-300 to-teal-500",
    ring: "focus:ring-teal-200",
    cashText: "text-teal-600",
  },
  AMERICANA: {
    accent: "text-americana",
    gradient: "from-blue-300 to-blue-500",
    ring: "focus:ring-blue-200",
    cashText: "text-blue-600",
  },
};

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span className="text-xs text-secondary font-mono">-</span>;
  const pctChange = ((current - previous) / previous) * 100;
  const isUp = pctChange > 0;
  const isFlat = Math.abs(pctChange) < 0.5;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs font-medium font-mono", {
        "text-green-600": isUp && !isFlat,
        "text-red-500": !isUp && !isFlat,
        "text-secondary": isFlat,
      })}
    >
      {isFlat ? <Minus size={11} /> : isUp ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {Math.abs(pctChange).toFixed(1)}%
    </span>
  );
}

interface PlatformPerformanceTabProps {
  platform: PlatformKey;
  zones: string[];
  filters: Record<string, string>;
  setFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** Override the summary endpoint. Defaults to `/api/orders/summary?platform=...`. */
  summaryEndpoint?: string;
}

export default function PlatformPerformanceTab({
  platform,
  zones,
  filters,
  setFilters,
  summaryEndpoint,
}: PlatformPerformanceTabProps) {
  const [restaurantZone, setRestaurantZone] = useState("");
  const colors = PLATFORM_COLORS[platform];

  const summaryParams = new URLSearchParams({ platform });
  if (filters.dateFrom) summaryParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) summaryParams.set("dateTo", filters.dateTo);
  const { data: perfSummary } = useApiGet<any>(
    `${summaryEndpoint || "/api/orders/summary"}?${summaryParams}`
  );

  const restaurantParams = new URLSearchParams({ platform });
  if (filters.dateFrom) restaurantParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) restaurantParams.set("dateTo", filters.dateTo);
  if (restaurantZone) restaurantParams.set("zone", restaurantZone);
  const { data: topRestaurants } = useApiGet<any[]>(
    `/api/orders/top-restaurants?${restaurantParams}`
  );

  const ordersThisWeek = perfSummary?.thisWeek?.deliveries ?? perfSummary?.totalDeliveries ?? 0;
  const ordersLastWeek = perfSummary?.lastWeek?.deliveries ?? 0;
  const cashThisWeek = perfSummary?.thisWeek?.cashKd ?? perfSummary?.totalCashKd ?? 0;
  const cashLastWeek = perfSummary?.lastWeek?.cashKd ?? 0;

  const topEarners: any[] = perfSummary?.topEarners || [];
  const maxEarnerDeliveries = topEarners[0]?.deliveries || 1;

  const topRestaurantsList = topRestaurants || [];
  const maxRestaurantOrders = topRestaurantsList[0]?.orders || 1;

  return (
    <div className="space-y-6">
      <div className="flex gap-3 items-center">
        <input
          type="date"
          value={filters.dateFrom || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
          className={cn(
            "px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2",
            colors.ring
          )}
        />
        <span className="text-sm text-secondary">to</span>
        <input
          type="date"
          value={filters.dateTo || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
          className={cn(
            "px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2",
            colors.ring
          )}
        />
      </div>

      {/* WoW summary cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "Orders", current: ordersThisWeek, previous: ordersLastWeek, format: (v: number) => String(v) },
          { title: "Cash (KD)", current: cashThisWeek, previous: cashLastWeek, format: (v: number) => v.toFixed(3) },
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
            <Store size={14} className={colors.accent} />
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide">Top Branches</h3>
          </div>
          <select
            value={restaurantZone}
            onChange={(e) => setRestaurantZone(e.target.value)}
            className={cn(
              "text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 bg-white",
              colors.ring
            )}
          >
            <option value="">All Zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        {topRestaurantsList.length === 0 ? (
          <p className="text-sm text-secondary py-6 text-center">No restaurant data for this period</p>
        ) : (
          <div className="space-y-2.5">
            {topRestaurantsList.map((r: any, i: number) => {
              const pct = Math.round((r.orders / maxRestaurantOrders) * 100);
              return (
                <div key={r.restaurantName || i} className="flex items-center gap-3">
                  <span className="w-5 text-[10px] font-mono text-secondary text-right flex-shrink-0">{i + 1}</span>
                  <div className="w-40 flex-shrink-0">
                    <p className="text-sm font-medium truncate" title={r.restaurantName}>
                      {r.restaurantName}
                    </p>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-full h-6 relative overflow-hidden">
                    <div
                      className={cn(
                        "h-6 rounded-full bg-gradient-to-r flex items-center justify-end pr-2 transition-all duration-500",
                        colors.gradient
                      )}
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    >
                      <span className="text-[10px] font-semibold text-white font-mono">{r.orders}</span>
                    </div>
                  </div>
                  <div className="w-16 text-right flex-shrink-0">
                    <p className="text-xs font-mono text-secondary">
                      <span className="font-semibold text-primary">
                        {r.drivers ? Math.round(r.orders / r.drivers) : 0}
                      </span>
                      <span className="text-secondary"> ord/drv</span>
                    </p>
                  </div>
                  <div className="w-24 text-right flex-shrink-0">
                    <p className={cn("text-xs font-mono", colors.cashText)}>{(r.cashKd ?? 0).toFixed(3)} KD</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* All Drivers (by Orders) */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-4">
          All Drivers (by Orders)
        </h3>
        {topEarners.length === 0 ? (
          <p className="text-sm text-secondary py-6 text-center">No performance data available for this period</p>
        ) : (
          <div className="space-y-3">
            {topEarners.map((earner: any, i: number) => {
              const pct = Math.round((earner.deliveries / maxEarnerDeliveries) * 100);
              return (
                <div key={earner.driverId || i} className="flex items-center gap-3">
                  <div className="w-32 flex-shrink-0">
                    <p className="text-sm font-medium truncate">
                      {earner.driverName ? cleanDriverName(earner.driverName) : "—"}
                    </p>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-full h-6 relative overflow-hidden">
                    <div
                      className={cn(
                        "h-6 rounded-full bg-gradient-to-r flex items-center justify-end pr-2 transition-all duration-500",
                        colors.gradient
                      )}
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    >
                      <span className="text-[10px] font-semibold text-white font-mono">{earner.deliveries}</span>
                    </div>
                  </div>
                  <div className="w-20 text-right flex-shrink-0">
                    <p className={cn("text-xs font-mono", colors.cashText)}>
                      {(earner.cashKd || 0).toFixed(3)} KD
                    </p>
                    {earner.utr != null && (
                      <p className="text-[10px] font-mono text-green-600">UTR {earner.utr}</p>
                    )}
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
