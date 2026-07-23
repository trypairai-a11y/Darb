"use client";
// Darb 2.0 — /ops/alerts: stalled drivers (>3min stationary on an active job)
// and GPS-stale drivers, both from GET /api/dispatch/overview. 30s polling +
// refetch on driver.* SSE.
//
// There is no Acknowledge button (client revision #29). Both lists are derived
// live from the dispatch overview, so an alert leaves the list the moment the
// underlying problem resolves itself: a driver whose GPS starts reporting
// again simply stops appearing in gpsStale. Clearing was never something a
// person needed to confirm, and a manual acknowledge only hid rows that were
// still broken. What did get lost with it is the record that something had
// been wrong, so entries that disappear drop into a "cleared" list below with
// the time they recovered.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, Phone, SatelliteDish } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import OrderStatusBadge from "@/components/darb/OrderStatusBadge";
import { useDarbEvents } from "@/hooks/useDarbEvents";
import { dispatchApi } from "@/lib/darbApi";
import type { DriverPosition, StalledDriver } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatRelativeTime, formatTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

interface ClearedEntry {
  key: string;
  driverName: string;
  kind: "stalled" | "gps";
  clearedAt: number;
}

/** Keep the cleared list to the last few hours so it stays a glance, not a log. */
const CLEARED_TTL_MS = 4 * 60 * 60_000;

interface AlertRowProps {
  driverName: string;
  driverPhone?: string | null;
  orderNumber?: string | null;
  orderStatus?: string | null;
  lastSeen?: string | null;
}

function AlertRow({
  driverName,
  driverPhone,
  orderNumber,
  orderStatus,
  lastSeen,
}: AlertRowProps) {
  const { t, locale } = useI18n();
  return (
    <li className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-white">
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
    </li>
  );
}

export default function OpsAlertsPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [cleared, setCleared] = useState<ClearedEntry[]>([]);
  const [showCleared, setShowCleared] = useState(false);

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

  const stalled = useMemo<StalledDriver[]>(
    () => overviewQuery.data?.stalled ?? [],
    [overviewQuery.data?.stalled]
  );
  const gpsStale = useMemo<DriverPosition[]>(
    () => overviewQuery.data?.gpsStale ?? [],
    [overviewQuery.data?.gpsStale]
  );

  // Diff each refresh against the previous one: anything that left the list
  // resolved itself, which is the whole point of dropping Acknowledge.
  const previous = useRef<Map<string, ClearedEntry> | null>(null);
  useEffect(() => {
    if (!overviewQuery.data) return;
    const current = new Map<string, ClearedEntry>();
    for (const o of stalled) {
      const key = `stalled:${o.orderId}`;
      current.set(key, {
        key,
        driverName: o.driverName ?? o.driverId ?? "n/a",
        kind: "stalled",
        clearedAt: 0,
      });
    }
    for (const p of gpsStale) {
      const key = `gps:${p.driverId}`;
      current.set(key, {
        key,
        driverName: p.name ?? p.driverId,
        kind: "gps",
        clearedAt: 0,
      });
    }

    const prev = previous.current;
    previous.current = current;
    if (!prev) return; // first snapshot establishes the baseline, clears nothing

    const now = Date.now();
    const gone = Array.from(prev.values())
      .filter((entry) => !current.has(entry.key))
      .map((entry) => ({ ...entry, clearedAt: now }));
    if (gone.length === 0) return;

    setCleared((old) =>
      [...gone, ...old.filter((e) => !gone.some((g) => g.key === e.key))]
        .filter((e) => now - e.clearedAt < CLEARED_TTL_MS)
        .slice(0, 50)
    );
  }, [overviewQuery.data, stalled, gpsStale]);

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
        <p className="text-xs text-sand-500 mt-1.5">{t("opsPages.autoClearHint")}</p>
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
                key={o.orderId}
                driverName={o.driverName ?? o.driverId ?? "n/a"}
                driverPhone={o.driverPhone}
                orderNumber={o.orderNumber}
                orderStatus={o.orderStatus}
                lastSeen={o.lastPointAt}
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
                driverName={p.name ?? p.driverId}
                driverPhone={p.phone}
                lastSeen={p.at}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Cleared — the record that replaces the acknowledge trail */}
      {cleared.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowCleared((v) => !v)}
            aria-expanded={showCleared}
            className="flex items-center gap-2 text-sm font-medium text-sand-700 hover:text-sand-900 transition-colors"
          >
            <Check size={15} className="text-green-600" aria-hidden="true" />
            {t("opsPages.clearedSection")}
            <span className="text-xs text-sand-500 tabular-nums">({cleared.length})</span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cn("transition-transform", showCleared && "rotate-180")}
            />
          </button>
          {showCleared && (
            <ul className="mt-3 space-y-2">
              {cleared.map((entry) => (
                <li
                  key={`${entry.key}-${entry.clearedAt}`}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-sand-200 bg-sand-50"
                >
                  <span className="min-w-0 flex-1 text-sm text-sand-700 truncate" dir="auto">
                    {entry.driverName}
                  </span>
                  <span className="text-xs text-sand-500">
                    {entry.kind === "gps"
                      ? t("opsPages.gpsStaleSection")
                      : t("opsPages.stalledSection")}
                  </span>
                  <span dir="ltr" className="text-xs text-sand-500 tabular-nums">
                    {formatTime(new Date(entry.clearedAt).toISOString(), locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
