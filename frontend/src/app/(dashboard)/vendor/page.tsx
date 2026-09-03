"use client";
// Darb 2.0 — /vendor: the vendor portal live order board. Status-grouped
// columns (Incoming / Driver en route / Picked up / Done today) fed by
// GET /api/vendor/orders, kept live by surgically merging order.* SSE events
// into the TanStack cache (setQueryData) with a 15s refetch fallback while
// the stream is down. Header: wallet balance, orders today, pause toggle and
// the Live/Reconnecting pill.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Download, Phone, PlusCircle, Store, Wallet, XCircle } from "lucide-react";
import ConfirmModal from "@/components/shared/ConfirmModal";
import StatCard from "@/components/shared/StatCard";
import { useToast } from "@/components/shared/Toast";
import { downloadBlob } from "@/utils/downloadBlob";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import OrderStatusBadge from "@/components/darb/OrderStatusBadge";
import SlaCountdown from "@/components/darb/SlaCountdown";
import { useVendorBranch } from "@/contexts/VendorBranchContext";
import BranchFilter from "@/components/vendor/BranchFilter";
import { useDarbEvents } from "@/hooks/useDarbEvents";
import { fetchAllPages, vendorApi, unwrapList } from "@/lib/darbApi";
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

/**
 * The states a shop may still call off, mirroring the vendor cancel endpoint.
 *
 * ARRIVED is in the list: the driver is standing at the counter and has not
 * taken the bag, which is exactly the moment a kitchen discovers it cannot
 * fulfil the order. Once it is PICKED_UP the order is on the road and stopping
 * it is Darb's call, not the shop's.
 */
const CANCELLABLE: DeliveryOrderStatus[] = [
  "CREATED",
  "DISPATCHING",
  "NO_DRIVER",
  "ASSIGNED",
  "ARRIVED",
];

/** Only these portal roles may cancel; the endpoint enforces the same pair. */
// Edit #8: the operational roles of the shared matrix. Accountants and
// viewers watch; they do not call an order off.
const CAN_CANCEL_ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];

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

/**
 * How long the courier has been standing at the counter.
 *
 * Counts up rather than down on purpose: this is the shop's own handover, and
 * there is no deadline to run out, only a number that keeps growing until
 * somebody hands the bag over.
 */
function WaitingSince({ since }: { since: string }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <span dir="ltr" className="text-xs font-medium tabular-nums text-amber-700">
      {mm}:{ss} {t("vendorPortal.waitingSince")}
    </span>
  );
}

function OrderCard({
  order,
  showBranch,
  onCancel,
}: {
  order: DeliveryOrder;
  showBranch?: boolean;
  /** Omitted when this login may not call the order off. */
  onCancel?: (order: DeliveryOrder) => void;
}) {
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
        {order.status === "ARRIVED" && order.arrivedAt ? (
          <WaitingSince since={order.arrivedAt} />
        ) : active && order.slaDeadline ? (
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
      {/* Whose counter this order is sitting on. Only worth a line when the
          board is showing more than one branch at once: with a branch selected,
          every card on screen is that branch and the label is noise. */}
      {showBranch && order.branch?.name && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-sand-500">
          <Store size={10} aria-hidden="true" className="shrink-0" />
          <span className="truncate" dir="auto">
            {order.branch.name}
          </span>
        </div>
      )}
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
            {/* The stage says where the driver is going; the ETA says when.
                ASSIGNED is heading to the shop, PICKED_UP to the customer. */}
            {order.slaDeadline && (order.status === "ASSIGNED" || order.status === "PICKED_UP") && (
              <span className="ms-1.5 text-[11px] font-normal text-sand-600">
                <SlaCountdown deadline={order.slaDeadline} className="text-[11px]" />{" "}
                {order.status === "ASSIGNED"
                  ? t("vendorPortal.etaStore")
                  : t("vendorPortal.etaCustomer")}
              </span>
            )}
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
      {/* Calling the order off, on the card.
          It used to live only inside the order detail page, so a shop that had
          just been told the item is out of stock had to open the order to say
          so while the driver waited at the counter. The card is where they are
          already looking. The whole card is a link, so this stops the click
          from opening the order underneath the modal. */}
      {onCancel && (
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel(order);
            }}
            className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <XCircle size={11} aria-hidden="true" />
            {t("dispatch.cancelOrder")}
          </button>
        </div>
      )}
    </Link>
  );
}

export default function VendorBoardPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const { branchId, inspectVendorId } = useVendorBranch();
  // Live work and finished work are two different questions, so they are two
  // tabs rather than a fourth column of things nobody needs to act on.
  const [tab, setTab] = useState<"live" | "delivered">("live");
  const [exporting, setExporting] = useState(false);
  // The order the shop is calling off, and the reason the endpoint requires.
  // Held here rather than inside the card so the modal renders outside the
  // card's own <Link> and a click in it cannot open the order behind it.
  const [cancelTarget, setCancelTarget] = useState<DeliveryOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const toast = useToast();

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
      queryClient.setQueryData<OrdersResponse>([...ORDERS_KEY, branchId], (prev) => {
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
    [queryClient, branchId]
  );

  const { connected } = useDarbEvents({ onEvent });

  // The branch pills are part of the cache key: without it, switching branch
  // showed the previous branch's board until something else invalidated it.
  const ordersQuery = useQuery({
    queryKey: [...ORDERS_KEY, branchId],
    // Paged to the end, not `limit: 200`. getPagination clamps limit to 100, so
    // the board silently kept only the newest 100 orders across every status:
    // "Orders today" capped, the Delivered tab went short, and a scheduled
    // order sitting in CREATED dropped off the Incoming column as soon as 100
    // newer orders existed, while the state machine happily kept it alive.
    queryFn: () =>
      fetchAllPages<DeliveryOrder>((params) =>
        vendorApi.orders({ ...params, branchId: branchId ?? undefined }),
      ),
    // SSE keeps the cache fresh while connected; poll only as a fallback.
    refetchInterval: connected ? false : 15_000,
  });
  const orders = useMemo(() => unwrapList<DeliveryOrder>(ordersQuery.data), [ordersQuery.data]);

  // An inspecting admin gets GETs only (middleware/vendorScope), and an
  // accountant's login is refused by the endpoint, so neither is offered the
  // button. The role comes from the server's answer, not the token.
  const mayCancel =
    !inspectVendorId && CAN_CANCEL_ROLES.includes(meQuery.data?.portalRole ?? "ADMIN");
  const openCancel = (order: DeliveryOrder) => {
    setCancelReason("");
    setCancelTarget(order);
  };
  /** The handler for one card, or undefined when that card cannot be called off. */
  const cancelHandler = (order: DeliveryOrder) =>
    mayCancel && CANCELLABLE.includes(order.status) ? openCancel : undefined;

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await vendorApi.cancelOrder(cancelTarget.id, cancelReason.trim());
      toast.success(t("toast.updated"));
      setCancelTarget(null);
      setCancelReason("");
      await queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    } catch (err) {
      const resp = (err as { response?: { status?: number; data?: { error?: string } } }).response;
      // 409 is the state machine saying somebody got there first: the driver
      // collected it while the modal was open. Refetch so the board agrees.
      toast.error(resp?.data?.error ?? t("toast.failedSave"));
      if (resp?.status === 409) {
        setCancelTarget(null);
        await queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      }
    } finally {
      setCancelling(false);
    }
  }

  // Revision 8 (#3). The live board is the work still in front of the shop,
  // in the order the shop experiences it: waiting on a driver, driver coming,
  // driver standing at the counter, gone to the customer. Finished orders are
  // not part of that and moved to their own tab.
  const columns = useMemo(() => {
    const incoming = orders.filter((o) =>
      ["CREATED", "DISPATCHING", "NO_DRIVER"].includes(o.status)
    );
    const enRoute = orders.filter((o) => o.status === "ASSIGNED");
    const arrived = orders.filter((o) => o.status === "ARRIVED");
    const pickedUp = orders.filter((o) => o.status === "PICKED_UP");
    return [
      { key: "incoming", label: t("vendorPortal.colIncoming"), items: incoming },
      { key: "enRoute", label: t("vendorPortal.colEnRoute"), items: enRoute },
      { key: "arrived", label: t("vendorPortal.colArrived"), items: arrived },
      { key: "pickedUp", label: t("vendorPortal.colPickedUp"), items: pickedUp },
    ];
  }, [orders, t]);

  // Everything that ended today, whichever way it ended. A shop chasing a
  // complaint needs the failed and cancelled ones here too, not only the
  // delivered ones.
  const finishedToday = useMemo(
    () =>
      orders
        .filter(
          (o) =>
            ["DELIVERED", "FAILED", "CANCELLED", "RETURNED"].includes(o.status) &&
            isToday(o.deliveredAt ?? o.updatedAt ?? o.createdAt)
        )
        .sort(
          (a, b) =>
            new Date(b.deliveredAt ?? b.updatedAt ?? b.createdAt).getTime() -
            new Date(a.deliveredAt ?? a.updatedAt ?? a.createdAt).getTime()
        ),
    [orders]
  );

  const ordersToday = useMemo(() => orders.filter((o) => isToday(o.createdAt)).length, [orders]);

  // A count per branch pill, over whichever tab is open, so the numbers match
  // the board underneath them.
  //
  // Only while showing all branches: the request is scoped server-side, so with
  // one branch selected the other branches are simply not in this payload and
  // any number next to them would be a zero that means "not fetched".
  const branchCounts = useMemo(() => {
    if (branchId !== null) return undefined;
    const visible = tab === "live" ? columns.flatMap((c) => c.items) : finishedToday;
    const out: Record<string, number> & { all?: number } = { all: visible.length };
    for (const o of visible) {
      if (o.branchId) out[o.branchId] = (out[o.branchId] ?? 0) + 1;
    }
    return out;
  }, [branchId, tab, columns, finishedToday]);

  // With a branch selected every card on screen is that branch, so the per-card
  // branch label only earns its line on the all-branches board.
  const showBranch = branchId === null;

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
          {/* An inspecting admin gets GETs only, so the server would refuse
              this. Hidden rather than disabled: there is nothing they could do
              to earn it. */}
          {/* Revision 8 (#4). The board shows a page at a time; a shop
              reconciling a week against its own books needs the lot. Opens the
              workbook endpoint directly, so the browser handles the download
              and no blob is assembled in memory. */}
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await downloadBlob(
                  vendorApi.ordersExportUrl({ branchId, vendorId: inspectVendorId }),
                  `darb-orders-${new Date().toISOString().slice(0, 10)}.xlsx`
                );
              } catch {
                toast.error(t("reportsPage.exportFailed"));
              } finally {
                setExporting(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-sand-100 text-sand-800 text-sm font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
          >
            <Download size={15} aria-hidden="true" />
            {exporting ? t("common.processing") : t("vendorPortal.exportOrders")}
          </button>
          {!inspectVendorId && (
            <Link
              href="/vendor/orders/new"
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              <PlusCircle size={15} aria-hidden="true" />
              {t("vendorPortal.newOrder")}
            </Link>
          )}
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

      {/* Live / Delivered, and which branch's board this is. Two filters on one
          row because they answer the same question together: which orders am I
          looking at. */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit">
        {(["live", "delivered"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "px-4 h-9 text-sm font-medium rounded-pill transition-colors",
              tab === key ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900"
            )}
          >
            {key === "live" ? t("vendorPortal.tabLive") : t("vendorPortal.tabDelivered")}
            <span className="ms-1.5 text-xs text-sand-500 tabular-nums">
              {key === "live"
                ? columns.reduce((n, c) => n + c.items.length, 0)
                : finishedToday.length}
            </span>
          </button>
        ))}
      </div>
        <BranchFilter counts={branchCounts} />
      </div>

      {tab === "delivered" ? (
        <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
          <div className="p-3 space-y-2.5">
            {finishedToday.length === 0 ? (
              <p className="text-xs text-sand-500 px-1 py-6 text-center">
                {t("vendorPortal.emptyColumn")}
              </p>
            ) : (
              finishedToday.map((o) => (
                <OrderCard key={o.id} order={o} showBranch={showBranch} />
              ))
            )}
          </div>
        </section>
      ) : (
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
                col.items.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    showBranch={showBranch}
                    onCancel={cancelHandler(o)}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
      )}

      <ConfirmModal
        open={!!cancelTarget}
        title={t("dispatch.cancelConfirmTitle")}
        message={t("vendorPortal.cancelMessage")}
        variant="danger"
        loading={cancelling}
        confirmLabel={t("dispatch.cancelOrder")}
        confirmDisabled={cancelReason.trim() === ""}
        onConfirm={() => void confirmCancel()}
        onCancel={() => {
          setCancelTarget(null);
          setCancelReason("");
        }}
      >
        <label className="block">
          <span className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
            {t("dispatch.cancelReason")}
          </span>
          <input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            maxLength={500}
            autoFocus
            className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
      </ConfirmModal>
    </div>
  );
}
