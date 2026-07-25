"use client";
// The "Problems" segment of the Live screen: everything currently going wrong,
// in one list, ordered by how much it should worry you.
//
// This used to be two separate rail entries ("Jeopardy" and "Alerts") pointing
// at two pages that both called GET /api/dispatch/overview and then each showed
// one slice of the answer. They are three sections of one list now, fed by the
// overview query the Live screen already holds, so nothing extra is fetched.
//
// There is still no Acknowledge button (client revision #29): every row is
// derived live, so a problem leaves the list the moment it stops being one. A
// driver whose GPS starts reporting again simply stops appearing. What that
// loses is the record that something *had* been wrong, so rows that vanish drop
// into the "cleared" list at the bottom with the time they recovered.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Phone, SatelliteDish, Timer } from "lucide-react";
import SlaCountdown from "@/components/darb/SlaCountdown";
import type { DeliveryOrder, DriverPosition, StalledDriver } from "@/types/darb";
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

function slaRemaining(order: DeliveryOrder, now: number): number {
  if (!order.slaDeadline) return Number.POSITIVE_INFINITY;
  const target = new Date(order.slaDeadline).getTime();
  return Number.isFinite(target) ? target - now : Number.POSITIVE_INFINITY;
}

function Section({
  icon: Icon,
  tone,
  title,
  hint,
  count,
  children,
}: {
  icon: typeof AlertTriangle;
  tone: string;
  title: string;
  hint?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-semibold text-sand-900 mb-1">
        <Icon size={14} className={tone} aria-hidden="true" />
        {title}
        <span className="text-[11px] font-normal text-sand-500 tabular-nums">({count})</span>
      </h3>
      {hint && <p className="text-[11px] text-sand-600 mb-2">{hint}</p>}
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}

/** Compact enough for the 360px rail, which is why this is not a DataTable. */
function DriverRow({
  driverName,
  driverPhone,
  orderNumber,
  lastSeen,
}: {
  driverName: string;
  driverPhone?: string | null;
  orderNumber?: string | null;
  lastSeen?: string | null;
}) {
  const { t, locale } = useI18n();
  return (
    <li className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-200 bg-white">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-sand-900 truncate" dir="auto">
          {driverName}
        </p>
        <p className="text-[11px] text-sand-600 mt-0.5 truncate">
          {orderNumber && (
            <span dir="ltr" className="font-mono me-2">
              {orderNumber}
            </span>
          )}
          {lastSeen && formatRelativeTime(lastSeen, locale)}
        </p>
      </div>
      {driverPhone && (
        <a
          href={`tel:${driverPhone}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center h-7 w-7 rounded-pill bg-primary/10 text-primary hover:bg-primary/15 transition-colors shrink-0"
          aria-label={t("opsPages.call")}
        >
          <Phone size={12} aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

export interface ProblemsListProps {
  /** overview.jeopardy — active orders closest to breaching their SLA. */
  jeopardy: DeliveryOrder[];
  /** overview.stalled — drivers stationary >3min on an active job. */
  stalled: StalledDriver[];
  /** overview.gpsStale — drivers whose last position fix has gone cold. */
  gpsStale: DriverPosition[];
  /** Shared 1Hz tick, so the countdowns re-sort live. */
  now: number;
  /** Opens the shared OrderOpsPanel, same as clicking a task row. */
  onSelectOrder: (orderId: string) => void;
  selectedOrderId?: string | null;
  /** Truthy once the overview query has resolved at least once. */
  ready: boolean;
}

export default function ProblemsList({
  jeopardy,
  stalled,
  gpsStale,
  now,
  onSelectOrder,
  selectedOrderId,
  ready,
}: ProblemsListProps) {
  const { t, locale } = useI18n();
  const [cleared, setCleared] = useState<ClearedEntry[]>([]);
  const [showCleared, setShowCleared] = useState(false);

  const late = useMemo(
    () => [...jeopardy].sort((a, b) => slaRemaining(a, now) - slaRemaining(b, now)),
    [jeopardy, now]
  );

  // Diff each refresh against the previous one: anything that left the list
  // resolved itself, which is the whole point of having no Acknowledge button.
  const previous = useRef<Map<string, ClearedEntry> | null>(null);
  useEffect(() => {
    if (!ready) return;
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
      current.set(key, { key, driverName: p.name ?? p.driverId, kind: "gps", clearedAt: 0 });
    }

    const prev = previous.current;
    previous.current = current;
    if (!prev) return; // first snapshot establishes the baseline, clears nothing

    const nowMs = Date.now();
    const gone = Array.from(prev.values())
      .filter((entry) => !current.has(entry.key))
      .map((entry) => ({ ...entry, clearedAt: nowMs }));
    if (gone.length === 0) return;

    setCleared((old) =>
      [...gone, ...old.filter((e) => !gone.some((g) => g.key === e.key))]
        .filter((e) => nowMs - e.clearedAt < CLEARED_TTL_MS)
        .slice(0, 50)
    );
  }, [ready, stalled, gpsStale]);

  const allClear = late.length === 0 && stalled.length === 0 && gpsStale.length === 0;

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-sand-500">{t("opsPages.autoClearHint")}</p>

      {allClear && (
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-6 text-center">
          <p className="text-xs text-sand-600">{t("opsPages.allClear")}</p>
        </div>
      )}

      {late.length > 0 && (
        <Section
          icon={Timer}
          tone="text-red-600"
          title={t("simple.runningLate")}
          hint={t("opsPages.jeopardySubtitle")}
          count={late.length}
        >
          {late.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => onSelectOrder(order.id)}
                className={cn(
                  "w-full text-start flex items-center gap-2 px-3 py-2 rounded-xl border bg-white transition-colors",
                  selectedOrderId === order.id
                    ? "border-primary ring-1 ring-primary/20"
                    : "border-red-200 hover:border-red-300"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p dir="ltr" className="font-mono text-xs font-medium text-sand-900 truncate">
                    {order.orderNumber}
                  </p>
                  <p className="text-[11px] text-sand-600 mt-0.5 truncate" dir="auto">
                    {order.vendor?.name ?? "n/a"}
                    {order.driver?.name ? ` · ${order.driver.name}` : ""}
                  </p>
                </div>
                <SlaCountdown deadline={order.slaDeadline} />
              </button>
            </li>
          ))}
        </Section>
      )}

      {stalled.length > 0 && (
        <Section
          icon={AlertTriangle}
          tone="text-amber-600"
          title={t("simple.stuck")}
          hint={t("opsPages.stalledHint")}
          count={stalled.length}
        >
          {stalled.map((o) => (
            <DriverRow
              key={o.orderId}
              driverName={o.driverName ?? o.driverId ?? "n/a"}
              driverPhone={o.driverPhone}
              orderNumber={o.orderNumber}
              lastSeen={o.lastPointAt}
            />
          ))}
        </Section>
      )}

      {gpsStale.length > 0 && (
        <Section
          icon={SatelliteDish}
          tone="text-sand-700"
          title={t("simple.noGps")}
          hint={t("opsPages.gpsStaleHint")}
          count={gpsStale.length}
        >
          {gpsStale.map((p) => (
            <DriverRow
              key={p.driverId}
              driverName={p.name ?? p.driverId}
              driverPhone={p.phone}
              lastSeen={p.at}
            />
          ))}
        </Section>
      )}

      {cleared.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowCleared((v) => !v)}
            aria-expanded={showCleared}
            className="flex items-center gap-2 text-xs font-medium text-sand-700 hover:text-sand-900 transition-colors"
          >
            <Check size={14} className="text-green-600" aria-hidden="true" />
            {t("opsPages.clearedSection")}
            <span className="text-[11px] text-sand-500 tabular-nums">({cleared.length})</span>
            <ChevronDown
              size={13}
              aria-hidden="true"
              className={cn("transition-transform", showCleared && "rotate-180")}
            />
          </button>
          {showCleared && (
            <ul className="mt-2 space-y-1.5">
              {cleared.map((entry) => (
                <li
                  key={`${entry.key}-${entry.clearedAt}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-sand-200 bg-sand-50"
                >
                  <span className="min-w-0 flex-1 text-xs text-sand-700 truncate" dir="auto">
                    {entry.driverName}
                  </span>
                  <span className="text-[11px] text-sand-500 shrink-0">
                    {entry.kind === "gps" ? t("simple.noGps") : t("simple.stuck")}
                  </span>
                  <span dir="ltr" className="text-[11px] text-sand-500 tabular-nums shrink-0">
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
