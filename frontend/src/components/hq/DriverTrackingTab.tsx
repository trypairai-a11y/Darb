"use client";
// Revision 20 — Ops › Driver tracking.
//
// "here the ops team should be able to track driver performance and be able to
// activate/deactivate/freeze also should be able to send the driver for further
// training".
//
// One table, because that is what "track" means when there are three hundred
// drivers: the numbers that say whether somebody is carrying their weight, and
// the switches that decide whether they work, in the same row. Opening a
// profile to change a status is how a driver stays frozen for a week.
//
// The figures are the same ones the delivery company sees on its own scorecard
// — on-time, acceptance, rating — on purpose. A driver who reads 82% here and
// 71% on the fleet portal is a driver nobody can have a conversation about.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Search, Snowflake, Sun, UserCheck, UserX } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { useToast } from "@/components/shared/Toast";
import { driverTrackingApi, driverTrainingApi, fleetsApi, zonesApi, unwrapList } from "@/lib/darbApi";
import type { DriverStateAction, DriverTrackingRow, DeliveryZone, FleetProfile } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatNumber } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

const WINDOWS = [7, 30, 90];

/** A rate as a whole percent, or the house "n/a" when there is nothing to rate. */
function pct(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

/** Red below 70, amber below 85, otherwise plain. Absent is never red. */
function rateTone(value: number | null): string {
  if (value === null) return "text-sand-500";
  if (value < 0.7) return "text-red-600 font-medium";
  if (value < 0.85) return "text-amber-600";
  return "text-sand-900";
}

function StateBadge({ row }: { row: DriverTrackingRow }) {
  const { t } = useI18n();
  if (row.inTraining) {
    return (
      <span className="inline-flex items-center gap-1 px-2 h-6 rounded-pill bg-primary/10 text-primary text-xs font-medium">
        <GraduationCap size={12} aria-hidden="true" />
        {t("driverTracking.inTraining")}
      </span>
    );
  }
  if (row.isFrozen) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 h-6 rounded-pill bg-sky-100 text-sky-700 text-xs font-medium"
        title={row.complianceFreezeReason ?? undefined}
      >
        <Snowflake size={12} aria-hidden="true" />
        {t("driverTracking.frozen")}
      </span>
    );
  }
  const tone =
    row.status === "ACTIVE"
      ? "bg-forest-100 text-forest-700"
      : row.status === "SUSPENDED"
        ? "bg-red-100 text-red-700"
        : "bg-sand-200 text-sand-700";
  return (
    <span className={cn("inline-flex items-center px-2 h-6 rounded-pill text-xs font-medium", tone)}>
      {row.status}
    </span>
  );
}

export default function DriverTrackingTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  const canEdit = hasRole("SUPERVISOR");

  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [fleetPartnerId, setFleetPartnerId] = useState("");
  const [zoneId, setZoneId] = useState("");

  // Which driver a modal is open for, and which of the two modals it is. Both
  // need a reason, and a freeze with no reason is the support call this screen
  // exists to remove.
  const [freezing, setFreezing] = useState<DriverTrackingRow | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [training, setTraining] = useState<DriverTrackingRow | null>(null);
  const [periodDays, setPeriodDays] = useState(1);
  const [trainingReason, setTrainingReason] = useState("");

  const trackingQuery = useQuery({
    queryKey: ["darb", "driver-tracking", days, q, fleetPartnerId, zoneId],
    queryFn: () =>
      driverTrackingApi.list({
        days,
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(fleetPartnerId ? { fleetPartnerId } : {}),
        ...(zoneId ? { zoneId } : {}),
      }),
  });

  const fleetsQuery = useQuery({
    queryKey: ["darb", "fleets", "all"],
    queryFn: () => fleetsApi.list({ limit: 200 }),
  });
  const zonesQuery = useQuery({
    queryKey: ["darb", "zones", "all"],
    queryFn: () => zonesApi.list({ limit: 200 }),
  });

  const rows = trackingQuery.data?.rows ?? [];
  const fleets = useMemo(() => unwrapList<FleetProfile>(fleetsQuery.data), [fleetsQuery.data]);
  const zones = useMemo(() => unwrapList<DeliveryZone>(zonesQuery.data), [zonesQuery.data]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["darb", "driver-tracking"] });
    void queryClient.invalidateQueries({ queryKey: ["darb", "driver-training"] });
  }

  const stateMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: DriverStateAction; reason?: string }) =>
      driverTrackingApi.setState(id, action, reason),
    onSuccess: () => {
      toast.success(t("driverTracking.stateSaved"));
      setFreezing(null);
      setFreezeReason("");
      invalidate();
    },
    onError: (err: unknown) => {
      const payload = (err as { response?: { data?: { error?: string; code?: string } } })?.response?.data;
      // The one refusal worth its own sentence: activating past an open
      // training window would leave a driver who reads ACTIVE everywhere and
      // is still skipped by dispatch.
      toast.error(
        payload?.code === "IN_TRAINING"
          ? t("driverTracking.inTrainingBlocked")
          : (payload?.error ?? t("errors.savingData")),
      );
    },
  });

  const trainMutation = useMutation({
    mutationFn: (body: { driverId: string; periodDays: number; reason?: string }) =>
      driverTrainingApi.create(body),
    onSuccess: () => {
      toast.success(t("driverTracking.sent"));
      setTraining(null);
      setTrainingReason("");
      setPeriodDays(1);
      invalidate();
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message ?? t("errors.savingData"));
    },
  });

  if (trackingQuery.isLoading) return <PageSkeleton statCards={0} tableRows={8} tableCols={8} />;
  if (trackingQuery.error) {
    return (
      <ErrorState
        error={trackingQuery.error instanceof Error ? trackingQuery.error.message : t("errors.loadingData")}
        onRetry={() => trackingQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-sand-900">{t("driverTracking.title")}</h2>
        <p className="text-sm text-sand-600 mt-1">{t("driverTracking.subtitle")}</p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-sand-400"
            aria-hidden="true"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("driverTracking.searchPlaceholder")}
            className="h-9 ps-8 pe-3 w-56 rounded-pill border border-sand-200 bg-card text-sm"
          />
        </div>
        <select
          value={fleetPartnerId}
          onChange={(e) => setFleetPartnerId(e.target.value)}
          className="h-9 px-3 rounded-pill border border-sand-200 bg-card text-sm"
        >
          <option value="">{t("driverTracking.allCompanies")}</option>
          {fleets.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
          className="h-9 px-3 rounded-pill border border-sand-200 bg-card text-sm"
        >
          <option value="">{t("driverTracking.allAreas")}</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1 bg-sand-100 rounded-pill p-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={cn(
                "px-3 h-7 text-xs font-medium rounded-pill transition-colors",
                days === w ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
              )}
            >
              {t("driverTracking.windowDays").replace("{days}", String(w))}
            </button>
          ))}
        </div>
      </div>

      {/* ── The table ───────────────────────────────────────────────────── */}
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand-50 text-sand-600">
              <tr>
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.driver")}</th>
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.company")}</th>
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.area")}</th>
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.state")}</th>
                <th className="text-end font-medium px-4 py-3">{t("driverTracking.delivered")}</th>
                <th className="text-end font-medium px-4 py-3">{t("driverTracking.onTime")}</th>
                <th className="text-end font-medium px-4 py-3">{t("driverTracking.acceptance")}</th>
                <th className="text-end font-medium px-4 py-3">{t("driverTracking.rating")}</th>
                <th className="text-end font-medium px-4 py-3">{t("driverTracking.documents")}</th>
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.lastSeen")}</th>
                {canEdit && (
                  <th className="text-end font-medium px-4 py-3">{t("driverTracking.actions")}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 11 : 10} className="px-4 py-10 text-center text-sand-500">
                    {t("driverTracking.empty")}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-sand-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-sand-900">{row.name}</p>
                    <p className="text-xs text-sand-500">{row.driverCode ?? row.phone ?? "n/a"}</p>
                  </td>
                  <td className="px-4 py-3 text-sand-700">{row.fleetPartnerName ?? "n/a"}</td>
                  <td className="px-4 py-3 text-sand-700">{row.assignedZoneName ?? "n/a"}</td>
                  <td className="px-4 py-3">
                    <StateBadge row={row} />
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-sand-900">
                    {formatNumber(row.delivered, locale)}
                    {row.failed > 0 && (
                      <span className="text-xs text-red-600 ms-1">
                        ({formatNumber(row.failed, locale)})
                      </span>
                    )}
                  </td>
                  <td className={cn("px-4 py-3 text-end tabular-nums", rateTone(row.onTimeRate))}>
                    {pct(row.onTimeRate)}
                  </td>
                  <td className={cn("px-4 py-3 text-end tabular-nums", rateTone(row.acceptanceRate))}>
                    {pct(row.acceptanceRate)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-sand-900">
                    {row.rating === null ? "n/a" : row.rating.toFixed(1)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-end tabular-nums",
                      row.docsValid < row.docsRequired ? "text-amber-600" : "text-sand-900",
                    )}
                  >
                    {row.docsValid}/{row.docsRequired}
                  </td>
                  <td className="px-4 py-3 text-sand-600 text-xs">
                    {row.lastSeenAt ? formatDateTime(row.lastSeenAt, locale) : "n/a"}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {row.status !== "ACTIVE" && !row.inTraining && (
                          <button
                            type="button"
                            title={t("driverTracking.activate")}
                            onClick={() => stateMutation.mutate({ id: row.id, action: "ACTIVATE" })}
                            className="h-8 w-8 rounded-pill grid place-items-center text-forest-700 hover:bg-forest-50"
                          >
                            <UserCheck size={15} aria-hidden="true" />
                          </button>
                        )}
                        {row.status === "ACTIVE" && (
                          <button
                            type="button"
                            title={t("driverTracking.deactivate")}
                            onClick={() => stateMutation.mutate({ id: row.id, action: "DEACTIVATE" })}
                            className="h-8 w-8 rounded-pill grid place-items-center text-sand-600 hover:bg-sand-100"
                          >
                            <UserX size={15} aria-hidden="true" />
                          </button>
                        )}
                        {row.isFrozen ? (
                          <button
                            type="button"
                            title={t("driverTracking.unfreeze")}
                            onClick={() => stateMutation.mutate({ id: row.id, action: "UNFREEZE" })}
                            className="h-8 w-8 rounded-pill grid place-items-center text-amber-600 hover:bg-amber-50"
                          >
                            <Sun size={15} aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title={t("driverTracking.freeze")}
                            onClick={() => {
                              setFreezing(row);
                              setFreezeReason("");
                            }}
                            className="h-8 w-8 rounded-pill grid place-items-center text-sky-700 hover:bg-sky-50"
                          >
                            <Snowflake size={15} aria-hidden="true" />
                          </button>
                        )}
                        {!row.inTraining && (
                          <button
                            type="button"
                            title={t("driverTracking.sendToTraining")}
                            onClick={() => {
                              setTraining(row);
                              setPeriodDays(1);
                              setTrainingReason("");
                            }}
                            className="h-8 w-8 rounded-pill grid place-items-center text-primary hover:bg-primary/10"
                          >
                            <GraduationCap size={15} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Freeze ──────────────────────────────────────────────────────── */}
      <SlidePanel
        open={freezing !== null}
        onClose={() => setFreezing(null)}
        title={t("driverTracking.freeze")}
        subtitle={freezing?.name}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("driverTracking.freezeReason")}
            </label>
            <textarea
              value={freezeReason}
              onChange={(e) => setFreezeReason(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-sand-200 bg-card p-3 text-sm"
            />
            <p className="text-xs text-sand-500 mt-1">{t("driverTracking.freezeReasonHint")}</p>
          </div>
          <button
            type="button"
            disabled={!freezeReason.trim() || stateMutation.isPending}
            onClick={() =>
              freezing &&
              stateMutation.mutate({ id: freezing.id, action: "FREEZE", reason: freezeReason.trim() })
            }
            className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          >
            {t("driverTracking.freeze")}
          </button>
        </div>
      </SlidePanel>

      {/* ── Send for training ───────────────────────────────────────────── */}
      <SlidePanel
        open={training !== null}
        onClose={() => setTraining(null)}
        title={t("driverTracking.sendToTraining")}
        subtitle={training?.name}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("driverTracking.trainingPeriod")}
            </label>
            <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPeriodDays(n)}
                  className={cn(
                    "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
                    periodDays === n
                      ? "bg-white text-sand-900 shadow-soft"
                      : "text-sand-600 hover:text-sand-900",
                  )}
                >
                  {n === 1 ? t("driverTracking.oneDay") : t("driverTracking.days").replace("{n}", String(n))}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("driverTracking.trainingReason")}
            </label>
            <textarea
              value={trainingReason}
              onChange={(e) => setTrainingReason(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-sand-200 bg-card p-3 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={trainMutation.isPending}
            onClick={() =>
              training &&
              trainMutation.mutate({
                driverId: training.id,
                periodDays,
                ...(trainingReason.trim() ? { reason: trainingReason.trim() } : {}),
              })
            }
            className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          >
            {t("driverTracking.sendToTraining")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
