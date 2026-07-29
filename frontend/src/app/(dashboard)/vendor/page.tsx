"use client";
// Darb 2.0 — /vendor: the vendor portal live order board. Status-grouped
// columns (Incoming / Driver en route / Picked up / Done today) fed by
// GET /api/vendor/orders, kept live by surgically merging order.* SSE events
// into the TanStack cache (setQueryData) with a 15s refetch fallback while
// the stream is down. Header: wallet balance, orders today, pause toggle and
// the Live/Reconnecting pill.
import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Phone, PlusCircle, Wallet } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import OrderStatusBadge from "@/components/darb/OrderStatusBadge";
import SlaCountdown from "@/components/darb/SlaCountdown";
import { useDarbEvents } from "@/hooks/useDarbEvents";
import { vendorApi, unwrapList } from "@/lib/darbApi";
import type {
  DarbLiveEvent,
  DeliveryOrder,
  DeliveryOrderStatus,
  OrderEventPayload,
  Paginated,
} from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd } from "@/i18n/format";
import { cn } from "@/lib/cn";

const ORDERS_KEY = ["darb", "vendor", "orders"];

const EVENT_STATUS: Partial<Record<DarbLiveEvent["type"], DeliveryOrderStatus>> = {
  "order.rejected": "REJECTED",
  "order.assigned": "ASSIGNED",
  "order.picked_up": "PICKED_UP",
  "order.delivered": "DELIVERED",
  "order.failed": "FAILED",
  "order.cancelled": "CANCELLED",
  "order.dispatch_exhausted": "NO_DRIVER",
};

type OrdersResponse = Paginated<DeliveryOrder> | DeliveryOrder[];

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function OrderCard({ order }: { order: DeliveryOrder }) {
  const { t, locale } = useI18n();
  const active = !["DELIVERED", "FAILED", "CANCELLED", "REJECTED"].includes(order.status);
  return (
    <Link
      href={`/vendor/orders/${order.id}`}
      className="block rounded-xl border border-sand-200 bg-white p-3.5 hover:border-primary/40 hover:shadow-soft transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <span dir="ltr" className="font-mono text-xs font-medium text-sand-900 truncate">
          {order.orderNumber}
        </span>
        {active && order.slaDeadline ? (
          <SlaCountdown deadline={order.slaDeadline} className="text-xs" />
        ) : (
          <OrderStatusBadge status={order.status} />
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-sm text-sand-800 truncate" dir="auto">
          {order.customerName ?? order.customerPhone ?? t("common.notAvailable")}
        </span>
        {order.paymentMethod === "COD" && (
          <span dir="ltr" className="text-xs font-medium text-sand-900 tabular-nums whitespace-nowrap">
            {formatKwd(order.orderTotalKwd, locale)}
          </span>
        )}
      </div>
      {active && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <OrderStatusBadge status={order.status} />
          {order.paymentMethod === "PREPAID" && (
            <span className="text-[11px] text-sand-500">{t("dispatch.prepaid")}</span>
          )}
        </div>
      )}
      {/* Assigned driver strip */}
      {order.driver && active && (
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-sand-100/70 px-2.5 py-1.5">
          <span className="text-xs font-medium text-sand-800 truncate" dir="auto">
            {order.driver.name}
          </span>
          {order.driver.phone && (
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = `tel:${order.driver?.phone}`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  window.location.href = `tel:${order.driver?.phone}`;
                }
              }}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
              dir="ltr"
            >
              <Phone size={10} aria-hidden="true" />
              {order.driver.phone}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export default function VendorBoardPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    staleTime: 60_000,
  });

  const walletQuery = useQuery({
    queryKey: ["darb", "vendor", "wallet"],
    queryFn: () => vendorApi.wallet(),
    refetchInterval: 60_000,
  });

  // Surgical SSE merge into the orders cache; unknown orders without a full
  // body fall back to an invalidate.
  const onEvent = useCallback(
    (event: DarbLiveEvent) => {
      if (!event.type.startsWith("order.")) return;
      const payload = event.payload as OrderEventPayload;
      if (!payload?.orderId) return;
      let needsRefetch = false;
      queryClient.setQueryData<OrdersResponse>(ORDERS_KEY, (prev) => {
        if (!prev) return prev;
        const list = unwrapList<DeliveryOrder>(prev);
        const idx = list.findIndex((o) => o.id === payload.orderId);
        let nextList: DeliveryOrder[];
        if (idx >= 0) {
          const patch: Partial<DeliveryOrder> = { ...(payload.order ?? {}) };
          if (!payload.order) {
            const mapped = payload.status ?? EVENT_STATUS[event.type];
            if (mapped) patch.status = mapped;
            if (payload.driverId !== undefined) patch.driverId = payload.driverId;
          }
          nextList = [...list];
          nextList[idx] = { ...list[idx], ...patch };
        } else if (payload.order) {
          nextList = [payload.order, ...list];
        } else {
          needsRefetch = true;
          return prev;
        }
        return Array.isArray(prev) ? nextList : { ...prev, data: nextList };
      });
      if (needsRefetch) {
        void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      }
    },
    [queryClient]
  );

  const { connected } = useDarbEvents({ onEvent });

  const ordersQuery = useQuery({
    queryKey: ORDERS_KEY,
    queryFn: () => vendorApi.orders({ limit: 200 }),
    // SSE keeps the cache fresh while connected; poll only as a fallback.
    refetchInterval: connected ? false : 15_000,
  });
  const orders = useMemo(() => unwrapList<DeliveryOrder>(ordersQuery.data), [ordersQuery.data]);

  const columns = useMemo(() => {
    const incoming = orders.filter((o) =>
      ["CREATED", "DISPATCHING", "NO_DRIVER"].includes(o.status)
    );
    const enRoute = orders.filter((o) => o.status === "ASSIGNED");
    const pickedUp = orders.filter((o) => o.status === "PICKED_UP");
    const done = orders.filter(
      (o) =>
        ["DELIVERED", "FAILED", "CANCELLED"].includes(o.status) &&
        isToday(o.deliveredAt ?? o.updatedAt ?? o.createdAt)
    );
    return [
      { key: "incoming", label: t("vendorPortal.colIncoming"), items: incoming },
      { key: "enRoute", label: t("vendorPortal.colEnRoute"), items: enRoute },
      { key: "pickedUp", label: t("vendorPortal.colPickedUp"), items: pickedUp },
      { key: "done", label: t("vendorPortal.colDone"), items: done },
    ];
  }, [orders, t]);

  const ordersToday = useMemo(() => orders.filter((o) => isToday(o.createdAt)).length, [orders]);

  const vendor = meQuery.data;
  const balance = walletQuery.data?.balanceKwd ?? walletQuery.data?.account?.balanceKwd;

  if (ordersQuery.isLoading || meQuery.isLoading) {
    return <PageSkeleton statCards={2} tableRows={6} tableCols={4} />;
  }
  if (ordersQuery.error) {
    return (
      <ErrorState
        error={ordersQuery.error instanceof Error ? ordersQuery.error.message : t("errors.loadingData")}
        onRetry={() => ordersQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">{t("vendorPortal.boardTitle")}</h1>
          <p className="text-sm text-sand-600 mt-1">{t("vendorPortal.boardSubtitle")}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium",
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
          <Link
            href="/vendor/orders/new"
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            <PlusCircle size={15} aria-hidden="true" />
            {t("vendorPortal.newOrder")}
          </Link>
        </div>
      </div>

      {/* Paused is the one state where the board cannot do its job, so the
          banner carries the way out: the toggle now lives in Settings, and a
          merchant who is paused should not have to go looking for it. */}
      {vendor?.isPaused && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          <span>{t("vendorPortal.pausedBanner")}</span>
          <Link
            href="/vendor/settings"
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            {t("vendorPortal.pauseSection")}
          </Link>
        </div>
      )}

      {/* Header stats. The pause toggle used to sit here as a third card and
          again in Settings, two controls for one switch. The board keeps the
          paused banner above, which is information; the switch lives in
          Settings, where the rest of the vendor's own configuration is. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
        <StatCard
          title={t("vendorPortal.walletBalance")}
          value={balance != null ? formatKwd(balance, locale) : t("common.notAvailable")}
          icon={Wallet}
        />
        <StatCard title={t("vendorPortal.ordersToday")} value={ordersToday} icon={ClipboardList} />
      </div>

      {/* Status-grouped board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {columns.map((col) => (
          <section key={col.key} className="bg-card border border-sand-200 rounded-2xl shadow-soft flex flex-col">
            <header className="px-4 py-3 border-b border-sand-200 flex items-center justify-between">
              <h2 className="text-sm font-medium text-sand-900">{col.label}</h2>
              <span className="text-xs text-sand-500 tabular-nums">{col.items.length}</span>
            </header>
            <div className="p-3 space-y-2.5 flex-1 min-h-[8rem] max-h-[32rem] overflow-y-auto">
              {col.items.length === 0 ? (
                <p className="text-xs text-sand-500 px-1 py-2">{t("vendorPortal.emptyColumn")}</p>
              ) : (
                col.items.map((o) => <OrderCard key={o.id} order={o} />)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
