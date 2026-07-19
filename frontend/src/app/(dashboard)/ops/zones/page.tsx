"use client";
// Darb 2.0 — /ops/zones: zone-load overview. Choropleth LiveMap (polygon fill
// opacity scales with each zone's share of active orders) + a DataTable of
// zone, active orders, online drivers, load ratio and average SLA runway.
// Uses richer zoneLoads fields when the API provides them; otherwise derives
// drivers-per-zone from the position store and SLA averages from the active
// order list.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import LiveMap from "@/components/map/LiveMap";
import { useSlaTick } from "@/components/darb/useSlaTick";
import { bootstrapPositions, useDriverPositions } from "@/lib/driverPositionStore";
import { deliveryOrdersApi, dispatchApi, unwrapList, zonesApi } from "@/lib/darbApi";
import { pointInZone } from "@/lib/geo";
import type { DeliveryOrder, DeliveryZone } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";

const ACTIVE_STATUSES = ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED", "PICKED_UP"];
const MIN_FILL = 0.06;
const MAX_FILL = 0.55;

interface ZoneRow {
  id: string;
  name: string;
  activeOrders: number;
  onlineDrivers: number | null;
  loadRatio: number | null;
  avgSlaRemainingMs: number | null;
}

export default function OpsZonesPage() {
  const { t, locale } = useI18n();
  const now = useSlaTick();
  const positions = useDriverPositions();

  const zonesQuery = useQuery({
    queryKey: ["darb", "zones"],
    queryFn: () => zonesApi.list(),
    staleTime: 5 * 60_000,
  });
  const zones = useMemo(() => unwrapList<DeliveryZone>(zonesQuery.data), [zonesQuery.data]);

  const overviewQuery = useQuery({
    queryKey: ["darb", "dispatch", "overview"],
    queryFn: () => dispatchApi.overview(),
    refetchInterval: 30_000,
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

  // Position snapshot for the drivers-per-zone fallback.
  useEffect(() => {
    dispatchApi
      .positions()
      .then((res) => bootstrapPositions(unwrapList(res)))
      .catch(() => {});
  }, []);

  const rows = useMemo<ZoneRow[]>(() => {
    const loads = overviewQuery.data?.zoneLoads ?? [];
    const loadByZone = new Map(loads.map((l) => [l.zoneId, l]));
    const onlineDrivers = positions.filter((p) => p.availability !== "OFFLINE" && !p.stale);

    return zones
      .filter((z) => z.isActive !== false)
      .map((zone) => {
        const load = loadByZone.get(zone.id);
        const zoneOrders = activeOrders.filter((o) => o.dropoffZoneId === zone.id);
        const activeCount = load?.activeOrders ?? zoneOrders.length;

        const driversHere =
          load?.onlineDrivers ??
          onlineDrivers.filter((p) => pointInZone(p.lat, p.lng, zone)).length;

        const ratio =
          load?.loadRatio ?? (driversHere > 0 ? activeCount / driversHere : activeCount > 0 ? null : 0);

        let avgMs: number | null =
          load?.avgSlaRemainingSec != null ? load.avgSlaRemainingSec * 1000 : null;
        if (avgMs == null) {
          const withSla = zoneOrders.filter((o) => o.slaDeadline);
          if (withSla.length > 0) {
            avgMs =
              withSla.reduce((sum, o) => sum + (new Date(o.slaDeadline as string).getTime() - now), 0) /
              withSla.length;
          }
        }

        return {
          id: zone.id,
          name: locale === "ar" && zone.nameAr ? zone.nameAr : zone.name,
          activeOrders: activeCount,
          onlineDrivers: driversHere,
          loadRatio: ratio,
          avgSlaRemainingMs: avgMs,
        };
      })
      .sort((a, b) => b.activeOrders - a.activeOrders);
  }, [zones, overviewQuery.data?.zoneLoads, activeOrders, positions, now, locale]);

  // Choropleth: fill opacity scales with each zone's share of the busiest zone.
  const fillOpacityById = useMemo(() => {
    const max = Math.max(1, ...rows.map((r) => r.activeOrders));
    const out: Record<string, number> = {};
    for (const r of rows) {
      out[r.id] = MIN_FILL + (r.activeOrders / max) * (MAX_FILL - MIN_FILL);
    }
    return out;
  }, [rows]);

  const columns = [
    {
      key: "name",
      label: t("opsPages.zone"),
      render: (v: string) => (
        <span dir="auto" className="font-medium text-sand-900">
          {v}
        </span>
      ),
    },
    {
      key: "activeOrders",
      label: t("opsPages.activeOrders"),
      render: (v: number) => <span className="tabular-nums">{v}</span>,
    },
    {
      key: "onlineDrivers",
      label: t("opsPages.onlineDrivers"),
      render: (v: number | null) =>
        v == null ? <span className="text-sand-400">—</span> : <span className="tabular-nums">{v}</span>,
    },
    {
      key: "loadRatio",
      label: t("opsPages.loadRatio"),
      render: (v: number | null) =>
        v == null ? (
          <span className="text-red-600 font-medium" dir="ltr">
            ∞
          </span>
        ) : (
          <span className="tabular-nums" dir="ltr">
            {v.toFixed(1)}
          </span>
        ),
    },
    {
      key: "avgSlaRemainingMs",
      label: t("opsPages.avgSla"),
      render: (v: number | null) => {
        if (v == null) return <span className="text-sand-400">—</span>;
        const breached = v <= 0;
        const totalMin = Math.floor(Math.abs(v) / 60_000);
        const sec = Math.floor((Math.abs(v) % 60_000) / 1000);
        return (
          <span
            dir="ltr"
            className={`tabular-nums font-medium ${breached ? "text-red-600" : totalMin < 10 ? "text-amber-600" : "text-green-700"}`}
          >
            {breached ? "-" : ""}
            {String(totalMin).padStart(2, "0")}:{String(sec).padStart(2, "0")}
          </span>
        );
      },
    },
  ];

  if (zonesQuery.isLoading || overviewQuery.isLoading) {
    return <PageSkeleton statCards={0} tableRows={6} tableCols={5} />;
  }
  if (zonesQuery.error) {
    return (
      <ErrorState
        error={zonesQuery.error instanceof Error ? zonesQuery.error.message : t("errors.loadingData")}
        onRetry={() => zonesQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("opsPages.zonesTitle")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("opsPages.zonesSubtitle")}</p>
      </div>

      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
        <LiveMap height="420px" zones={zones} zoneFillOpacityById={fillOpacityById} />
      </div>

      <DataTable columns={columns} data={rows} emptyMessage={t("zonesPage.noZones")} />
    </div>
  );
}
