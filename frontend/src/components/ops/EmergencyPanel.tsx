"use client";
// The emergency console. OPEN incidents render as red cards (driver, order,
// category, live elapsed, mini map, photos); the sound alert loops while any
// OPEN incident is un-acknowledged (Web Audio, gesture-unlocked). SSE
// sos.raised/incident.updated + a 10s polling backstop.
//
// Revision #31 took this off the rail. An SOS is the loudest thing that
// happens in the network and you should never have to go looking for it, so
// the Live screen raises a red bar the moment one is open and this panel
// opens over the map from there. It keeps the same queryKey the Live screen
// uses, so mounting it costs no extra request.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, BellRing, Check, MousePointerClick, Phone, PowerOff, X } from "lucide-react";
import LiveMap from "@/components/map/LiveMap";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { useSlaTick } from "@/components/darb/useSlaTick";
import { useDarbEvents } from "@/hooks/useDarbEvents";
import { useSoundAlert } from "@/hooks/useSoundAlert";
import { incidentsApi, staffDriversApi, unwrapList } from "@/lib/darbApi";
import type { Incident } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

const TYPE_I18N: Record<string, string> = {
  SOS: "incidents.sos",
  ACCIDENT: "incidents.accident",
  VEHICLE_BREAKDOWN: "incidents.vehicleBreakdown",
  CUSTOMER_ISSUE: "incidents.customerIssue",
  OTHER: "incidents.other",
};

function formatElapsed(fromIso: string, now: number): string {
  const start = new Date(fromIso).getTime();
  if (!Number.isFinite(start)) return "—";
  const totalSec = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function incidentPhotos(incident: Incident): string[] {
  const photos = (incident.metadata as { photos?: unknown } | null)?.photos;
  if (!Array.isArray(photos)) return [];
  return photos.filter((p): p is string => typeof p === "string" && /^https?:\/\//.test(p));
}

export default function EmergencyPanel({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const now = useSlaTick();
  const { playing, start, stop, muted, setMuted, unlocked } = useSoundAlert();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Incident | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  const incidentsQuery = useQuery({
    queryKey: ["darb", "incidents", "live"],
    queryFn: () => incidentsApi.list({ limit: 50 }),
    refetchInterval: 10_000,
  });

  useDarbEvents({
    onEvent: (event) => {
      if (event.type === "sos.raised" || event.type === "incident.updated") {
        void queryClient.invalidateQueries({ queryKey: ["darb", "incidents"] });
      }
    },
  });

  const incidents = useMemo(
    () =>
      unwrapList<Incident>(incidentsQuery.data)
        .filter((i) => i.status !== "RESOLVED")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [incidentsQuery.data]
  );
  const hasUnacked = incidents.some((i) => i.status === "OPEN");

  // Loop the alarm while any OPEN incident is un-acknowledged.
  useEffect(() => {
    if (hasUnacked) start();
    else stop();
  }, [hasUnacked, start, stop]);
  useEffect(() => stop, [stop]);

  async function acknowledge(incident: Incident) {
    setBusyId(incident.id);
    try {
      await incidentsApi.ack(incident.id);
      toast.success(t("opsPages.incidentAcked"));
      await queryClient.invalidateQueries({ queryKey: ["darb", "incidents"] });
    } catch {

      toast.error(t("toast.failedSave"));
    } finally {
      setBusyId(null);
    }
  }

  // Edit #8 (2026-08-22) — a breakdown or accident can end a rider's shift on
  // the spot, and the person handling the incident is the one who knows it.
  // This takes the driver's session down without waiting for the agent app.
  async function putOffline(incident: Incident) {
    if (!incident.driverId) return;
    setBusyId(incident.id);
    try {
      await staffDriversApi.putOffline(incident.driverId);
      toast.success(t("opsPages.driverOffline"));
      await queryClient.invalidateQueries({ queryKey: ["darb", "dispatch"] });
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setBusyId(null);
    }
  }

  async function resolve() {
    if (!resolving) return;
    setBusyId(resolving.id);
    try {
      await incidentsApi.resolve(resolving.id, resolveNote.trim() || undefined);
      toast.success(t("opsPages.incidentResolved"));
      setResolving(null);
      setResolveNote("");
      await queryClient.invalidateQueries({ queryKey: ["darb", "incidents"] });
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setBusyId(null);
    }
  }

  if (incidentsQuery.isLoading) return <PageSkeleton statCards={0} tableRows={4} tableCols={3} />;
  if (incidentsQuery.error) {
    return (
      <ErrorState
        error={
          incidentsQuery.error instanceof Error
            ? incidentsQuery.error.message
            : t("errors.loadingData")
        }
        onRetry={() => incidentsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-xl text-sand-900">{t("opsPages.sosTitle")}</h2>
          <p className="text-sm text-sand-600 mt-1">{t("opsPages.sosSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            className={cn(
              "inline-flex items-center gap-2 px-4 h-10 rounded-pill border text-sm font-medium transition-colors",
              muted
                ? "bg-sand-100 border-sand-300 text-sand-700 hover:bg-sand-200"
                : "bg-card border-sand-300 text-sand-800 hover:bg-sand-100"
            )}
          >
            {muted ? (
              <BellOff size={15} aria-hidden="true" />
            ) : (
              <BellRing
                size={15}
                aria-hidden="true"
                className={playing ? "text-red-600 animate-pulse" : undefined}
              />
            )}
            {muted ? t("opsPages.unmuteAlerts") : t("opsPages.muteAlerts")}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="p-2.5 rounded-pill text-sand-600 hover:bg-sand-100 hover:text-sand-900 transition-colors"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Autoplay-policy: sound is locked until the first user gesture. */}
      {hasUnacked && !muted && !unlocked && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-sm">
          <MousePointerClick size={16} aria-hidden="true" />
          {t("opsPages.soundLocked")}
        </div>
      )}

      {incidents.length === 0 ? (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center">
          <p className="text-sm text-sand-600">{t("opsPages.noIncidents")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {incidents.map((incident) => {
            const photos = incidentPhotos(incident);
            const open = incident.status === "OPEN";
            return (
              <article
                key={incident.id}
                className={cn(
                  "rounded-2xl border overflow-hidden shadow-soft",
                  open ? "border-red-300 bg-red-50/60" : "border-sand-200 bg-card"
                )}
              >
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          open ? "text-red-700" : "text-sand-900"
                        )}
                      >
                        {t(TYPE_I18N[incident.type] ?? "incidents.other")}
                        {!open && (
                          <span className="ms-2 text-xs font-medium text-sand-500">
                            {t("opsPages.acknowledged")}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-sand-900 mt-1 truncate" dir="auto">
                        {incident.driver?.name ?? "—"}
                        {incident.order?.orderNumber && (
                          <span dir="ltr" className="ms-2 font-mono text-xs text-sand-600">
                            {incident.order.orderNumber}
                          </span>
                        )}
                      </p>
                      {incident.description && (
                        <p className="text-xs text-sand-700 mt-1" dir="auto">
                          {incident.description}
                        </p>
                      )}
                    </div>
                    <div className="text-end shrink-0">
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          open ? "text-red-700" : "text-sand-700"
                        )}
                        dir="ltr"
                      >
                        {formatElapsed(incident.createdAt, now)}
                      </p>
                      <p className="text-[11px] text-sand-500 mt-0.5" dir="ltr">
                        {formatDateTime(incident.createdAt, locale)}
                      </p>
                    </div>
                  </div>

                  {incident.lat != null && incident.lng != null && (
                    <LiveMap
                      height="160px"
                      className="rounded-xl border border-sand-200"
                      center={[incident.lat, incident.lng]}
                      zoom={14}
                      marker={{
                        lat: incident.lat,
                        lng: incident.lng,
                        color: "#dc2626",
                        label: incident.driver?.name ?? undefined,
                      }}
                    />
                  )}

                  {photos.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-sand-600 mb-1.5">
                        {t("opsPages.photos")}
                      </p>
                      <div className="flex gap-2 overflow-x-auto">
                        {photos.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={t("opsPages.photos")}
                              className="h-20 w-20 rounded-lg object-cover border border-sand-200"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {open && (
                      <button
                        type="button"
                        onClick={() => void acknowledge(incident)}
                        disabled={busyId === incident.id}
                        className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        <Check size={13} aria-hidden="true" />
                        {busyId === incident.id ? t("common.processing") : t("incidents.acknowledge")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setResolving(incident);
                        setResolveNote("");
                      }}
                      disabled={busyId === incident.id}
                      className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
                    >
                      {t("incidents.resolve")}
                    </button>
                    {incident.driver?.phone && (
                      <a
                        href={`tel:${incident.driver.phone}`}
                        className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 transition-colors"
                      >
                        <Phone size={13} aria-hidden="true" />
                        {t("opsPages.call")}
                      </a>
                    )}
                    {/* Edit #8 (2026-08-22) — for the incidents that end a
                        shift (breakdown, accident): pull the driver's session
                        down right here so dispatch stops offering them work. */}
                    {incident.driverId && (
                      <button
                        type="button"
                        onClick={() => void putOffline(incident)}
                        disabled={busyId === incident.id}
                        className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
                        data-testid="incident-put-offline"
                      >
                        <PowerOff size={13} aria-hidden="true" />
                        {busyId === incident.id ? t("common.processing") : t("opsPages.putOffline")}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Resolve modal (needs a note field, so ConfirmModal doesn't fit) */}
      {resolving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm"
            onClick={() => setResolving(null)}
            aria-hidden="true"
          />
          <div className="relative bg-card rounded-2xl border border-sand-200 shadow-float w-full max-w-md p-6">
            <h2 className="font-display text-xl text-sand-900">{t("opsPages.resolveTitle")}</h2>
            <p className="mt-1.5 text-sm text-sand-700" dir="auto">
              {t(TYPE_I18N[resolving.type] ?? "incidents.other")} — {resolving.driver?.name ?? "—"}
            </p>
            <label className="block text-xs font-medium text-sand-700 mt-4 mb-1.5 uppercase tracking-wide">
              {t("opsPages.resolveNote")}
            </label>
            <textarea
              dir="auto"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolving(null)}
                className="px-4 h-10 text-sm font-medium text-sand-800 bg-sand-100 hover:bg-sand-200 rounded-pill transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void resolve()}
                disabled={busyId === resolving.id}
                className="px-5 h-10 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-pill transition-colors disabled:opacity-50"
              >
                {busyId === resolving.id ? t("common.processing") : t("opsPages.resolveConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
