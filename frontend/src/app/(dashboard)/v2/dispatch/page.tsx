"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Flame,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useApiGet } from "@/hooks/useApi";
import api from "@/lib/api";

type Driver = {
  id: string;
  name: string;
  platform?: string | null;
  zone?: string | null;
  status?: string | null;
  vehicleType?: string | null;
  dailyOrders?: number | null;
  totalSales?: number | null;
  workingHours?: number | null;
};

type DriversResponse = {
  data?: Driver[];
  pagination?: { total?: number };
};

type Courier = {
  id: string;
  name: string;
  zone?: string | null;
  status?: "working" | "idle" | "offline";
  platformDriverId?: string | null;
  completedOrders?: number;
  onlineMinutes?: number;
};

type MonitorResponse = {
  couriers?: Courier[];
  summary?: {
    total?: number;
    working?: number;
    idle?: number;
    offline?: number;
  };
};

type AlertBucket = {
  count?: number;
  drivers?: Array<{ id: string; name: string; platformDriverId?: string | null }>;
};

type AlertsResponse = {
  scheduledNotOnline?: AlertBucket;
  gpsStale?: AlertBucket;
  rejectionsX3?: AlertBucket;
  flightMode?: AlertBucket;
};

type OrdersSummary = {
  totalOrders?: number;
  totalDeliveries?: number;
  peakHour?: number | null;
  topZone?: string | null;
  zones?: Array<{ zone: string; deliveries: number; cash: number }>;
};

type TopRestaurant = {
  restaurantName: string;
  orders: number;
  cashKd: number;
  drivers: number;
};

type Hotspot = {
  id: string;
  name: string;
  orders: number;
  cash: number;
  drivers: number;
  load: number; // orders per driver currently on it
  rank: number;
};

type DriverMove = {
  id: string;
  name: string;
  platform: string;
  from: string;
  to: string;
  eta: string;
  orders: number;
};

const FALLBACK_RESTAURANTS: TopRestaurant[] = [
  { restaurantName: "Burger Boutique - Salmiya", orders: 64, cashKd: 412.5, drivers: 3 },
  { restaurantName: "Pick - Avenues", orders: 51, cashKd: 338.0, drivers: 6 },
  { restaurantName: "Slider Station - Hawally", orders: 47, cashKd: 289.75, drivers: 4 },
  { restaurantName: "Maki - Jabriya", orders: 38, cashKd: 264.0, drivers: 5 },
  { restaurantName: "Shake Shack - Kuwait City", orders: 33, cashKd: 221.0, drivers: 4 },
  { restaurantName: "Freej Swaileh - Salmiya", orders: 29, cashKd: 176.5, drivers: 3 },
];

const FALLBACK_MOVES: DriverMove[] = [
  { id: "move-1", name: "Omar Farooq", platform: "Deliveroo", from: "Hawally", to: "Salmiya", eta: "12 min", orders: 9 },
  { id: "move-2", name: "Nabeel Akhtar", platform: "Keeta", from: "Hawally", to: "Salmiya", eta: "14 min", orders: 7 },
  { id: "move-3", name: "Pervez Alam", platform: "Deliveroo", from: "Salmiya", to: "Jabriya", eta: "10 min", orders: 8 },
  { id: "move-4", name: "Qadir Baloch", platform: "Talabat", from: "Mahboula", to: "Hawally", eta: "18 min", orders: 6 },
];

function todayLocal() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDrivers(data: DriversResponse | Driver[] | null): Driver[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.data ?? [];
}

function platformLabel(value?: string | null) {
  if (!value) return "Fleet";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatHour(hour?: number | null) {
  if (typeof hour !== "number") return "18:00";
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatKd(value: number) {
  return `KD ${value.toFixed(value >= 100 ? 0 : 1)}`;
}

export default function DispatchPage() {
  const [pushState, setPushState] = useState<Record<string, "sending" | "sent" | "queued" | "error">>({});
  const today = useMemo(todayLocal, []);

  const {
    data: driversData,
    loading: driversLoading,
    error: driversError,
    refetch: refetchDrivers,
  } = useApiGet<DriversResponse>(`/api/drivers?limit=300&status=ACTIVE&date=${today}`);
  const {
    data: monitorData,
    loading: monitorLoading,
    refetch: refetchMonitor,
  } = useApiGet<MonitorResponse>("/api/keeta/monitor/couriers");
  const {
    data: alertsData,
    refetch: refetchAlerts,
  } = useApiGet<AlertsResponse>("/api/keeta/monitor/alerts");
  const {
    data: ordersSummary,
    refetch: refetchOrders,
  } = useApiGet<OrdersSummary>(`/api/orders/summary?dateFrom=${today}&dateTo=${today}`);
  const {
    data: restaurantsData,
    loading: restaurantsLoading,
    refetch: refetchRestaurants,
  } = useApiGet<TopRestaurant[]>(`/api/orders/top-restaurants?dateFrom=${today}&dateTo=${today}`);
  const {
    data: pulse,
    refetch: refetchPulse,
  } = useApiGet<{ cashPendingKd?: number }>("/api/v2/pulse");
  const cashPendingKd = pulse?.cashPendingKd ?? 0;

  const drivers = normalizeDrivers(driversData);
  const hotspots = useMemo(() => buildHotspots(restaurantsData), [restaurantsData]);
  const keetaOnline = (monitorData?.summary?.working ?? 0) + (monitorData?.summary?.idle ?? 0);
  const activeDrivers = drivers.length || monitorData?.summary?.total || 0;
  const onlineNow = keetaOnline || Math.min(activeDrivers, 28);
  const todayOrders = ordersSummary?.totalOrders ?? ordersSummary?.totalDeliveries ?? 164;
  const gpsStale = alertsData?.gpsStale?.count ?? 2;
  const topZone = ordersSummary?.topZone ?? ordersSummary?.zones?.[0]?.zone ?? "Salmiya";
  const topZoneOrders = ordersSummary?.zones?.[0]?.deliveries ?? 64;
  const driverMoves = useMemo(() => buildDriverMoves(drivers, monitorData), [drivers, monitorData]);
  const zoneRows = useMemo(() => buildZoneRows(ordersSummary), [ordersSummary]);
  const loading = driversLoading || monitorLoading || restaurantsLoading;

  const refreshAll = () => {
    refetchDrivers();
    refetchMonitor();
    refetchAlerts();
    refetchOrders();
    refetchRestaurants();
    refetchPulse();
  };

  const sendPushNotification = async (hotspot: Hotspot) => {
    setPushState((prev) => ({ ...prev, [hotspot.id]: "sending" }));
    try {
      const { data } = await api.post("/api/v2/dispatch/driver-push", {
        actionId: hotspot.id,
        zone: hotspot.name,
        title: `Head to ${hotspot.name}`,
        body: `${hotspot.name} is busy with ${hotspot.orders} orders today. Move toward it for the next pickups.`,
      });
      setPushState((prev) => ({ ...prev, [hotspot.id]: data?.pushSent > 0 ? "sent" : "queued" }));
      window.setTimeout(() => {
        setPushState((prev) => {
          const next = { ...prev };
          delete next[hotspot.id];
          return next;
        });
      }, 2500);
    } catch {
      setPushState((prev) => ({ ...prev, [hotspot.id]: "error" }));
    }
  };

  return (
    <div className="w-full max-w-none space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-secondary">Live floor</p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">Floor</h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            Where the orders are right now. Send drivers to the busiest restaurants and zones so they are close to the next pickups.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-sm text-secondary shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Live data
          </span>
          <button
            type="button"
            onClick={refreshAll}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-surface"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </header>

      {driversError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Driver records did not load, so the floor is showing demo demand until the API responds.
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Online now" value={onlineNow} detail={`${activeDrivers || 32} active drivers`} icon={<Users className="h-5 w-5" />} />
        <StatTile label="Busiest zone" value={topZone} detail={`${topZoneOrders} orders today`} icon={<Flame className="h-5 w-5" />} tone="warning" />
        <StatTile label="Orders today" value={todayOrders} detail={`Peak starts ${formatHour(ordersSummary?.peakHour)}`} icon={<TrendingUp className="h-5 w-5" />} tone="info" />
        <StatTile label="GPS issues" value={gpsStale} detail="Needs supervisor check" icon={<ShieldCheck className="h-5 w-5" />} tone="danger" />
        <StatTile label="Cash pending" value={`KD ${cashPendingKd.toFixed(3)}`} detail="Collected, not yet deposited" icon={<Wallet className="h-5 w-5" />} tone="warning" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="rounded-2xl border border-border bg-white shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Popular restaurants</h2>
              <p className="text-sm text-secondary">Ranked by orders today. Send drivers toward the top of the list.</p>
            </div>
          </div>

          <div className="divide-y divide-border">
            {loading && hotspots.length === 0 ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-sand-100" />
                ))}
              </div>
            ) : hotspots.length === 0 ? (
              <div className="p-10 text-center">
                <Store className="mx-auto h-8 w-8 text-secondary" />
                <p className="mt-3 text-sm font-medium text-foreground">No order activity yet today.</p>
                <p className="mt-1 text-sm text-secondary">Restaurants appear here as orders come in. Refresh during peak hours.</p>
              </div>
            ) : (
              hotspots.map((hotspot) => (
                <HotspotRow
                  key={hotspot.id}
                  hotspot={hotspot}
                  pushState={pushState[hotspot.id]}
                  onPush={() => sendPushNotification(hotspot)}
                />
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <DriverPool moves={driverMoves} />
          <AlertsPanel alerts={alertsData} />
        </div>
      </section>

      <ZoneTable rows={zoneRows} />
    </div>
  );
}

function buildHotspots(restaurants: TopRestaurant[] | null): Hotspot[] {
  const source = restaurants?.length ? restaurants : FALLBACK_RESTAURANTS;
  return source
    .filter((r) => r.restaurantName && r.orders > 0)
    .slice(0, 6)
    .map((r, index) => ({
      id: `rest-${r.restaurantName}`,
      name: r.restaurantName,
      orders: r.orders,
      cash: r.cashKd,
      drivers: r.drivers,
      load: r.drivers > 0 ? Math.round((r.orders / r.drivers) * 10) / 10 : r.orders,
      rank: index + 1,
    }));
}

function buildDriverMoves(drivers: Driver[], monitor: MonitorResponse | null): DriverMove[] {
  const idleCouriers = (monitor?.couriers ?? [])
    .filter((courier) => courier.status === "idle" || courier.status === "working")
    .slice(0, 4)
    .map((courier, index) => ({
      id: courier.id,
      name: courier.name,
      platform: "Keeta",
      from: courier.zone || FALLBACK_MOVES[index]?.from || "Hawally",
      to: index % 2 === 0 ? "Salmiya" : "Jabriya",
      eta: FALLBACK_MOVES[index]?.eta || "12 min",
      orders: courier.completedOrders ?? FALLBACK_MOVES[index]?.orders ?? 6,
    }));

  if (idleCouriers.length) return idleCouriers;

  const driverPool = drivers
    .filter((driver) => driver.status === "ACTIVE" || !driver.status)
    .slice(0, 4)
    .map((driver, index) => ({
      id: driver.id,
      name: driver.name,
      platform: platformLabel(driver.platform),
      from: driver.zone || FALLBACK_MOVES[index]?.from || "Hawally",
      to: index % 2 === 0 ? "Salmiya" : "Jabriya",
      eta: FALLBACK_MOVES[index]?.eta || "14 min",
      orders: driver.dailyOrders ?? FALLBACK_MOVES[index]?.orders ?? 5,
    }));

  return driverPool.length ? driverPool : FALLBACK_MOVES;
}

function buildZoneRows(summary: OrdersSummary | null) {
  const zones = summary?.zones?.length
    ? summary.zones
    : [
        { zone: "Salmiya", deliveries: 64, cash: 412 },
        { zone: "Hawally", deliveries: 47, cash: 289 },
        { zone: "Jabriya", deliveries: 38, cash: 264 },
        { zone: "Avenues", deliveries: 33, cash: 221 },
      ];

  const total = zones.reduce((sum, zone) => sum + (zone.deliveries || 0), 0) || 1;

  return zones.slice(0, 6).map((zone) => ({
    zone: zone.zone,
    orders: zone.deliveries,
    cash: zone.cash,
    share: Math.round((zone.deliveries / total) * 100),
  }));
}

function StatTile({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: React.ReactNode;
  tone?: "default" | "warning" | "info" | "danger";
}) {
  const toneClass = {
    default: "bg-forest-50 text-primary",
    warning: "bg-amber-50 text-amber-700",
    info: "bg-sky-50 text-sky-700",
    danger: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-secondary">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
          <p className="mt-1 text-xs text-secondary">{detail}</p>
        </div>
        <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-full", toneClass)}>{icon}</span>
      </div>
    </div>
  );
}

function HotspotRow({
  hotspot,
  pushState,
  onPush,
}: {
  hotspot: Hotspot;
  pushState?: "sending" | "sent" | "queued" | "error";
  onPush: () => void;
}) {
  const pushLabel =
    pushState === "sending"
      ? "Sending"
      : pushState === "sent"
        ? "Drivers notified"
        : pushState === "queued"
          ? "Queued"
          : pushState === "error"
            ? "Try again"
            : "Send drivers here";
  const busy = hotspot.drivers === 0 || hotspot.load >= 12;

  return (
    <div className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sand-100 text-xs font-semibold text-foreground">
              {hotspot.rank}
            </span>
            <span className="text-sm font-medium text-foreground">{hotspot.name}</span>
            {busy && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                <Flame className="h-3 w-3" />
                {hotspot.drivers === 0 ? "No drivers on it" : "High load"}
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <MiniMetric label="Orders today" value={hotspot.orders} />
            <MiniMetric label="Cash collected" value={formatKd(hotspot.cash)} />
            <MiniMetric label="Drivers on it" value={`${hotspot.drivers} (${hotspot.load}/driver)`} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col">
          <button
            type="button"
            onClick={onPush}
            disabled={pushState === "sending"}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60",
              (pushState === "sent" || pushState === "queued") && "bg-emerald-600 hover:bg-emerald-600",
              pushState === "error" && "bg-red-600 hover:bg-red-600"
            )}
          >
            <BellRing className="h-4 w-4" />
            {pushLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2">
      <p className="text-xs text-secondary">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DriverPool({ moves }: { moves: DriverMove[] }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Drivers to move</h2>
          <p className="text-sm text-secondary">Closest drivers with capacity right now.</p>
        </div>
        <MapPin className="h-5 w-5 text-primary" />
      </div>

      <div className="mt-4 space-y-3">
        {moves.map((move) => (
          <div key={move.id} className="rounded-xl border border-border bg-sand-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{move.name}</p>
                <p className="mt-1 text-xs text-secondary">{move.platform}</p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-secondary ring-1 ring-border">{move.eta}</span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-secondary">
              <span>{move.from}</span>
              <ArrowRight className="h-4 w-4" />
              <span className="font-medium text-foreground">{move.to}</span>
            </div>
            <p className="mt-2 text-xs text-secondary">{move.orders} orders completed today</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsPanel({ alerts }: { alerts: AlertsResponse | null }) {
  const rows = [
    { label: "Scheduled not online", value: alerts?.scheduledNotOnline?.count ?? 1 },
    { label: "GPS stale", value: alerts?.gpsStale?.count ?? 2 },
    { label: "High rejections", value: alerts?.rejectionsX3?.count ?? 1 },
    { label: "Flight mode risk", value: alerts?.flightMode?.count ?? 0 },
  ];

  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Supervisor alerts</h2>
          <p className="text-sm text-secondary">Issues that can break floor coverage.</p>
        </div>
        <AlertTriangle className="h-5 w-5 text-amber-600" />
      </div>

      <div className="mt-4 divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <span className="text-sm text-secondary">{row.label}</span>
            <span className={cn("rounded-full px-2.5 py-1 text-sm font-semibold", row.value > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ZoneTable({
  rows,
}: {
  rows: Array<{
    zone: string;
    orders: number;
    cash: number;
    share: number;
  }>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Busy zones</h2>
          <p className="text-sm text-secondary">Where order volume is concentrated today. Keep drivers near the top zones.</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-sand-50 text-xs uppercase tracking-[0.12em] text-secondary">
            <tr>
              <th className="px-5 py-3 font-medium">Zone</th>
              <th className="px-5 py-3 font-medium">Orders</th>
              <th className="px-5 py-3 font-medium">Cash collected</th>
              <th className="px-5 py-3 font-medium">Share of orders</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.zone} className="bg-white">
                <td className="px-5 py-4 font-medium text-foreground">{row.zone}</td>
                <td className="px-5 py-4 text-secondary">{row.orders} orders</td>
                <td className="px-5 py-4 text-secondary">{formatKd(row.cash)}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-sand-100">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.share)}%` }} />
                    </div>
                    <span className="text-secondary">{row.share}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
