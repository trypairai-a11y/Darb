"use client";
// Darb 2.0 — /ops: the live control room (wave 2). Full-bleed map (the page
// cancels the dashboard main padding with -m-8) + a 320px jeopardy rail.
// Realtime: driver positions flow SSE → driverPositionStore (bootstrap from
// GET /api/dispatch/positions on mount and on every SSE reconnect); order
// lists refetch on a debounce when order.* events land, with interval
// fallbacks while the stream is down.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, SatelliteDish, Siren } from "lucide-react";
import LiveMap from "@/components/map/LiveMap";
import type { OrderMarker } from "@/components/map/LiveMap";
import OrderOpsPanel from "@/components/darb/OrderOpsPanel";
import OrderStatusBadge from "@/components/darb/OrderStatusBadge";
import SlaCountdown from "@/components/darb/SlaCountdown";
import { useSlaTick } from "@/components/darb/useSlaTick";
import { useDarbEvents } from "@/hooks/useDarbEvents";
import {
  bootstrapPositions,
  upsertPosition,
  useDriverPositions,
} from "@/lib/driverPositionStore";
import { deliveryOrdersApi, dispatchApi, incidentsApi, unwrapList, zonesApi } from "@/lib/darbApi";
import type { DeliveryOrder, DeliveryZone, Incident } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

const ACTIVE_STATUSES = ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED", "PICKED_UP"];

function slaRemaining(order: DeliveryOrder, now: number): number {
  if (!order.slaDeadline) return Number.POSITIVE_INFINITY;
  const target = new Date(order.slaDeadline).getTime();
  return Number.isFinite(target) ? target - now : Number.POSITIVE_INFINITY;
}

export default function OpsMapPage() {
  const { t } = useI18n();
  const { canEdit } = useRole();
  const queryClient = useQueryClient();
  const now = useSlaTick();
  const positions = useDriverPositions();

  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    () => unwrapList<DeliveryOrder>(ordersQuery.data).filter((o) => ACTIVE_STATUSES.includes(o.status)),
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
  const openSosCount = useMemo(
    () => unwrapList<Incident>(incidentsQuery.data).filter((i) => i.status === "OPEN").length,
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
  const jeopardy = useMemo(() => {
    const list = overview?.jeopardy ?? [];
    return [...list].sort((a, b) => slaRemaining(a, now) - slaRemaining(b, now));
  }, [overview?.jeopardy, now]);
  const stalledCount = overview?.stalled?.length ?? 0;
  const gpsStaleCount = overview?.gpsStale?.length ?? 0;

  const selectedOrder =
    activeOrders.find((o) => o.id === selectedId) ??
    jeopardy.find((o) => o.id === selectedId) ??
    null;

  const orderMarkers = useMemo<OrderMarker[]>(
    () =>
      activeOrders
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
    [activeOrders, selectedId]
  );

  const fitBounds = useMemo<[number, number][] | null>(() => {
    if (!selectedOrder) return null;
    const pts: [number, number][] = [];
    if (selectedOrder.branch?.lat != null && selectedOrder.branch?.lng != null) {
      pts.push([Number(selectedOrder.branch.lat), Number(selectedOrder.branch.lng)]);
    }
    if (selectedOrder.dropoffLat != null && selectedOrder.dropoffLng != null) {
      pts.push([Number(selectedOrder.dropoffLat), Number(selectedOrder.dropoffLng)]);
    }
    return pts.length > 0 ? pts : null;
  }, [selectedOrder]);

  return (
    <div className="-m-8 flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Jeopardy rail ── */}
      <aside className="w-80 shrink-0 border-e border-sand-200 bg-card flex flex-col">
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
                <span className="text-sm font-semibold tabular-nums">{stalledCount}</span>
              </span>
              <span className="block text-[10px] text-sand-600 mt-0.5">{t("opsPages.stalled")}</span>
            </Link>
            <Link
              href="/ops/alerts"
              className="rounded-xl bg-sand-100/70 hover:bg-sand-100 px-2 py-2 transition-colors"
            >
              <span className="flex items-center justify-center gap-1 text-sand-700">
                <SatelliteDish size={12} aria-hidden="true" />
                <span className="text-sm font-semibold tabular-nums">{gpsStaleCount}</span>
              </span>
              <span className="block text-[10px] text-sand-600 mt-0.5">{t("opsPages.gpsStale")}</span>
            </Link>
            <Link
              href="/ops/sos"
              className={cn(
                "rounded-xl px-2 py-2 transition-colors",
                openSosCount > 0
                  ? "bg-red-50 hover:bg-red-100"
                  : "bg-sand-100/70 hover:bg-sand-100"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center gap-1",
                  openSosCount > 0 ? "text-red-600" : "text-sand-700"
                )}
              >
                <Siren size={12} aria-hidden="true" />
                <span className="text-sm font-semibold tabular-nums">{openSosCount}</span>
              </span>
              <span className="block text-[10px] text-sand-600 mt-0.5">{t("opsPages.sosBadge")}</span>
            </Link>
          </div>
        </div>

        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wide font-medium text-sand-600">
            {t("opsPages.railTitle")}
          </h2>
          <span className="text-xs text-sand-500 tabular-nums">{jeopardy.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
          {jeopardy.length === 0 ? (
            <p className="text-sm text-sand-600 px-1 py-3">{t("opsPages.railEmpty")}</p>
          ) : (
            jeopardy.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedId(o.id)}
                className={cn(
                  "w-full text-start rounded-xl border px-3 py-2.5 transition-colors",
                  selectedId === o.id
                    ? "border-primary/50 bg-primary/5"
                    : "border-sand-200 bg-white hover:border-primary/30 hover:bg-sand-50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span dir="ltr" className="font-mono text-xs font-medium text-sand-900 truncate">
                    {o.orderNumber}
                  </span>
                  <SlaCountdown deadline={o.slaDeadline} className="text-xs" />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-sand-600 truncate" dir="auto">
                    {o.vendor?.name ?? "—"}
                    {o.driver?.name && <span> · {o.driver.name}</span>}
                  </span>
                  <OrderStatusBadge status={o.status} />
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Map ── */}
      <div className="flex-1 min-w-0">
        <LiveMap
          height="100%"
          zones={zones}
          zoneFillOpacity={0.06}
          drivers={positions}
          selectedDriverId={selectedOrder?.driverId ?? null}
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
