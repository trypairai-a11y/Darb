"use client";
// Darb 2.0 — /ops: the live control room.
//
// Rebuilt against the Keeta dashboard the client supplied as the reference
// design (revision #2): a split panel with the work list on the left and the
// map on the right. The left panel carries a status dropdown with a total
// count, By task / By courier tabs, the "irregular task" quick-filter tags,
// and a scrollable list; the map carries a GPS alert banner across the top.
//
// Realtime is unchanged: driver positions flow SSE → driverPositionStore
// (bootstrap from GET /api/dispatch/positions on mount and on every SSE
// reconnect); order lists refetch on a debounce when order.* events land,
// with interval fallbacks while the stream is down.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, SatelliteDish, Siren } from "lucide-react";
import LiveMap from "@/components/map/LiveMap";
import type { OrderMarker } from "@/components/map/LiveMap";
import OrderOpsPanel from "@/components/darb/OrderOpsPanel";
import { useSlaTick } from "@/components/darb/useSlaTick";
import OpsAlertBanner from "@/components/ops/OpsAlertBanner";
import OpsCourierList from "@/components/ops/OpsCourierList";
import OpsFilterChips from "@/components/ops/OpsFilterChips";
import OpsTaskList from "@/components/ops/OpsTaskList";
import {
  ACTIVE_STATUSES,
  countQuickFilter,
  elapsedMinutes,
  filterDrivers,
  filterOrders,
  matchesQuickFilter,
  QUICK_FILTERS,
  sortOrders,
  type OrderSignals,
  type OrderSort,
  type QuickFilter,
} from "@/components/ops/opsFilters";
import { useToast } from "@/components/shared/Toast";
import { useDarbEvents } from "@/hooks/useDarbEvents";
import {
  bootstrapPositions,
  upsertPosition,
  useDriverPositions,
} from "@/lib/driverPositionStore";
import { copyText, formatCopyBlock } from "@/lib/clipboard";
import { deliveryOrdersApi, dispatchApi, incidentsApi, unwrapList, zonesApi } from "@/lib/darbApi";
import { driverMapStatus, type DriverMapStatus } from "@/types/darb";
import type { DeliveryOrder, DeliveryZone, DriverPosition, Incident } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

type PanelTab = "task" | "courier";

/** Status labels for the dropdown, matching OrderStatusBadge's namespace. */
const STATUS_I18N_KEY: Record<(typeof ACTIVE_STATUSES)[number], string> = {
  CREATED: "darbOrderStatus.created",
  DISPATCHING: "darbOrderStatus.dispatching",
  NO_DRIVER: "darbOrderStatus.noDriver",
  ASSIGNED: "darbOrderStatus.assigned",
  PICKED_UP: "darbOrderStatus.pickedUp",
};

/** Labels for the copy-irregular block, kept beside the chips' own labels. */
const QUICK_FILTER_I18N: Record<QuickFilter, string> = {
  largeOrder: "opsMap.filterLargeOrder",
  almostLate: "opsMap.filterAlmostLate",
  late: "opsMap.filterLate",
  unusualStop: "opsMap.filterUnusualStop",
  courierIssue: "opsMap.filterCourierIssue",
};

export default function OpsMapPage() {
  const { t } = useI18n();
  const { canEdit } = useRole();
  const toast = useToast();
  const queryClient = useQueryClient();
  const now = useSlaTick();
  const positions = useDriverPositions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>("task");
  const [statusFilter, setStatusFilter] = useState("");
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  const [sort, setSort] = useState<OrderSort>("acceptance");
  const [driverStatuses, setDriverStatuses] = useState<DriverMapStatus[]>([]);
  const [driverSearch, setDriverSearch] = useState("");

  // ── Data ────────────────────────────────────────────────────────────────
  const overviewQuery = useQuery({
    queryKey: ["darb", "dispatch", "overview"],
    queryFn: () => dispatchApi.overview(),
    refetchInterval: 15_000,
  });

  const ordersQuery = useQuery({
    queryKey: ["darb", "delivery-orders", "ops-active"],
    queryFn: () => deliveryOrdersApi.list({ limit: 100 }),
    refetchInterval: 30_000,
  });
  const activeOrders = useMemo(
    () =>
      unwrapList<DeliveryOrder>(ordersQuery.data).filter((o) =>
        (ACTIVE_STATUSES as readonly string[]).includes(o.status)
      ),
    [ordersQuery.data]
  );

  const zonesQuery = useQuery({
    queryKey: ["darb", "zones"],
    queryFn: () => zonesApi.list(),
    staleTime: 5 * 60_000,
  });
  const zones = useMemo(() => unwrapList<DeliveryZone>(zonesQuery.data), [zonesQuery.data]);

  const incidentsQuery = useQuery({
    queryKey: ["darb", "incidents", "live"],
    queryFn: () => incidentsApi.list({ limit: 50 }),
    refetchInterval: 10_000,
  });
  const openIncidents = useMemo(
    () => unwrapList<Incident>(incidentsQuery.data).filter((i) => i.status === "OPEN"),
    [incidentsQuery.data]
  );

  // ── Realtime ────────────────────────────────────────────────────────────
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleOrderRefresh = useCallback(() => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      void queryClient.invalidateQueries({ queryKey: ["darb", "dispatch", "overview"] });
      void queryClient.invalidateQueries({ queryKey: ["darb", "delivery-orders", "ops-active"] });
    }, 2_000);
  }, [queryClient]);
  useEffect(
    () => () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    },
    []
  );

  const { connected } = useDarbEvents({
    onEvent: (event) => {
      if (event.type === "driver.location") {
        upsertPosition({ ...event.payload });
        return;
      }
      if (event.type.startsWith("order.") || event.type.startsWith("offer.")) {
        scheduleOrderRefresh();
      }
      if (event.type === "sos.raised" || event.type === "incident.updated") {
        void queryClient.invalidateQueries({ queryKey: ["darb", "incidents"] });
      }
    },
  });

  // Bootstrap the position store on mount and again on every SSE reconnect;
  // while disconnected, refresh the snapshot every 30s as a fallback.
  const bootstrap = useCallback(() => {
    dispatchApi
      .positions()
      .then((res) => bootstrapPositions(unwrapList(res)))
      .catch(() => {});
  }, []);
  const prevConnected = useRef(false);
  useEffect(() => {
    if (connected && !prevConnected.current) bootstrap();
    prevConnected.current = connected;
  }, [connected, bootstrap]);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);
  useEffect(() => {
    if (connected) return;
    const timer = setInterval(bootstrap, 30_000);
    return () => clearInterval(timer);
  }, [connected, bootstrap]);

  // ── Derived view state ──────────────────────────────────────────────────
  const overview = overviewQuery.data;
  const stalled = useMemo(() => overview?.stalled ?? [], [overview?.stalled]);
  const gpsStale = useMemo<DriverPosition[]>(() => overview?.gpsStale ?? [], [overview?.gpsStale]);

  /** Signals the order rows do not carry, folded in for the quick filters. */
  const signals = useMemo<OrderSignals>(
    () => ({
      stalledOrderIds: new Set(stalled.map((s) => s.orderId).filter(Boolean)),
      incidentOrderIds: new Set(
        openIncidents.map((i) => i.orderId).filter((id): id is string => !!id)
      ),
    }),
    [stalled, openIncidents]
  );

  const quickCounts = useMemo(
    () =>
      Object.fromEntries(
        QUICK_FILTERS.map((f) => [f, countQuickFilter(activeOrders, f, now, signals)])
      ) as Record<QuickFilter, number>,
    [activeOrders, now, signals]
  );

  const visibleOrders = useMemo(
    () =>
      sortOrders(
        filterOrders(activeOrders, { status: statusFilter, quickFilters, now, signals }),
        sort,
        now
      ),
    [activeOrders, statusFilter, quickFilters, now, signals, sort]
  );

  const visibleDrivers = useMemo(
    () => filterDrivers(positions, driverStatuses, driverSearch),
    [positions, driverStatuses, driverSearch]
  );

  const selectedOrder = activeOrders.find((o) => o.id === selectedId) ?? null;

  // Markers follow whichever tab is open, so the map is never showing work the
  // panel has filtered out.
  const orderMarkers = useMemo<OrderMarker[]>(
    () =>
      (tab === "task" ? visibleOrders : activeOrders)
        .map((o) => {
          const pickup =
            o.branch?.lat != null && o.branch?.lng != null
              ? { lat: Number(o.branch.lat), lng: Number(o.branch.lng), label: o.vendor?.name ?? undefined }
              : null;
          const dropoff =
            o.dropoffLat != null && o.dropoffLng != null
              ? { lat: Number(o.dropoffLat), lng: Number(o.dropoffLng), label: o.orderNumber }
              : null;
          return { id: o.id, pickup, dropoff, showLine: o.id === selectedId } as OrderMarker;
        })
        .filter((m) => m.pickup || m.dropoff),
    [tab, visibleOrders, activeOrders, selectedId]
  );

  const mapDrivers = tab === "courier" ? visibleDrivers : positions;

  const fitBounds = useMemo<[number, number][] | null>(() => {
    if (tab === "courier" && selectedDriverId) {
      const driver = positions.find((d) => d.driverId === selectedDriverId);
      return driver ? [[driver.lat, driver.lng]] : null;
    }
    if (!selectedOrder) return null;
    const pts: [number, number][] = [];
    if (selectedOrder.branch?.lat != null && selectedOrder.branch?.lng != null) {
      pts.push([Number(selectedOrder.branch.lat), Number(selectedOrder.branch.lng)]);
    }
    if (selectedOrder.dropoffLat != null && selectedOrder.dropoffLng != null) {
      pts.push([Number(selectedOrder.dropoffLat), Number(selectedOrder.dropoffLng)]);
    }
    return pts.length > 0 ? pts : null;
  }, [tab, selectedDriverId, positions, selectedOrder]);

  // ── Copy (revision #4) ──────────────────────────────────────────────────
  const runCopy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      if (ok) toast.success(t("opsMap.copied"));
      else toast.error(t("opsMap.copyFailed"));
    },
    [toast, t]
  );

  const copyOrder = useCallback(
    (order: DeliveryOrder) => {
      const driver = positions.find((d) => d.driverId === order.driverId);
      void runCopy(
        formatCopyBlock([
          [t("opsMap.copyOrderNumber"), order.orderNumber],
          [t("opsMap.copyVendor"), order.vendor?.name],
          [t("opsMap.copyBranch"), order.branch?.name],
          [t("table.status"), order.status],
          [t("opsMap.copyDriver"), order.driver?.name],
          [t("opsMap.copyDriverCode"), driver?.driverCode],
          [t("opsMap.copyDriverPhone"), order.driver?.phone],
          [t("opsMap.copyElapsed"), `${elapsedMinutes(order, now)} ${t("opsMap.minShort")}`],
          [t("opsMap.copySlaDeadline"), order.slaDeadline],
          [t("opsMap.copyDropoff"), order.dropoffAddress],
          [
            t("opsMap.copyCoordinates"),
            order.dropoffLat != null && order.dropoffLng != null
              ? `${order.dropoffLat}, ${order.dropoffLng}`
              : null,
          ],
        ])
      );
    },
    [positions, runCopy, t, now]
  );

  const copyDriver = useCallback(
    (driver: DriverPosition) => {
      void runCopy(
        formatCopyBlock([
          [t("opsMap.copyDriver"), driver.name],
          [t("opsMap.copyDriverCode"), driver.driverCode],
          [t("opsMap.copyDriverPhone"), driver.phone],
          [t("table.status"), driverMapStatus(driver)],
          [t("opsMap.copyVehicle"), driver.vehicleType],
          [t("opsMap.copyLastFix"), driver.at],
          [t("opsMap.copyCoordinates"), `${driver.lat}, ${driver.lng}`],
        ])
      );
    },
    [runCopy, t]
  );

  /** The banner's "One-click copy irregular info": everything currently wrong. */
  const copyIrregular = useCallback(() => {
    const lines: string[] = [];
    if (gpsStale.length > 0) {
      lines.push(`${t("opsMap.driverStale")} (${gpsStale.length})`);
      for (const d of gpsStale) {
        lines.push(`  ${d.driverCode ?? "n/a"}  ${d.name ?? d.driverId}  ${d.phone ?? ""}`.trimEnd());
      }
    }
    for (const filter of ["late", "almostLate", "unusualStop", "courierIssue"] as QuickFilter[]) {
      const matches = activeOrders.filter((o) => matchesQuickFilter(o, filter, now, signals));
      if (matches.length === 0) continue;
      lines.push(`${t(QUICK_FILTER_I18N[filter])} (${matches.length})`);
      for (const o of matches) {
        lines.push(`  ${o.orderNumber}  ${o.vendor?.name ?? ""}  ${o.driver?.name ?? ""}`.trimEnd());
      }
    }
    void runCopy(lines.length > 0 ? lines.join("\n") : t("opsPages.allClear"));
  }, [gpsStale, activeOrders, signals, now, runCopy, t]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const toggleQuickFilter = (filter: QuickFilter) =>
    setQuickFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
    );

  const toggleDriverStatus = (status: DriverMapStatus) =>
    setDriverStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of activeOrders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
    return counts;
  }, [activeOrders]);

  return (
    <div className="-m-8 flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Work panel ── */}
      <aside className="w-[360px] shrink-0 border-e border-sand-200 bg-card flex flex-col">
        <div className="p-4 border-b border-sand-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-lg text-sand-900">{t("opsPages.mapTitle")}</h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-medium",
                connected ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  connected ? "bg-green-500 animate-pulse" : "bg-amber-500"
                )}
              />
              {connected ? t("vendorPortal.live") : t("vendorPortal.reconnecting")}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Link
              href="/ops/alerts"
              className="rounded-xl bg-sand-100/70 hover:bg-sand-100 px-2 py-2 transition-colors"
            >
              <span className="flex items-center justify-center gap-1 text-amber-600">
                <AlertTriangle size={12} aria-hidden="true" />
                <span className="text-sm font-semibold tabular-nums">{stalled.length}</span>
              </span>
              <span className="block text-[10px] text-sand-600 mt-0.5">{t("opsPages.stalled")}</span>
            </Link>
            <Link
              href="/ops/alerts"
              className="rounded-xl bg-sand-100/70 hover:bg-sand-100 px-2 py-2 transition-colors"
            >
              <span className="flex items-center justify-center gap-1 text-sand-700">
                <SatelliteDish size={12} aria-hidden="true" />
                <span className="text-sm font-semibold tabular-nums">{gpsStale.length}</span>
              </span>
              <span className="block text-[10px] text-sand-600 mt-0.5">{t("opsPages.gpsStale")}</span>
            </Link>
            <Link
              href="/ops/sos"
              className={cn(
                "rounded-xl px-2 py-2 transition-colors",
                openIncidents.length > 0
                  ? "bg-red-50 hover:bg-red-100"
                  : "bg-sand-100/70 hover:bg-sand-100"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center gap-1",
                  openIncidents.length > 0 ? "text-red-600" : "text-sand-700"
                )}
              >
                <Siren size={12} aria-hidden="true" />
                <span className="text-sm font-semibold tabular-nums">{openIncidents.length}</span>
              </span>
              <span className="block text-[10px] text-sand-600 mt-0.5">{t("opsPages.sosBadge")}</span>
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-sand-100 rounded-pill p-1">
            {(["task", "courier"] as PanelTab[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex-1 h-8 text-xs font-medium rounded-pill transition-colors",
                  tab === key
                    ? "bg-white text-sand-900 shadow-soft"
                    : "text-sand-600 hover:text-sand-900"
                )}
              >
                {key === "task" ? t("opsMap.byTask") : t("opsMap.byCourier")}
              </button>
            ))}
          </div>

          {tab === "task" && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium text-sand-600 shrink-0">
                  {t("table.status")}
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="flex-1 px-3 h-8 rounded-pill bg-white border border-sand-300 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">
                    {t("opsMap.allStatuses")} ({activeOrders.length})
                  </option>
                  {ACTIVE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(STATUS_I18N_KEY[status])} ({statusCounts.get(status) ?? 0})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-red-600">
                    <AlertTriangle size={11} aria-hidden="true" />
                    {t("opsMap.irregularTask")}
                  </span>
                  <button
                    type="button"
                    onClick={copyIrregular}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {t("opsMap.copyIrregular")}
                  </button>
                </div>
                <OpsFilterChips
                  counts={quickCounts}
                  active={quickFilters}
                  onToggle={toggleQuickFilter}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-sand-500 tabular-nums">
                  {visibleOrders.length} / {activeOrders.length}
                </span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as OrderSort)}
                  className="px-2 h-7 rounded-pill bg-transparent border border-sand-200 text-[11px] text-sand-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="acceptance">{t("opsMap.sortAcceptance")}</option>
                  <option value="sla">{t("opsMap.sortSla")}</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {tab === "task" ? (
            <OpsTaskList
              orders={visibleOrders}
              selectedId={selectedId}
              now={now}
              onSelect={setSelectedId}
              onCopy={copyOrder}
            />
          ) : (
            <OpsCourierList
              drivers={visibleDrivers}
              allDrivers={positions}
              activeStatuses={driverStatuses}
              search={driverSearch}
              selectedDriverId={selectedDriverId}
              onToggleStatus={toggleDriverStatus}
              onSearch={setDriverSearch}
              onSelect={(id) => setSelectedDriverId((prev) => (prev === id ? null : id))}
              onCopy={copyDriver}
            />
          )}
        </div>
      </aside>

      {/* ── Map ── */}
      <div className="relative flex-1 min-w-0">
        <OpsAlertBanner gpsStale={gpsStale} onCopy={copyIrregular} />
        <LiveMap
          height="100%"
          zones={zones}
          zoneFillOpacity={0.06}
          drivers={mapDrivers}
          selectedDriverId={selectedDriverId ?? selectedOrder?.driverId ?? null}
          onDriverClick={(id) => {
            setTab("courier");
            setSelectedDriverId(id);
          }}
          orders={orderMarkers}
          fitBounds={fitBounds}
        />
      </div>

      <OrderOpsPanel
        orderId={selectedId}
        onClose={() => setSelectedId(null)}
        fallback={selectedOrder}
        canEdit={canEdit}
      />
    </div>
  );
}
