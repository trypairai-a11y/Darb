"use client";
import React, { useRef, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useApiGet } from "@/hooks/useApi";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import StatCard from "@/components/shared/StatCard";
import PlatformPerformanceTab from "@/components/platform/PlatformPerformanceTab";
import { type TimelineStep } from "@/components/shared/OrderTimeline";
import { cn } from "@/lib/cn";
import { cleanDriverName } from "@/lib/formatters";
import api from "@/lib/api";
import {
  Upload,
  Image as ImageIcon,
  Package,
  TrendingUp,
  Clock,
  Route,
  CreditCard,
  Info,
  Loader2,
  Download,
  MapPin,
  ArrowUp,
  ArrowDown,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import { formatDate, formatNumber } from "@/i18n/format";

const OrderTimeline = dynamic(() => import("@/components/shared/OrderTimeline"), {
  ssr: false,
  loading: () => <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />,
});

const ZONES = [
  "Hawally", "Salmiya", "Ardiya", "Jahra", "Khiran",
  "Mishref", "Sabah Al Salem", "Abu Halifa", "Fahaheel", "Mangaf",
];

type SortField = "date" | "driver" | "orderCount" | "distanceKm" | "onTimeRate" | "zone";
type SortDir = "asc" | "desc";
type PageTab = "orders" | "performance";

function SortableHeader({
  label, field, currentSort, currentDir, onSort, align = "left",
}: {
  label: string; field: SortField; currentSort: SortField; currentDir: SortDir;
  onSort: (f: SortField) => void; align?: "left" | "right";
}) {
  const active = currentSort === field;
  return (
    <th
      className={cn(
        "text-xs font-medium text-secondary px-5 py-3 cursor-pointer select-none hover:text-foreground transition-colors group",
        align === "right" ? "text-right" : "text-left"
      )}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {align === "right" && active && (currentDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        {label}
        {align === "left" && active && (currentDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        {!active && (
          <span className="opacity-0 group-hover:opacity-40 transition-opacity">
            <ArrowDown size={11} />
          </span>
        )}
      </span>
    </th>
  );
}

function Pagination({
  page, totalPages, onPageChange,
}: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) for (let i = 1; i <= totalPages; i++) pages.push(i);
  else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onPageChange(1)} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label={t("table.previousPage")}>
        <ChevronsLeft size={16} />
      </button>
      <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label={t("table.previousPage")}>
        <DirectionalIcon kind="chevron-back" size={16} />
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="px-2 text-xs text-secondary">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p as number)}
            className={cn(
              "w-8 h-8 rounded-lg text-xs font-medium transition-colors",
              p === page ? "bg-keeta text-white" : "hover:bg-gray-100 text-secondary"
            )}
          >
            {p}
          </button>
        )
      )}
      <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label={t("table.nextPage")}>
        <DirectionalIcon kind="chevron-forward" size={16} />
      </button>
      <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label={t("table.nextPage")}>
        <ChevronsRight size={16} />
      </button>
    </div>
  );
}

function OrderFlowSection({ orderId }: { orderId: string | undefined }) {
  const { t } = useI18n();
  const { data, loading, error } = useApiGet<{ orderId: string; steps: TimelineStep[]; totalEvents: number }>(
    orderId ? `/api/order-flow/orders/${orderId}/flow` : null
  );
  if (!orderId) return null;
  if (loading) {
    return (
      <div className="pt-2">
        <h3 className="text-xs font-medium text-secondary uppercase mb-3">{t("keetaPage.orderFlow")}</h3>
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Loader2 size={20} className="animate-spin text-keeta" />
          <p className="text-xs text-secondary">{t("keetaPage.loadingTimeline")}</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="pt-2">
        <h3 className="text-xs font-medium text-secondary uppercase mb-3">{t("keetaPage.orderFlow")}</h3>
        <div className="text-center py-8 text-sm text-secondary">{t("keetaPage.unableLoadFlow")}</div>
      </div>
    );
  }
  const steps = data?.steps || [];
  if (steps.length === 0) {
    return (
      <div className="pt-2">
        <h3 className="text-xs font-medium text-secondary uppercase mb-3">{t("keetaPage.orderFlow")}</h3>
        <div className="text-center py-8 text-sm text-secondary">{t("keetaPage.noFlowData")}</div>
      </div>
    );
  }
  return (
    <div className="pt-2">
      <h3 className="text-xs font-medium text-secondary uppercase mb-3">{t("keetaPage.orderFlow")}</h3>
      <OrderTimeline steps={steps} />
    </div>
  );
}

export default function KeetaOrdersPage() {
  const { t, locale } = useI18n();
  const [pageTab, setPageTab] = useState<PageTab>("orders");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const xlsxRef = useRef<HTMLInputElement>(null);
  const ssRef = useRef<HTMLInputElement>(null);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
    setCurrentPage(1);
  }

  const params = new URLSearchParams({ platform: "KEETA", limit: "50", page: String(currentPage) });
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.search) params.set("search", filters.search);
  else if (filters.driverId) params.set("search", filters.driverId);
  params.set("sortBy", sortField);
  params.set("sortOrder", sortDir);

  const { data, loading } = useApiGet<any>(`/api/orders?${params}`);
  const orders: any[] = data?.data || [];
  const ordersPagination = data?.pagination;

  const summaryParams = new URLSearchParams({ platform: "KEETA" });
  if (filters.dateFrom) summaryParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) summaryParams.set("dateTo", filters.dateTo);
  const { data: summary } = useApiGet<any>(`/api/orders/summary?${summaryParams}`);

  const { data: driversList } = useApiGet<any[]>("/api/orders/drivers?platform=KEETA");
  const driverOptions = useMemo(
    () => (driversList || []).map((d: any) => ({ value: d.name, label: d.name })),
    [driversList]
  );

  const totalOrders = summary?.totalDeliveries ?? orders.reduce((acc, o) => acc + (o.orderCount ?? o.orders ?? 1), 0);
  const activeDrivers = data?.meta?.activeDrivers ?? summary?.zones?.reduce((acc: number, z: any) => acc + (z.driverCount ?? 0), 0) ?? orders.length;
  const avgOnTime = orders.length
    ? Math.round(orders.reduce((acc, o) => acc + (o.onTimeRate ?? 0), 0) / orders.length)
    : 0;
  const totalDistance = summary?.totalDistanceKm ?? orders.reduce((acc, o) => acc + Number(o.distanceKm ?? o.distance ?? 0), 0);

  const zones = summary?.zones || [];

  function handleExportCsv() {
    const p = new URLSearchParams({ platform: "KEETA" });
    if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) p.set("dateTo", filters.dateTo);
    if (filters.zone) p.set("zone", filters.zone);
    if (filters.search) p.set("search", filters.search);
    window.open(`${api.defaults.baseURL || ""}/api/orders/export-csv?${p}`, "_blank");
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-keeta" />
          <h1 className="text-xl font-semibold">{t("keetaPage.ordersTitle")}</h1>
          <span className="text-sm text-secondary">{t("keetaPage.sidra")}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={xlsxRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => setXlsxFile(e.target.files?.[0] || null)}
          />
          <input
            ref={ssRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
          />
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download size={15} className="text-secondary" />
            {t("ordersPage.exportCsv")}
          </button>
          <button
            onClick={() => xlsxRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-keeta/40 bg-keeta/5 text-keeta text-sm font-medium hover:bg-keeta/10 transition-colors"
          >
            <Upload size={15} />
            {xlsxFile ? xlsxFile.name : t("keetaPage.uploadXlsx")}
          </button>
          <button
            onClick={() => ssRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            <ImageIcon size={15} className="text-secondary" />
            {screenshotFile ? screenshotFile.name : t("keetaPage.uploadScreenshot")}
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

      {pageTab === "orders" && (
        <>
          {/* Cashless notice */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
            <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-700">{t("keetaPage.keetaCashless")}</p>
              <p className="text-xs text-blue-500 mt-0.5">
                {t("keetaPage.cashlessBody")}
              </p>
            </div>
            <span className="ms-auto px-2 py-0.5 bg-blue-100 text-blue-600 text-xs font-medium rounded-md shrink-0">
              <CreditCard size={11} className="inline me-1" />
              {t("keetaPage.digitalOnly")}
            </span>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard title={t("keetaPage.totalOrdersCard")} value={totalOrders} icon={Package} />
            <StatCard title={t("keetaPage.activeDriversCard")} value={activeDrivers} icon={TrendingUp} />
            <StatCard title={t("keetaPage.avgOnTimeRate")} value={`${avgOnTime}%`} icon={Clock} highlight={avgOnTime > 0 && avgOnTime < 70} />
            <StatCard title={t("keetaPage.totalDistance")} value={`${formatNumber(Number(totalDistance), locale, { maximumFractionDigits: 0 })} km`} icon={Route} />
          </div>

          {/* Zone Breakdown */}
          {zones.length > 0 && (
            <div className="flex gap-3 overflow-x-auto">
              {zones.map((z: any) => (
                <div
                  key={z.zone}
                  className="flex items-center gap-3 bg-white rounded-xl px-4 py-2.5 shadow-sm border border-gray-50 flex-shrink-0"
                >
                  <MapPin size={13} className="text-keeta flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium">{z.zone}</p>
                    <p className="text-[10px] text-secondary font-mono">
                      {z.deliveries} {t("keetaPage.ordersSuffix")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <FilterBar
            filters={[
              { key: "search", type: "search", label: t("common.search"), placeholder: t("keetaPage.searchOrderDriver") },
              { key: "driverId", type: "driver-search", label: t("table.driver"), placeholder: t("keetaPage.searchByDriver"), options: driverOptions },
              { key: "dateFrom", type: "date", label: t("labels.from") },
              { key: "dateTo", type: "date", label: t("labels.to") },
              { key: "zone", type: "select", label: t("keetaPage.allZones"), options: ZONES.map((z) => ({ value: z, label: z })) },
            ]}
            values={filters}
            onChange={(k, v) => { setFilters((prev) => ({ ...prev, [k]: v })); setCurrentPage(1); }}
            onClear={() => { setFilters({}); setCurrentPage(1); }}
          />

          {/* Pending import banners */}
          {(xlsxFile || screenshotFile) && (
            <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-100 rounded-2xl px-4 py-3">
              <Info size={15} className="text-yellow-600 shrink-0" />
              <p className="text-sm text-yellow-700">
                {xlsxFile && <span>{t("keetaPage.readyToImport")} <strong>{xlsxFile.name}</strong>. </span>}
                {screenshotFile && <span>{t("keetaPage.screenshotQueued")} <strong>{screenshotFile.name}</strong>. </span>}
                {t("keetaPage.clickConfirmImport")}
              </p>
              <button className="ms-auto px-3 py-1.5 bg-yellow-500 text-white text-xs font-medium rounded-xl hover:bg-yellow-600 transition-colors shrink-0">
                {t("keetaPage.confirmImport")}
              </button>
              <button
                onClick={() => { setXlsxFile(null); setScreenshotFile(null); }}
                className="text-xs text-yellow-600 hover:underline shrink-0"
              >
                {t("common.cancel")}
              </button>
            </div>
          )}

          {/* Orders Table */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <SortableHeader label={t("table.date")} field="date" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label={t("table.driver")} field="driver" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label={t("table.zone")} field="zone" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label={t("table.orders")} field="orderCount" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortableHeader label={t("keetaPage.distanceCol")} field="distanceKm" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortableHeader label={t("keetaPage.avgOnTimeRate")} field="onTimeRate" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="right" />
                    <th className="text-xs font-medium text-secondary px-5 py-3 text-start">{t("keetaPage.source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-sm text-secondary">
                        {loading ? t("common.loading") : t("keetaPage.noOrdersFound")}
                      </td>
                    </tr>
                  ) : (
                    orders.map((order: any) => {
                      const rate = order.onTimeRate ?? 0;
                      const d = order.distanceKm ?? order.distance;
                      return (
                        <tr
                          key={order.id}
                          className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer"
                          onClick={() => setSelected(order)}
                        >
                          <td className="px-5 py-3 text-sm text-secondary whitespace-nowrap">
                            {order.date ? new Date(order.date).toLocaleDateString([], { month: "short", day: "numeric" }) : "\u2014"}
                          </td>
                          <td className="px-5 py-3 text-sm font-medium whitespace-nowrap">
                            {cleanDriverName(order.driver?.name || order.driverName) || "\u2014"}
                          </td>
                          <td className="px-5 py-3 text-sm text-secondary whitespace-nowrap">
                            {order.zone || order.driver?.zone || "\u2014"}
                          </td>
                          <td className="px-5 py-3 text-sm text-right font-mono font-semibold whitespace-nowrap">
                            {order.orderCount ?? order.orders ?? "\u2014"}
                          </td>
                          <td className="px-5 py-3 text-sm text-right font-mono text-secondary whitespace-nowrap">
                            {d != null ? `${Number(d).toFixed(1)} km` : "\u2014"}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", rate >= 90 ? "bg-green-500" : rate >= 70 ? "bg-orange-400" : "bg-red-400")}
                                  style={{ width: `${rate}%` }}
                                />
                              </div>
                              <span className="text-xs text-secondary font-mono w-10 text-right">{rate}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-semibold", {
                              "bg-blue-50 text-blue-600": order.source === "API",
                              "bg-yellow-50 text-yellow-700": order.source === "XLSX",
                              "bg-purple-50 text-purple-600": order.source === "SCREENSHOT",
                              "bg-gray-100 text-gray-500": !order.source || order.source === "MANUAL",
                            })}>
                              {order.source || "MANUAL"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {ordersPagination && ordersPagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-xs text-secondary">
                  {t("keetaPage.showingRange")} {((ordersPagination.page - 1) * ordersPagination.limit) + 1}–{Math.min(ordersPagination.page * ordersPagination.limit, ordersPagination.total)} {t("common.of")} {ordersPagination.total} {t("keetaPage.ordersSuffix")}
                </p>
                <Pagination
                  page={ordersPagination.page}
                  totalPages={ordersPagination.totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </div>
        </>
      )}

      {pageTab === "performance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <StatCard title={t("keetaPage.totalOrdersCard")} value={totalOrders} icon={Package} />
            <StatCard title={t("keetaPage.activeDriversCard")} value={activeDrivers} icon={TrendingUp} />
            <StatCard title={t("keetaPage.avgOnTimeRate")} value={`${avgOnTime}%`} icon={Clock} highlight={avgOnTime > 0 && avgOnTime < 70} />
            <StatCard title={t("keetaPage.totalDistance")} value={`${formatNumber(Number(totalDistance), locale, { maximumFractionDigits: 0 })} km`} icon={Route} />
          </div>

          <PlatformPerformanceTab
            platform="KEETA"
            zones={ZONES}
            filters={filters}
            setFilters={setFilters}
          />
        </div>
      )}

      {/* Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? cleanDriverName(selected.driver?.name || selected.driverName) || t("keetaPage.orderDetail") : t("keetaPage.orderDetail")}
        subtitle={`Keeta / ${t("keetaPage.sidra")}`}
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                [t("table.date"), selected.date ? formatDate(selected.date, locale) : "-"],
                [t("keetaPage.orderNumCol"), selected.orderNumber || selected.id?.slice(0, 8) || "-"],
                [t("table.driver"), cleanDriverName(selected.driver?.name || selected.driverName) || "-"],
                [t("table.zone"), selected.driver?.zone || selected.zone || "-"],
                [t("keetaPage.orderCount"), selected.orderCount ?? selected.orders ?? "-"],
                [t("keetaPage.distanceCol"), selected.distanceKm != null ? `${Number(selected.distanceKm).toFixed(1)} km` : "-"],
                [t("keetaPage.avgOnTimeRate"), selected.onTimeRate != null ? `${selected.onTimeRate}%` : "-"],
                [t("keetaPage.source"), selected.source || "-"],
                [t("table.platform"), "KEETA"],
                [t("keetaPage.paymentCol"), selected.paymentSource || t("keetaPage.digitalCashless")],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val}</p>
                </div>
              ))}
            </div>
            {selected.notes && (
              <div className="bg-yellow-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium mb-1">{t("keetaPage.notesLabel")}</p>
                <p className="text-sm">{selected.notes}</p>
              </div>
            )}
            <OrderFlowSection orderId={selected.id} />
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
