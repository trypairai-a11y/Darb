"use client";
// Darb 2.0 — /orders: admin DeliveryOrder console. FilterBar + DataTable,
// row SlidePanel with status, quote breakdown, order timeline, dispatch
// OfferTimeline, and actions: reassign (candidates → confirm → assign),
// auto-redispatch and cancel.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, UserPlus2, XCircle } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import OrderStatusBadge from "@/components/darb/OrderStatusBadge";
import {
  OrderOutcomeBanner,
  OrderOutcomeCell,
  outcomeReason,
} from "@/components/darb/OrderOutcome";
import OfferTimeline from "@/components/darb/OfferTimeline";
import SlaCountdown from "@/components/darb/SlaCountdown";
import { deliveryOrdersApi, vendorsApi, unwrapList } from "@/lib/darbApi";
import type {
  DeliveryOrder,
  DeliveryOrderEvent,
  DeliveryOrderStatus,
  DispatchCandidate,
  Vendor,
} from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { useRole } from "@/hooks/useRole";
import { formatDateTime, formatKwd, formatTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

const STATUS_OPTIONS: DeliveryOrderStatus[] = [
  "CREATED",
  "REJECTED",
  "DISPATCHING",
  "NO_DRIVER",
  "ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
];

type PendingAction =
  | { kind: "assign"; candidate: DispatchCandidate }
  | { kind: "redispatch" }
  | { kind: "cancel" }
  | { kind: "reason" }
  | null;

export default function DeliveryOrdersPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { canEdit } = useRole();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [reasonDraft, setReasonDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const listParams = useMemo(
    () => ({
      page,
      limit,
      status: filters.status || undefined,
      vendorId: filters.vendorId || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      search: filters.search || undefined,
    }),
    [page, limit, filters]
  );

  const ordersQuery = useQuery({
    queryKey: ["darb", "delivery-orders", listParams],
    queryFn: () => deliveryOrdersApi.list(listParams),
    refetchInterval: 15_000,
  });

  const vendorsQuery = useQuery({
    queryKey: ["darb", "vendors"],
    queryFn: () => vendorsApi.list(),
    staleTime: 60_000,
  });
  const vendors = useMemo(() => unwrapList<Vendor>(vendorsQuery.data), [vendorsQuery.data]);

  const orders = useMemo(() => unwrapList<DeliveryOrder>(ordersQuery.data), [ordersQuery.data]);
  const pagination =
    ordersQuery.data && !Array.isArray(ordersQuery.data)
      ? (ordersQuery.data as { pagination?: { page: number; limit: number; total: number; totalPages: number } }).pagination
      : undefined;

  const detailQuery = useQuery({
    queryKey: ["darb", "delivery-order", selectedId],
    queryFn: () => deliveryOrdersApi.getById(selectedId as string),
    enabled: !!selectedId,
    refetchInterval: 10_000,
  });
  const order = detailQuery.data ?? orders.find((o) => o.id === selectedId) ?? null;

  const timelineQuery = useQuery({
    queryKey: ["darb", "delivery-order", selectedId, "timeline"],
    queryFn: () => deliveryOrdersApi.timeline(selectedId as string),
    enabled: !!selectedId,
    refetchInterval: 15_000,
  });
  const timeline = useMemo(
    () => unwrapList<DeliveryOrderEvent>(timelineQuery.data),
    [timelineQuery.data]
  );

  const candidatesQuery = useQuery({
    queryKey: ["darb", "delivery-order", selectedId, "candidates"],
    queryFn: () => deliveryOrdersApi.candidates(selectedId as string),
    enabled: !!selectedId && reassigning,
    retry: false,
  });
  const candidates = useMemo(
    () => unwrapList<DispatchCandidate>(candidatesQuery.data),
    [candidatesQuery.data]
  );

  function closePanel() {
    setSelectedId(null);
    setReassigning(false);
    setPending(null);
    setCancelReason("");
    setReasonDraft("");
  }

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["darb", "delivery-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["darb", "delivery-order", selectedId] }),
    ]);
  }

  async function runPendingAction() {
    if (!pending || !selectedId) return;
    setActionBusy(true);
    try {
      if (pending.kind === "assign") {
        await deliveryOrdersApi.assign(selectedId, pending.candidate.driverId);
      } else if (pending.kind === "redispatch") {
        await deliveryOrdersApi.redispatch(selectedId);
      } else if (pending.kind === "reason") {
        await deliveryOrdersApi.recordReason(selectedId, reasonDraft.trim());
      } else {
        await deliveryOrdersApi.cancel(selectedId, cancelReason.trim() || undefined);
      }
      toast.success(t("toast.updated"));
      setPending(null);
      setReassigning(false);
      setCancelReason("");
      setReasonDraft("");
      await invalidateAll();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    } finally {
      setActionBusy(false);
    }
  }

  const columns = [
    {
      key: "orderNumber",
      label: t("dispatch.orderNumber"),
      render: (v: string) => (
        <span dir="ltr" className="font-mono text-xs font-medium text-sand-900">
          {v}
        </span>
      ),
    },
    {
      key: "vendor",
      label: t("dispatch.vendor"),
      sortable: false,
      render: (v: DeliveryOrder["vendor"], row: DeliveryOrder) => (
        <span dir="auto">{v?.name ?? vendors.find((x) => x.id === row.vendorId)?.name ?? "—"}</span>
      ),
    },
    {
      key: "status",
      label: t("dispatch.status"),
      render: (v: DeliveryOrderStatus) => <OrderStatusBadge status={v} />,
    },
    {
      key: "driver",
      label: t("dispatch.driver"),
      sortable: false,
      render: (v: DeliveryOrder["driver"]) =>
        v?.name ? <span dir="auto">{v.name}</span> : <span className="text-sand-400">—</span>,
    },
    {
      // A red badge with no explanation is what made the FAILED filter
      // unreadable. The reason lives next to the status it explains.
      key: "outcomeReason", // derived, not a column on the row
      label: t("dispatch.outcomeReason"),
      sortable: false,
      className: "whitespace-normal max-w-[16rem]",
      render: (_v: unknown, row: DeliveryOrder) => <OrderOutcomeCell order={row} />,
      exportValue: (_v: unknown, row: DeliveryOrder) => outcomeReason(row, t) ?? "n/a",
    },
    {
      key: "orderTotalKwd",
      label: t("dispatch.total"),
      render: (v: DeliveryOrder["orderTotalKwd"]) => (
        <span dir="ltr" className="tabular-nums">
          {formatKwd(v, locale)}
        </span>
      ),
    },
    {
      key: "deliveryFeeKwd",
      label: t("dispatch.fee"),
      render: (v: DeliveryOrder["deliveryFeeKwd"]) => (
        <span dir="ltr" className="tabular-nums">
          {formatKwd(v, locale)}
        </span>
      ),
    },
    {
      key: "slaDeadline",
      label: t("dispatch.sla"),
      sortable: false,
      render: (v: string | null, row: DeliveryOrder) =>
        row.status === "DELIVERED" || row.status === "CANCELLED" || row.status === "REJECTED" ? (
          <span className="text-sand-400">—</span>
        ) : (
          <SlaCountdown deadline={v} />
        ),
    },
    {
      key: "createdAt",
      label: t("dispatch.createdAt"),
      render: (v: string) => (
        <span dir="ltr" className="text-xs text-sand-700 whitespace-nowrap">
          {formatDateTime(v, locale)}
        </span>
      ),
    },
  ];

  if (ordersQuery.isLoading) return <PageSkeleton statCards={0} tableRows={10} tableCols={8} />;
  if (ordersQuery.error) {
    return (
      <ErrorState
        error={ordersQuery.error instanceof Error ? ordersQuery.error.message : t("errors.loadingData")}
        onRetry={() => ordersQuery.refetch()}
      />
    );
  }

  const canAct =
    canEdit && order && !["DELIVERED", "CANCELLED", "REJECTED"].includes(order.status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("dispatch.title")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("dispatch.subtitle")}</p>
      </div>

      <FilterBar
        filters={[
          { key: "search", label: t("common.search"), type: "search", placeholder: t("dispatch.searchPlaceholder") },
          {
            key: "status",
            label: t("dispatch.status"),
            type: "select",
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
          },
          {
            key: "vendorId",
            label: t("dispatch.vendor"),
            type: "select",
            options: vendors.map((v) => ({ value: v.id, label: v.name })),
          },
          { key: "dateFrom", label: t("wallet.date"), type: "dateRange", toKey: "dateTo" },
        ]}
        values={filters}
        onChange={(key, value) => {
          setFilters((prev) => ({ ...prev, [key]: value }));
          setPage(1);
        }}
        onClear={() => {
          setFilters({});
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={orders}
        onRowClick={(row: DeliveryOrder) => setSelectedId(row.id)}
        emptyMessage={t("dispatch.noOrders")}
        pagination={
          pagination
            ? {
                page: pagination.page,
                totalPages: pagination.totalPages,
                total: pagination.total,
                limit: pagination.limit,
                onPageChange: setPage,
                onLimitChange: (n) => {
                  setLimit(n);
                  setPage(1);
                },
              }
            : undefined
        }
      />

      {/* Detail panel */}
      <SlidePanel
        open={!!selectedId}
        onClose={closePanel}
        title={order?.orderNumber ?? t("dispatch.orderDetail")}
        subtitle={t("dispatch.orderDetail")}
      >
        {order && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <OrderStatusBadge status={order.status} size="md" />
              {order.slaDeadline &&
                !["DELIVERED", "CANCELLED", "REJECTED"].includes(order.status) && (
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

            {/* Quote breakdown */}
            <section>
              <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-2">
                {t("dispatch.quoteBreakdown")}
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm bg-sand-100/60 rounded-xl p-4">
                <dt className="text-sand-600">{t("dispatch.pickupZone")}</dt>
                <dd dir="auto">
                  {locale === "ar" && order.pickupZone?.nameAr
                    ? order.pickupZone.nameAr
                    : order.pickupZone?.name ?? "—"}
                </dd>
                <dt className="text-sand-600">{t("dispatch.dropoffZone")}</dt>
                <dd dir="auto">
                  {locale === "ar" && order.dropoffZone?.nameAr
                    ? order.dropoffZone.nameAr
                    : order.dropoffZone?.name ?? "—"}
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
                  {order.customerName ?? "—"}
                  {order.customerPhone && (
                    <a href={`tel:${order.customerPhone}`} dir="ltr" className="block text-primary text-xs">
                      {order.customerPhone}
                    </a>
                  )}
                </dd>
              </dl>
            </section>

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
            <section>
              <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-2">
                {t("dispatch.timeline")}
              </h3>
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
                          {ev.operator && <span dir="auto"> · {ev.operator}</span>}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

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

      {/* Cancel needs a reason field, so it gets its own modal body via message + input hack: use ConfirmModal for assign/redispatch, custom for cancel */}
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
    </div>
  );
}
