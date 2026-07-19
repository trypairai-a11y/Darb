"use client";
// Darb 2.0 — /ops/alerts: stalled drivers (>3min stationary on an active job)
// and GPS-stale drivers, both from GET /api/dispatch/overview. 30s polling +
// refetch on driver.* SSE. Acknowledge is a local triage marker (dims the
// row for this session); call links go straight to the driver's phone.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Phone, SatelliteDish } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import OrderStatusBadge from "@/components/darb/OrderStatusBadge";
import { useDarbEvents } from "@/hooks/useDarbEvents";
import { dispatchApi } from "@/lib/darbApi";
import type { DeliveryOrder, DriverPosition } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatRelativeTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

interface AlertRowProps {
  id: string;
  driverName: string;
  driverPhone?: string | null;
  orderNumber?: string | null;
  orderStatus?: string | null;
  lastSeen?: string | null;
  acked: boolean;
  onAck: () => void;
}

function AlertRow({
  id,
  driverName,
  driverPhone,
  orderNumber,
  orderStatus,
  lastSeen,
  acked,
  onAck,
}: AlertRowProps) {
  const { t, locale } = useI18n();
  return (
    <li
      key={id}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border bg-white transition-opacity",
        acked ? "border-sand-200 opacity-50" : "border-amber-200"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-sand-900 truncate" dir="auto">
          {driverName}
        </p>
        <p className="text-xs text-sand-600 mt-0.5">
          {orderNumber && (
            <span dir="ltr" className="font-mono me-2">
              {orderNumber}
            </span>
          )}
          {lastSeen && (
            <span>
              {t("opsPages.lastSeen")}: {formatRelativeTime(lastSeen, locale)}
            </span>
          )}
        </p>
      </div>
      {orderStatus && <OrderStatusBadge status={orderStatus} />}
      {driverPhone && (
        <a
          href={`tel:${driverPhone}`}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 transition-colors"
        >
          <Phone size={12} aria-hidden="true" />
          {t("opsPages.call")}
        </a>
      )}
      <button
        type="button"
        onClick={onAck}
        disabled={acked}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 h-8 rounded-pill text-xs font-medium transition-colors",
          acked
            ? "bg-sand-100 text-sand-500"
            : "bg-sand-100 text-sand-800 hover:bg-sand-200"
        )}
      >
        <Check size={12} aria-hidden="true" />
        {acked ? t("opsPages.acknowledged") : t("incidents.acknowledge")}
      </button>
    </li>
  );
}

export default function OpsAlertsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [acked, setAcked] = useState<Set<string>>(new Set());

  const overviewQuery = useQuery({
    queryKey: ["darb", "dispatch", "overview"],
    queryFn: () => dispatchApi.overview(),
    refetchInterval: 30_000,
  });

  useDarbEvents({
    onEvent: (event) => {
      if (
        event.type === "driver.location" ||
        event.type === "driver.online" ||
        event.type === "driver.offline"
      ) {
        void queryClient.invalidateQueries({ queryKey: ["darb", "dispatch", "overview"] });
      }
    },
  });

  const stalled = useMemo<DeliveryOrder[]>(
    () => overviewQuery.data?.stalled ?? [],
    [overviewQuery.data?.stalled]
  );
  const gpsStale = useMemo<DriverPosition[]>(
    () => overviewQuery.data?.gpsStale ?? [],
    [overviewQuery.data?.gpsStale]
  );

  function ack(id: string) {
    setAcked((prev) => new Set(prev).add(id));
  }

  if (overviewQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={4} />;
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

  const allClear = stalled.length === 0 && gpsStale.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("opsPages.alertsTitle")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("opsPages.alertsSubtitle")}</p>
      </div>

      {allClear && (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center">
          <p className="text-sm text-sand-600">{t("opsPages.allClear")}</p>
        </div>
      )}

      {/* Stalled drivers */}
      {stalled.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-medium text-sand-900 mb-1">
            <AlertTriangle size={15} className="text-amber-600" aria-hidden="true" />
            {t("opsPages.stalledSection")}
            <span className="text-xs text-sand-500 tabular-nums">({stalled.length})</span>
          </h2>
          <p className="text-xs text-sand-600 mb-3">{t("opsPages.stalledHint")}</p>
          <ul className="space-y-2">
            {stalled.map((o) => (
              <AlertRow
                key={o.id}
                id={o.id}
                driverName={o.driver?.name ?? o.driverId ?? "—"}
                driverPhone={o.driver?.phone}
                orderNumber={o.orderNumber}
                orderStatus={o.status}
                lastSeen={o.updatedAt}
                acked={acked.has(`stalled:${o.id}`)}
                onAck={() => ack(`stalled:${o.id}`)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* GPS-stale drivers */}
      {gpsStale.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-medium text-sand-900 mb-1">
            <SatelliteDish size={15} className="text-sand-700" aria-hidden="true" />
            {t("opsPages.gpsStaleSection")}
            <span className="text-xs text-sand-500 tabular-nums">({gpsStale.length})</span>
          </h2>
          <p className="text-xs text-sand-600 mb-3">{t("opsPages.gpsStaleHint")}</p>
          <ul className="space-y-2">
            {gpsStale.map((p) => (
              <AlertRow
                key={p.driverId}
                id={p.driverId}
                driverName={p.name ?? p.driverId}
                driverPhone={p.phone}
                lastSeen={p.at}
                acked={acked.has(`gps:${p.driverId}`)}
                onAck={() => ack(`gps:${p.driverId}`)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
