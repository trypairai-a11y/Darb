"use client";
// Darb 2.0 — /ops/jeopardy: active orders sorted ascending by SLA runway,
// re-sorted live on the shared 1Hz tick. Row click / reassign button opens the
// shared OrderOpsPanel (same candidates → confirm → assign flow as /ops).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus2 } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import OrderOpsPanel from "@/components/darb/OrderOpsPanel";
import OrderStatusBadge from "@/components/darb/OrderStatusBadge";
import SlaCountdown from "@/components/darb/SlaCountdown";
import { useSlaTick } from "@/components/darb/useSlaTick";
import { useDarbEvents } from "@/hooks/useDarbEvents";
import { dispatchApi } from "@/lib/darbApi";
import type { DeliveryOrder, DeliveryOrderStatus } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { useRole } from "@/hooks/useRole";

function slaRemaining(order: DeliveryOrder, now: number): number {
  if (!order.slaDeadline) return Number.POSITIVE_INFINITY;
  const target = new Date(order.slaDeadline).getTime();
  return Number.isFinite(target) ? target - now : Number.POSITIVE_INFINITY;
}

export default function JeopardyPage() {
  const { t, locale } = useI18n();
  const { canEdit } = useRole();
  const queryClient = useQueryClient();
  const now = useSlaTick();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["darb", "dispatch", "overview"],
    queryFn: () => dispatchApi.overview(),
    refetchInterval: 15_000,
  });

  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      void queryClient.invalidateQueries({ queryKey: ["darb", "dispatch", "overview"] });
    }, 2_000);
  }, [queryClient]);
  useEffect(
    () => () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    },
    []
  );

  useDarbEvents({
    onEvent: (event) => {
      if (event.type.startsWith("order.") || event.type.startsWith("offer.")) scheduleRefresh();
    },
  });

  const jeopardy = useMemo(() => {
    const list = overviewQuery.data?.jeopardy ?? [];
    return [...list].sort((a, b) => slaRemaining(a, now) - slaRemaining(b, now));
  }, [overviewQuery.data?.jeopardy, now]);

  const selectedOrder = jeopardy.find((o) => o.id === selectedId) ?? null;

  const columns = [
    {
      key: "slaDeadline",
      label: t("dispatch.sla"),
      sortable: false,
      render: (v: string | null) => <SlaCountdown deadline={v} />,
    },
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
      render: (v: DeliveryOrder["vendor"]) => <span dir="auto">{v?.name ?? "—"}</span>,
    },
    {
      key: "route",
      label: t("opsPages.route"),
      sortable: false,
      render: (_: unknown, row: DeliveryOrder) => {
        const pickup =
          (locale === "ar" && row.pickupZone?.nameAr ? row.pickupZone.nameAr : row.pickupZone?.name) ??
          "—";
        const dropoff =
          (locale === "ar" && row.dropoffZone?.nameAr
            ? row.dropoffZone.nameAr
            : row.dropoffZone?.name) ?? "—";
        return (
          <span dir="auto" className="text-xs text-sand-700">
            {pickup} → {dropoff}
          </span>
        );
      },
    },
    {
      key: "driver",
      label: t("dispatch.driver"),
      sortable: false,
      render: (v: DeliveryOrder["driver"]) =>
        v?.name ? <span dir="auto">{v.name}</span> : <span className="text-sand-400">—</span>,
    },
    {
      key: "status",
      label: t("dispatch.status"),
      sortable: false,
      render: (v: DeliveryOrderStatus) => <OrderStatusBadge status={v} />,
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (_: unknown, row: DeliveryOrder) =>
        canEdit ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(row.id);
            }}
            className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-pill bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
          >
            <UserPlus2 size={12} aria-hidden="true" />
            {t("dispatch.reassign")}
          </button>
        ) : null,
    },
  ];

  if (overviewQuery.isLoading) return <PageSkeleton statCards={0} tableRows={8} tableCols={7} />;
  if (overviewQuery.error) {
    return (
      <ErrorState
        error={
          overviewQuery.error instanceof Error ? overviewQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => overviewQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("opsPages.jeopardyTitle")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("opsPages.jeopardySubtitle")}</p>
      </div>

      <DataTable
        columns={columns}
        data={jeopardy}
        onRowClick={(row: DeliveryOrder) => setSelectedId(row.id)}
        emptyMessage={t("opsPages.railEmpty")}
      />

      <OrderOpsPanel
        orderId={selectedId}
        onClose={() => setSelectedId(null)}
        fallback={selectedOrder}
        canEdit={canEdit}
      />
    </div>
  );
}
