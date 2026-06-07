"use client";
import { useState, useRef, useEffect } from "react";
import { useApiGet } from "@/hooks/useApi";
import api from "@/lib/api";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import StatCard from "@/components/shared/StatCard";
import PlatformPerformanceTab from "@/components/platform/PlatformPerformanceTab";
import { cn } from "@/lib/cn";
import {
  Upload,
  ShoppingBag,
  CheckCircle2,
  Trophy,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import { formatCurrency, formatTime, formatDateTime } from "@/i18n/format";

type PageTab = "orders" | "performance";

const AMERICANA_AREAS = [
  "Audiliya", "Hawally", "Salmiya", "Jabriya", "Salwa", "Rumaithiya", "Fahaheel", "Mahboula",
];

// Each entry maps a normalized chain label (used in the leaderboard) to the case-insensitive
// prefix variants that may appear in OrderLog.restaurantName (e.g. "Hardee's Hawally", "Hardees Salwa").
const RESTAURANT_PREFIXES: { label: string; matches: string[] }[] = [
  { label: "KFC", matches: ["kfc"] },
  { label: "Hardees", matches: ["hardee's", "hardees"] },
  { label: "Pizza Hut", matches: ["pizza hut"] },
  { label: "TGI Fridays", matches: ["tgi fridays", "tgi friday"] },
];

const detectRestaurant = (storeName: string): string | null => {
  if (!storeName) return null;
  const lower = storeName.toLowerCase();
  return RESTAURANT_PREFIXES.find((c) => c.matches.some((m) => lower.startsWith(m)))?.label ?? null;
};

const detectArea = (storeName: string): string => {
  if (!storeName) return "Unknown";
  const lower = storeName.toLowerCase();
  for (const { matches } of RESTAURANT_PREFIXES) {
    const hit = matches.find((m) => lower.startsWith(m));
    if (hit) {
      return storeName.slice(hit.length).trim() || "Unknown";
    }
  }
  return storeName.split(" ").slice(1).join(" ") || storeName;
};

export default function AmericanaOrdersPage() {
  const { t, locale } = useI18n();
  const [pageTab, setPageTab] = useState<PageTab>("orders");
  const [filters, setFilters] = useState<Record<string, string>>({
    date: new Date().toLocaleDateString("en-CA"),
  });
  const [perfFilters, setPerfFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  // Track whether the user has manually changed the date so we don't override their pick
  // when the latest-date lookup resolves.
  const userPickedDateRef = useRef(false);

  // On mount, fall back to the most recent ingested day for Americana when today has no data
  // (the deployed seed often lags the real "today"). Once the user touches the date picker we stop overriding.
  const { data: latestDateData } = useApiGet<{ date: string | null }>("/api/orders/latest-date?platform=AMERICANA");
  useEffect(() => {
    if (userPickedDateRef.current) return;
    const latest = latestDateData?.date;
    if (!latest) return;
    if (latest !== filters.date) {
      setFilters((prev) => ({ ...prev, date: latest }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestDateData?.date]);

  const params = new URLSearchParams({ platform: "AMERICANA", limit: "200" });
  if (filters.date) { params.set("dateFrom", filters.date); params.set("dateTo", filters.date); }
  if (filters.area) params.set("zone", filters.area);
  if (filters.search) params.set("search", filters.search);

  const { data: ordersData, loading } = useApiGet<any>(`/api/orders?${params}`);
  const { data: summary } = useApiGet<any>(`/api/orders/summary?platform=AMERICANA&date=${filters.date}`);

  const allOrders: any[] = ordersData?.data || [];
  const orders = allOrders.filter((o) => detectRestaurant(o.storeName || "") !== null);

  const restaurantLeaderboard = (() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      const r = detectRestaurant(o.storeName || "");
      if (!r) continue;
      counts[r] = (counts[r] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  })();

  const branchLeaderboard = (() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      const area = detectArea(o.storeName || "");
      counts[area] = (counts[area] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  })();

  const statusLabel = (s: string): string => {
    switch (s) {
      case "DELIVERED": return t("status.completed");
      case "PENDING": return t("status.pending");
      case "CANCELLED": return t("status.cancelled");
      case "IN_TRANSIT": return t("orderFlow.courierPickedUp");
      default: return s || "-";
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("platform", "AMERICANA");
      form.append("date", filters.date);
      await api.post("/api/orders/import", form);
      setImportSuccess(true);
    } catch { /* silent */ } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const prevDay = () => {
    userPickedDateRef.current = true;
    const d = new Date(filters.date);
    d.setDate(d.getDate() - 1);
    setFilters((prev) => ({ ...prev, date: d.toISOString().split("T")[0] }));
    setImportSuccess(false);
  };

  const nextDay = () => {
    userPickedDateRef.current = true;
    const d = new Date(filters.date);
    d.setDate(d.getDate() + 1);
    setFilters((prev) => ({ ...prev, date: d.toISOString().split("T")[0] }));
    setImportSuccess(false);
  };

  const columns = [
    {
      key: "orderId",
      label: t("americana.orderIdCol"),
      render: (v: string) => <span className="font-mono text-sm font-medium">{v || "-"}</span>,
    },
    {
      key: "amount",
      label: t("americana.amountCol"),
      render: (v: number) => <span className="text-sm font-semibold">{v != null ? formatCurrency(v, locale) : "-"}</span>,
    },
    { key: "storeName", label: t("americana.branchCol"), render: (v: string) => <span className="text-sm text-secondary">{v || "-"}</span> },
    { key: "driverName", label: t("americana.driverCol"), render: (v: string) => <span className="text-sm">{v || "-"}</span> },
    {
      key: "timestamp",
      label: t("americana.timeCol"),
      render: (v: string) =>
        v ? (
          <span className="text-sm text-secondary">{formatTime(v, locale)}</span>
        ) : (
          <span className="text-secondary text-sm">-</span>
        ),
    },
    {
      key: "status",
      label: t("table.status"),
      render: (v: string) => (
        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
          "bg-green-50 text-green-600": v === "DELIVERED",
          "bg-yellow-50 text-yellow-700": v === "PENDING",
          "bg-red-50 text-red-600": v === "CANCELLED",
          "bg-blue-50 text-blue-600": v === "IN_TRANSIT",
        })}>
          {statusLabel(v)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-americana" />
          <h1 className="text-xl font-semibold">{t("americana.ordersTitle")}</h1>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-60"
          >
            {importing ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {t("americana.importXlsx")}
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(["orders", "performance"] as PageTab[]).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setPageTab(tabKey)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              pageTab === tabKey ? "bg-white text-foreground shadow-sm" : "text-secondary hover:text-foreground"
            )}
          >
            {tabKey === "orders" ? t("ordersPage.list") : t("ordersPage.performance")}
          </button>
        ))}
      </div>

      {pageTab === "performance" ? (
        <PlatformPerformanceTab
          platform="AMERICANA"
          zones={AMERICANA_AREAS}
          filters={perfFilters}
          setFilters={setPerfFilters}
        />
      ) : (
        <>

      {/* Import Success */}
      {importSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-medium">{t("americana.importSuccess")} {filters.date}.</p>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4">
        <StatCard title={t("americana.totalOrders")} value={summary?.totalOrders ?? orders.length} icon={ShoppingBag} />
      </div>

      {/* Date Navigator */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
          <button onClick={prevDay} className="p-1 hover:bg-gray-50 rounded-lg transition-colors" aria-label={t("actions.previous")}>
            <DirectionalIcon kind="chevron-back" size={16} />
          </button>
          <input
            type="date"
            value={filters.date}
            onChange={(e) => {
              userPickedDateRef.current = true;
              setFilters((prev) => ({ ...prev, date: e.target.value }));
              setImportSuccess(false);
            }}
            className="text-sm font-medium border-0 focus:outline-none bg-transparent"
          />
          <button onClick={nextDay} className="p-1 hover:bg-gray-50 rounded-lg transition-colors" aria-label={t("actions.next")}>
            <DirectionalIcon kind="chevron-forward" size={16} />
          </button>
        </div>

        <FilterBar
          filters={[
            { key: "search", type: "search", label: t("common.search"), placeholder: t("americana.searchPlaceholder") },
            { key: "area", type: "select", label: t("americana.allBranches"), options: AMERICANA_AREAS.map((a) => ({ value: a, label: a })) },
          ]}
          values={filters}
          onChange={(k, v) => {
            if (k === "date") {
              userPickedDateRef.current = true;
              setImportSuccess(false);
            }
            setFilters((prev) => ({ ...prev, [k]: v }));
          }}
        />
      </div>

      {/* Orders Table */}
      <DataTable
        columns={columns}
        data={orders}
        onRowClick={setSelected}
        emptyMessage={loading ? t("common.loading") : t("americana.noOrdersFound")}
      />

      {/* Leaderboards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={16} className="text-amber-500" />
            <h3 className="text-sm font-semibold">{t("americana.restaurantsLeaderboard")}</h3>
          </div>
          {restaurantLeaderboard.length === 0 ? (
            <p className="text-sm text-secondary">{t("americana.noOrdersFound")}</p>
          ) : (
            <ul className="space-y-2">
              {restaurantLeaderboard.map(([restaurant, count], idx) => (
                <li
                  key={restaurant}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-2",
                    idx === 0 ? "bg-amber-50" : "bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                        idx === 0 ? "bg-amber-200 text-amber-800" : "bg-gray-200 text-gray-700"
                      )}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium">{restaurant}</span>
                  </div>
                  <span className="text-sm font-semibold">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={16} className="text-amber-500" />
            <h3 className="text-sm font-semibold">{t("americana.branchesLeaderboard")}</h3>
          </div>
          {branchLeaderboard.length === 0 ? (
            <p className="text-sm text-secondary">{t("americana.noOrdersFound")}</p>
          ) : (
            <ul className="space-y-2">
              {branchLeaderboard.map(([branch, count], idx) => (
                <li
                  key={branch}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-2",
                    idx === 0 ? "bg-amber-50" : "bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                        idx === 0 ? "bg-amber-200 text-amber-800" : "bg-gray-200 text-gray-700"
                      )}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium">{branch}</span>
                  </div>
                  <span className="text-sm font-semibold">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Daily Comparison */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h3 className="text-sm font-semibold mb-4">{t("americana.dailyComparison")}</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t("labels.today"), value: summary?.todayOrders ?? "-", sub: summary?.todayAmount != null ? formatCurrency(summary.todayAmount, locale) : "" },
            { label: t("americana.yesterday"), value: summary?.yesterdayOrders ?? "-", sub: summary?.yesterdayAmount != null ? formatCurrency(summary.yesterdayAmount, locale) : "" },
            { label: t("americana.sevenDayAvg"), value: summary?.avgOrders ?? "-", sub: summary?.avgAmount != null ? formatCurrency(summary.avgAmount, locale) : "" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-gray-50 rounded-2xl p-4">
              <p className="text-xs text-secondary font-medium mb-1">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
              {sub && <p className="text-xs text-secondary mt-1">{sub}</p>}
            </div>
          ))}
        </div>
      </div>

        </>
      )}

      {/* Order Detail Slide Panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold">{selected.orderId}</h2>
                <p className="text-xs text-secondary mt-0.5">Americana</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-gray-50 rounded-lg" aria-label={t("common.close")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                [t("americana.orderIdCol"), selected.orderId],
                [t("labels.total"), selected.amount != null ? formatCurrency(selected.amount, locale) : "-"],
                [t("americana.branchCol"), selected.storeName],
                [t("americana.driverCol"), selected.driverName],
                [t("table.status"), statusLabel(selected.status)],
                [t("americana.timestamp"), selected.timestamp ? formatDateTime(selected.timestamp, locale) : "-"],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val || "-"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
