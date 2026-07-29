// Darb 2.0 — shared supervisor order panel (wave 2). SlidePanel with live
// order detail + the full action set: manual re-assign (candidates → confirm
// → POST assign), auto re-dispatch and cancel. Used by /ops and /ops/jeopardy
// so the reassign flow exists exactly once.
"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, RefreshCw, UserPlus2, XCircle } from "lucide-react";
import SlidePanel from "@/components/shared/SlidePanel";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { useToast } from "@/components/shared/Toast";
import OrderStatusBadge from "@/components/darb/OrderStatusBadge";
import { OrderOutcomeBanner, outcomeReason } from "@/components/darb/OrderOutcome";
import OfferTimeline from "@/components/darb/OfferTimeline";
import TrackingLink from "@/components/darb/TrackingLink";
import SlaCountdown from "@/components/darb/SlaCountdown";
import { deliveryOrdersApi, unwrapList } from "@/lib/darbApi";
import { useDriverPositions } from "@/lib/driverPositionStore";
import type { DeliveryOrder, DeliveryOrderEvent, DispatchCandidate } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

const TERMINAL = ["DELIVERED", "CANCELLED", "REJECTED"];

type PendingAction =
  | { kind: "assign"; candidate: DispatchCandidate }
  | { kind: "redispatch" }
  | { kind: "cancel" }
  | { kind: "reason" }
  | null;

interface OrderOpsPanelProps {
  orderId: string | null;
  onClose: () => void;
  /** Called after any successful action (assign / redispatch / cancel). */
  onActed?: () => void;
  /** Row data shown while the detail query loads. */
  fallback?: DeliveryOrder | null;
  /** Whether the current user may act (SUPERVISOR+). */
  canEdit?: boolean;
}

export default function OrderOpsPanel({
  orderId,
  onClose,
  onActed,
  fallback,
  canEdit = true,
}: OrderOpsPanelProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const positions = useDriverPositions();

  const [reassigning, setReassigning] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [reasonDraft, setReasonDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["darb", "delivery-order", orderId],
    queryFn: () => deliveryOrdersApi.getById(orderId as string),
    enabled: !!orderId,
    refetchInterval: 10_000,
  });
  const order = detailQuery.data ?? fallback ?? null;

  const timelineQuery = useQuery({
    queryKey: ["darb", "delivery-order", orderId, "timeline"],
    queryFn: () => deliveryOrdersApi.timeline(orderId as string),
    enabled: !!orderId,
    refetchInterval: 15_000,
  });
  const timeline = useMemo(
    () => unwrapList<DeliveryOrderEvent>(timelineQuery.data),
    [timelineQuery.data]
  );

  const candidatesQuery = useQuery({
    queryKey: ["darb", "delivery-order", orderId, "candidates"],
    queryFn: () => deliveryOrdersApi.candidates(orderId as string),
    enabled: !!orderId && reassigning,
    retry: false,
  });
  const candidates = useMemo(
    () => unwrapList<DispatchCandidate>(candidatesQuery.data),
    [candidatesQuery.data]
  );

  const driverPosition = useMemo(() => {
    if (!order?.driverId) return null;
    return positions.find((p) => p.driverId === order.driverId) ?? null;
  }, [positions, order?.driverId]);

  function close() {
    setReassigning(false);
    setPending(null);
    setCancelReason("");
    setReasonDraft("");
    onClose();
  }

  async function runPendingAction() {
    if (!pending || !orderId) return;
    setActionBusy(true);
    try {
      if (pending.kind === "assign") {
        await deliveryOrdersApi.assign(orderId, pending.candidate.driverId);
      } else if (pending.kind === "redispatch") {
        await deliveryOrdersApi.redispatch(orderId);
      } else if (pending.kind === "reason") {
        await deliveryOrdersApi.recordReason(orderId, reasonDraft.trim());
      } else {
        await deliveryOrdersApi.cancel(orderId, cancelReason.trim() || undefined);
      }
      toast.success(t("toast.updated"));
      setPending(null);
      setReassigning(false);
      setCancelReason("");
      setReasonDraft("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["darb", "delivery-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["darb", "delivery-order", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["darb", "dispatch"] }),
      ]);
      onActed?.();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    } finally {
      setActionBusy(false);
    }
  }

  const canAct = canEdit && order && !TERMINAL.includes(order.status);

  return (
    <>
      <SlidePanel
        open={!!orderId}
        onClose={close}
        title={order?.orderNumber ?? t("dispatch.orderDetail")}
        subtitle={t("dispatch.orderDetail")}
      >
        {order && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <OrderStatusBadge status={order.status} size="md" />
              {order.slaDeadline && !TERMINAL.includes(order.status) && (
                <div className="text-sm">
                  {t("dispatch.sla")}: <SlaCountdown deadline={order.slaDeadline} />
                </div>
              )}
            </div>

            {/* Why it ended this way — first thing read on a dead order */}
            <OrderOutcomeBanner
              order={order}
              onRecord={
                canEdit
                  ? () => {
                      setReasonDraft(outcomeReason(order, t) ?? "");
                      setPending({ kind: "reason" });
                    }
                  : undefined
              }
            />

            {/* The link the customer was sent. Support gets asked "where is
                my order" by people who lost the WhatsApp message, and until
                now had nothing to give them. */}
            <TrackingLink url={order.trackingUrl} />

            {/* Order facts */}
            <section>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm bg-sand-100/60 rounded-xl p-4">
                <dt className="text-sand-600">{t("dispatch.vendor")}</dt>
                <dd dir="auto">{order.vendor?.name ?? t("common.notAvailable")}</dd>
                <dt className="text-sand-600">{t("opsPages.route")}</dt>
                <dd dir="auto">
                  {(locale === "ar" && order.pickupZone?.nameAr
                    ? order.pickupZone.nameAr
                    : order.pickupZone?.name) ?? t("common.notAvailable")}
                  {" → "}
                  {(locale === "ar" && order.dropoffZone?.nameAr
                    ? order.dropoffZone.nameAr
                    : order.dropoffZone?.name) ?? t("common.notAvailable")}
                </dd>
                <dt className="text-sand-600">{t("dispatch.orderTotal")}</dt>
                <dd dir="ltr" className="tabular-nums">
                  {formatKwd(order.orderTotalKwd, locale)}
                </dd>
                <dt className="text-sand-600">{t("dispatch.deliveryFee")}</dt>
                <dd dir="ltr" className="tabular-nums">
                  {formatKwd(order.deliveryFeeKwd, locale)}
                </dd>
                <dt className="text-sand-600">{t("dispatch.paymentMethod")}</dt>
                <dd>{order.paymentMethod === "COD" ? t("dispatch.cod") : t("dispatch.prepaid")}</dd>
                <dt className="text-sand-600">{t("dispatch.customer")}</dt>
                <dd dir="auto">
                  {order.customerName ?? t("common.notAvailable")}
                  {order.customerPhone && (
                    <a href={`tel:${order.customerPhone}`} dir="ltr" className="block text-primary text-xs">
                      {order.customerPhone}
                    </a>
                  )}
                </dd>
              </dl>
            </section>

            {/* Driver */}
            {order.driver && (
              <section className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-white px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-sand-900 truncate" dir="auto">
                    {order.driver.name}
                  </p>
                  {driverPosition?.at && (
                    <p className="text-[11px] text-sand-500" dir="ltr">
                      {t("opsPages.lastSeen")}: {formatTime(driverPosition.at, locale)}
                    </p>
                  )}
                </div>
                {order.driver.phone && (
                  <a
                    href={`tel:${order.driver.phone}`}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 transition-colors"
                  >
                    <Phone size={12} aria-hidden="true" />
                    {t("opsPages.call")}
                  </a>
                )}
              </section>
            )}

            {/* Actions */}
            {canAct && (
              <section className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setReassigning((v) => !v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 h-9 text-xs font-medium rounded-pill transition-colors",
                    reassigning
                      ? "bg-primary text-white"
                      : "bg-primary/10 text-primary hover:bg-primary/15"
                  )}
                >
                  <UserPlus2 size={13} aria-hidden="true" />
                  {t("dispatch.reassign")}
                </button>
                <button
                  type="button"
                  onClick={() => setPending({ kind: "redispatch" })}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 text-xs font-medium rounded-pill bg-sand-100 text-sand-800 hover:bg-sand-200 transition-colors"
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  {t("dispatch.redispatch")}
                </button>
                <button
                  type="button"
                  onClick={() => setPending({ kind: "cancel" })}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 text-xs font-medium rounded-pill bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                >
                  <XCircle size={13} aria-hidden="true" />
                  {t("dispatch.cancelOrder")}
                </button>
              </section>
            )}

            {/* Candidates for reassign */}
            {reassigning && (
              <section>
                <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-2">
                  {t("dispatch.candidates")}
                </h3>
                {candidatesQuery.isLoading ? (
                  <p className="text-sm text-sand-600">{t("common.loading")}</p>
                ) : candidates.length === 0 ? (
                  <p className="text-sm text-sand-600">{t("dispatch.noCandidates")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {candidates.map((c) => (
                      <li key={c.driverId}>
                        <button
                          type="button"
                          onClick={() => setPending({ kind: "assign", candidate: c })}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-sand-200 bg-white hover:border-primary/40 hover:bg-primary/5 transition-colors text-start"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-sand-900 truncate" dir="auto">
                              {c.name}
                            </span>
                            {c.phone && (
                              <span dir="ltr" className="block text-xs text-sand-600">
                                {c.phone}
                              </span>
                            )}
                          </span>
                          {c.distanceKm != null && (
                            <span dir="ltr" className="text-xs text-sand-600 tabular-nums whitespace-nowrap">
                              {Number(c.distanceKm).toFixed(1)} km
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Timeline */}
            {timeline.length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-2">
                  {t("dispatch.timeline")}
                </h3>
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
                          {ev.operator && <span dir="auto"> · {ev.operator}</span>}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Dispatch offers */}
            <section>
              <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-2">
                {t("dispatch.offers")}
              </h3>
              <OfferTimeline offers={order.offers ?? []} />
            </section>
          </div>
        )}
      </SlidePanel>

      <ConfirmModal
        open={pending?.kind === "assign"}
        title={t("dispatch.assignConfirmTitle")}
        message={t("dispatch.assignConfirmMessage").replace(
          "{driver}",
          pending?.kind === "assign" ? pending.candidate.name : ""
        )}
        variant="default"
        loading={actionBusy}
        confirmLabel={t("dispatch.assign")}
        onConfirm={() => void runPendingAction()}
        onCancel={() => setPending(null)}
      />
      <ConfirmModal
        open={pending?.kind === "redispatch"}
        title={t("dispatch.redispatchConfirmTitle")}
        message={t("dispatch.redispatchConfirmMessage")}
        variant="warning"
        loading={actionBusy}
        confirmLabel={t("dispatch.redispatch")}
        onConfirm={() => void runPendingAction()}
        onCancel={() => setPending(null)}
      />
      {pending?.kind === "cancel" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm"
            onClick={() => setPending(null)}
            aria-hidden="true"
          />
          <div className="relative bg-card rounded-2xl border border-sand-200 shadow-float w-full max-w-md p-6">
            <h2 className="font-display text-xl text-sand-900">{t("dispatch.cancelConfirmTitle")}</h2>
            <p className="mt-1.5 text-sm text-sand-700">{t("dispatch.cancelConfirmMessage")}</p>
            <label className="block text-xs font-medium text-sand-700 mt-4 mb-1.5 uppercase tracking-wide">
              {t("dispatch.cancelReason")}
            </label>
            <input
              type="text"
              dir="auto"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="px-4 h-10 text-sm font-medium text-sand-800 bg-sand-100 hover:bg-sand-200 rounded-pill transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void runPendingAction()}
                disabled={actionBusy}
                className="px-5 h-10 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-pill transition-colors disabled:opacity-50"
              >
                {actionBusy ? t("common.processing") : t("dispatch.cancelOrder")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record the reason on an order that already ended without one. */}
      {pending?.kind === "reason" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm"
            onClick={() => setPending(null)}
            aria-hidden="true"
          />
          <div className="relative bg-card rounded-2xl border border-sand-200 shadow-float w-full max-w-md p-6">
            <h2 className="font-display text-xl text-sand-900">
              {t("dispatch.recordReasonTitle")}
            </h2>
            <p className="mt-1.5 text-sm text-sand-700">{t("dispatch.recordReasonMessage")}</p>
            <label className="block text-xs font-medium text-sand-700 mt-4 mb-1.5 uppercase tracking-wide">
              {t("dispatch.outcomeReason")}
            </label>
            <input
              type="text"
              dir="auto"
              autoFocus
              maxLength={500}
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="px-4 h-10 text-sm font-medium text-sand-800 bg-sand-100 hover:bg-sand-200 rounded-pill transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void runPendingAction()}
                disabled={actionBusy || reasonDraft.trim().length === 0}
                className="px-5 h-10 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-pill transition-colors disabled:opacity-50"
              >
                {actionBusy ? t("common.processing") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
