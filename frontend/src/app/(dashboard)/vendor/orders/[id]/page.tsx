"use client";
// Darb 2.0 — /vendor/orders/[id]: vendor-facing order detail. Status timeline
// (API events when present, else the order's own status timestamps), assigned
// DriverCard, cash/PIN callouts and a pre-pickup cancel with confirmation.
// Data comes exclusively from /api/vendor/* (the vendor list endpoint — no
// staff endpoints are reachable for VENDOR tokens).
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, HandCoins, KeyRound, XCircle } from "lucide-react";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import DriverCard from "@/components/darb/DriverCard";
import OrderStatusBadge from "@/components/darb/OrderStatusBadge";
import SlaCountdown from "@/components/darb/SlaCountdown";
import LiveMap from "@/components/map/LiveMap";
import { vendorApi, unwrapList } from "@/lib/darbApi";
import type { DeliveryOrder, DeliveryOrderEvent } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatTime } from "@/i18n/format";

const CANCELLABLE = ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED"];
const TERMINAL = ["DELIVERED", "FAILED", "CANCELLED", "REJECTED"];

/** Timeline fallback derived from the order's own status timestamps. */
function derivedTimeline(order: DeliveryOrder, t: (k: string) => string): DeliveryOrderEvent[] {
  const steps: { key: string; label: string; at: string | null | undefined }[] = [
    { key: "created", label: t("darbOrderStatus.created"), at: order.createdAt },
    { key: "assigned", label: t("darbOrderStatus.assigned"), at: order.assignedAt },
    { key: "picked_up", label: t("darbOrderStatus.pickedUp"), at: order.pickedUpAt },
    { key: "delivered", label: t("darbOrderStatus.delivered"), at: order.deliveredAt },
  ];
  return steps
    .filter((s) => !!s.at)
    .map((s, i) => ({
      id: `derived-${i}`,
      action: s.key,
      description: s.label,
      timestamp: s.at as string,
    }));
}

export default function VendorOrderDetailPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;
  const queryClient = useQueryClient();

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // The backend requires a non-empty reason on cancel.
  const [cancelReason, setCancelReason] = useState("");
  // PRD build — refund request (DELIVERED orders without an existing refund).
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundReason, setRefundReason] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["darb", "vendor", "orders"],
    queryFn: () => vendorApi.orders({ limit: 200 }),
    refetchInterval: 10_000,
  });

  const order = useMemo(
    () => unwrapList<DeliveryOrder>(ordersQuery.data).find((o) => o.id === orderId) ?? null,
    [ordersQuery.data, orderId]
  );

  const refundsQuery = useQuery({
    queryKey: ["darb", "vendor", "refunds"],
    queryFn: () => vendorApi.refunds(),
  });
  const existingRefund = useMemo(
    () => (refundsQuery.data ?? []).find((r) => r.orderId === orderId) ?? null,
    [refundsQuery.data, orderId]
  );

  const timeline = useMemo<DeliveryOrderEvent[]>(() => {
    if (!order) return [];
    const events = (order as DeliveryOrder & { events?: DeliveryOrderEvent[] }).events;
    if (Array.isArray(events) && events.length > 0) {
      return [...events].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    }
    return derivedTimeline(order, t);
  }, [order, t]);

  async function cancelOrder() {
    if (!order) return;
    setCancelling(true);
    try {
      await vendorApi.cancelOrder(order.id, cancelReason.trim());
      toast.success(t("toast.updated"));
      setConfirmCancel(false);
      setCancelReason("");
      await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "orders"] });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    } finally {
      setCancelling(false);
    }
  }

  async function requestRefund() {
    if (!order) return;
    setRefunding(true);
    try {
      await vendorApi.requestRefund(order.id, refundReason.trim());
      toast.success(t("vendorExtra.refundRequested"));
      setConfirmRefund(false);
      setRefundReason("");
      await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "refunds"] });
    } catch (err) {
      const resp = (err as { response?: { status?: number; data?: { error?: string } } }).response;
      // 409: a refund request already exists for this order.
      const msg =
        resp?.status === 409
          ? resp?.data?.error ?? t("vendorExtra.refundStatusRequested")
          : resp?.data?.error ?? t("toast.failedSave");
      toast.error(msg);
      if (resp?.status === 409) {
        setConfirmRefund(false);
        await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "refunds"] });
      }
    } finally {
      setRefunding(false);
    }
  }

  if (ordersQuery.isLoading) return <PageSkeleton statCards={0} tableRows={5} tableCols={2} />;
  if (ordersQuery.error) {
    return (
      <ErrorState
        error={ordersQuery.error instanceof Error ? ordersQuery.error.message : t("errors.loadingData")}
        onRetry={() => ordersQuery.refetch()}
      />
    );
  }
  if (!order) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-sand-600">{t("vendorPortal.notFound")}</p>
        <Link href="/vendor" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <DirectionalIcon kind="chevron-back" size={14} aria-hidden="true" />
          {t("vendorPortal.backToBoard")}
        </Link>
      </div>
    );
  }

  const active = !TERMINAL.includes(order.status);
  const canCancel = CANCELLABLE.includes(order.status);
  const hasDropoff = order.dropoffLat != null && order.dropoffLng != null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/vendor"
            className="inline-flex items-center gap-1 text-xs text-sand-600 hover:text-primary transition-colors"
          >
            <DirectionalIcon kind="chevron-back" size={12} aria-hidden="true" />
            {t("vendorPortal.backToBoard")}
          </Link>
          <h1 dir="ltr" className="font-display text-display-sm text-sand-900 mt-1">
            {order.orderNumber}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {active && order.slaDeadline && <SlaCountdown deadline={order.slaDeadline} />}
          <OrderStatusBadge status={order.status} size="md" />
        </div>
      </div>

      {/* Money callouts */}
      {order.paymentMethod === "COD" ? (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
          <Banknote size={16} aria-hidden="true" />
          {t("vendorPortal.codCallout").replace("{amount}", formatKwd(order.orderTotalKwd, locale))}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-sand-200 bg-sand-100/60 text-sm text-sand-700">
          <Banknote size={16} aria-hidden="true" />
          {t("vendorPortal.prepaidCallout")}
        </div>
      )}

      {order.podPin && active && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-primary/25 bg-primary/5 text-sm text-sand-900">
          <KeyRound size={16} className="text-primary" aria-hidden="true" />
          <span>
            {t("vendorPortal.podPin")}:{" "}
            <strong dir="ltr" className="font-mono tracking-[0.25em]">
              {order.podPin}
            </strong>
            <span className="block text-xs text-sand-600 mt-0.5">{t("vendorPortal.podPinHint")}</span>
          </span>
        </div>
      )}

      {/* Facts */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-sand-600">{t("dispatch.customer")}</dt>
          <dd dir="auto">
            {order.customerName ?? "—"}
            {order.customerPhone && (
              <a href={`tel:${order.customerPhone}`} dir="ltr" className="block text-primary text-xs">
                {order.customerPhone}
              </a>
            )}
          </dd>
          <dt className="text-sand-600">{t("vendorPortal.address")}</dt>
          <dd dir="auto">{order.dropoffAddress ?? "—"}</dd>
          <dt className="text-sand-600">{t("dispatch.dropoffZone")}</dt>
          <dd dir="auto">
            {(locale === "ar" && order.dropoffZone?.nameAr
              ? order.dropoffZone.nameAr
              : order.dropoffZone?.name) ?? "—"}
          </dd>
          <dt className="text-sand-600">{t("dispatch.orderTotal")}</dt>
          <dd dir="ltr" className="tabular-nums">
            {formatKwd(order.orderTotalKwd, locale)}
          </dd>
          <dt className="text-sand-600">{t("dispatch.deliveryFee")}</dt>
          <dd dir="ltr" className="tabular-nums">
            {formatKwd(order.deliveryFeeKwd, locale)}
          </dd>
        </dl>
      </section>

      {/* Assigned driver */}
      {order.driver && active && (
        <DriverCard name={order.driver.name} phone={order.driver.phone} />
      )}

      {/* Dropoff map */}
      {hasDropoff && (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
          <LiveMap
            height="240px"
            center={[Number(order.dropoffLat), Number(order.dropoffLng)]}
            zoom={14}
            marker={{
              lat: Number(order.dropoffLat),
              lng: Number(order.dropoffLng),
              label: order.customerName ?? order.orderNumber,
            }}
          />
        </div>
      )}

      {/* Timeline */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5">
        <h2 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-3">
          {t("dispatch.timeline")}
        </h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-sand-600">{t("errors.noData")}</p>
        ) : (
          <ol className="space-y-0">
            {timeline.map((ev, i) => (
              <li key={ev.id ?? i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < timeline.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute start-[7px] top-5 bottom-0 w-px bg-sand-200"
                  />
                )}
                <span className="relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary bg-white" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-sand-900" dir="auto">
                    {ev.description ?? ev.action}
                  </p>
                  <p className="text-[11px] text-sand-500" dir="ltr">
                    {formatTime(ev.timestamp, locale)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Cancel */}
      {canCancel && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-sand-600">{t("vendorPortal.cancelHint")}</p>
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            <XCircle size={14} aria-hidden="true" />
            {t("dispatch.cancelOrder")}
          </button>
        </div>
      )}

      {/* Request refund (delivered orders without an existing refund) */}
      {order.status === "DELIVERED" && !refundsQuery.isLoading && !existingRefund && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setConfirmRefund(true)}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-sand-100 text-sand-800 text-sm font-medium hover:bg-sand-200 transition-colors"
          >
            <HandCoins size={14} aria-hidden="true" />
            {t("vendorExtra.refundRequest")}
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmRefund}
        title={t("vendorExtra.refundRequest")}
        message={t("vendorExtra.refundReason")}
        variant="default"
        loading={refunding}
        confirmLabel={t("vendorExtra.refundSubmit")}
        confirmDisabled={refundReason.trim() === ""}
        onConfirm={() => void requestRefund()}
        onCancel={() => {
          setConfirmRefund(false);
          setRefundReason("");
        }}
      >
        <label className="block">
          <span className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
            {t("vendorExtra.refundReason")}
          </span>
          <textarea
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            required
            className="w-full px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
      </ConfirmModal>

      <ConfirmModal
        open={confirmCancel}
        title={t("dispatch.cancelConfirmTitle")}
        message={t("vendorPortal.cancelMessage")}
        variant="danger"
        loading={cancelling}
        confirmLabel={t("dispatch.cancelOrder")}
        confirmDisabled={cancelReason.trim() === ""}
        onConfirm={() => void cancelOrder()}
        onCancel={() => {
          setConfirmCancel(false);
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
