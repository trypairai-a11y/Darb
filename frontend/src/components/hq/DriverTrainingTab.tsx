"use client";
// Revision 20 — Ops › Driver training.
//
// "in this tab the driver that in training sessions he will get fake orders to
// be delivered and the ops team will monitor the driver, also they can adjust
// the training period here as an example 1/2/3 days then it will show his
// performance, after finishing the sessions the ops team will activate the
// driver account".
//
// A list of windows on the left, the open one's detail on the right. The
// numbers on the right are computed live while a window is running and frozen
// when it closes, because a coach watches them move and a verdict should not
// silently disagree with what the coach saw.
//
// The practice orders are REAL orders. The banner says so, because an ops user
// who believes they are simulated will not understand why the driver's app is
// asking for a PIN at the door.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Info, Plus, TriangleAlert } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { useToast } from "@/components/shared/Toast";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { driverTrainingApi } from "@/lib/darbApi";
import type { TrainingSession, TrainingStatus } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatNumber } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

const STATUS_I18N: Record<TrainingStatus, string> = {
  SCHEDULED: "driverTraining.statusScheduled",
  IN_PROGRESS: "driverTraining.statusInProgress",
  PASSED: "driverTraining.statusPassed",
  FAILED: "driverTraining.statusFailed",
  CANCELLED: "driverTraining.statusCancelled",
};

const STATUS_TONE: Record<TrainingStatus, string> = {
  SCHEDULED: "bg-sand-200 text-sand-700",
  IN_PROGRESS: "bg-primary/10 text-primary",
  PASSED: "bg-forest-100 text-forest-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-sand-200 text-sand-600",
};

function pct(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-sand-50 rounded-2xl px-3 py-2">
      <p className="text-[11px] text-sand-600">{label}</p>
      <p className="text-lg font-display text-sand-900 tabular-nums">{value}</p>
    </div>
  );
}

export default function DriverTrainingTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  const canRun = hasRole("SUPERVISOR");

  const [openId, setOpenId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");

  const listQuery = useQuery({
    queryKey: ["darb", "driver-training", "list"],
    queryFn: () => driverTrainingApi.list(),
    // A window with orders in flight changes under the coach's eyes, so the
    // list refreshes on its own rather than waiting to be reloaded.
    refetchInterval: 20_000,
  });
  const sessions = listQuery.data?.data ?? [];

  // Open the first running window by default: it is the one being watched.
  useEffect(() => {
    if (openId || sessions.length === 0) return;
    const running = sessions.find((s) => s.status === "IN_PROGRESS") ?? sessions[0];
    if (running) setOpenId(running.id);
  }, [sessions, openId]);

  const detailQuery = useQuery({
    queryKey: ["darb", "driver-training", "detail", openId],
    queryFn: () => driverTrainingApi.detail(openId!),
    enabled: Boolean(openId),
    refetchInterval: 20_000,
  });
  const detail = detailQuery.data;

  const pickupQuery = useQuery({
    queryKey: ["darb", "driver-training", "pickup-points"],
    queryFn: () => driverTrainingApi.pickupPoints(),
    enabled: issuing,
  });
  const pickupPoints = useMemo(() => pickupQuery.data?.data ?? [], [pickupQuery.data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["darb", "driver-training"] });
    void queryClient.invalidateQueries({ queryKey: ["darb", "driver-tracking"] });
  }

  function failWith(err: unknown) {
    const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    toast.error(message ?? t("errors.savingData"));
  }

  const periodMutation = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) => driverTrainingApi.setPeriod(id, days),
    onSuccess: () => {
      toast.success(t("driverTraining.periodSaved"));
      refresh();
    },
    onError: failWith,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => driverTrainingApi.start(id),
    onSuccess: () => {
      toast.success(t("driverTraining.started"));
      refresh();
    },
    onError: failWith,
  });

  const issueMutation = useMutation({
    mutationFn: (id: string) =>
      driverTrainingApi.issueOrder(id, {
        branchId,
        ...(dropoffAddress.trim() ? { dropoffAddress: dropoffAddress.trim() } : {}),
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success(t("driverTraining.orderIssued"));
      setIssuing(false);
      setDropoffAddress("");
      setCustomerName("");
      refresh();
    },
    onError: failWith,
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: "PASSED" | "FAILED" }) =>
      driverTrainingApi.complete(id, outcome, outcomeNote.trim() || undefined),
    onSuccess: () => {
      toast.success(t("driverTraining.completed"));
      setOutcomeNote("");
      refresh();
    },
    onError: failWith,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => driverTrainingApi.cancel(id, outcomeNote.trim() || undefined),
    onSuccess: () => {
      toast.success(t("driverTraining.completed"));
      setOutcomeNote("");
      refresh();
    },
    onError: failWith,
  });

  if (listQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={4} />;
  if (listQuery.error) {
    return (
      <ErrorState
        error={listQuery.error instanceof Error ? listQuery.error.message : t("errors.loadingData")}
        onRetry={() => listQuery.refetch()}
      />
    );
  }

  const live = detail?.status === "SCHEDULED" || detail?.status === "IN_PROGRESS";
  const scorecard = detail?.scorecard ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-sand-900">{t("driverTraining.title")}</h2>
        <p className="text-sm text-sand-600 mt-1">{t("driverTraining.subtitle")}</p>
      </div>

      {/* The one thing an ops user has to understand before pressing anything. */}
      <div className="flex items-start gap-2 bg-sand-50 border border-sand-200 rounded-2xl px-4 py-3">
        <Info size={15} className="text-sand-500 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-xs text-sand-600">{t("driverTraining.moneyNote")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* ── The windows ──────────────────────────────────────────────── */}
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
          {sessions.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-sand-500">{t("driverTraining.empty")}</p>
          ) : (
            <ul className="divide-y divide-sand-100 max-h-[600px] overflow-y-auto">
              {sessions.map((s: TrainingSession) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(s.id)}
                    className={cn(
                      "w-full text-start px-4 py-3 transition-colors",
                      openId === s.id ? "bg-primary/5" : "hover:bg-sand-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sand-900 truncate">{s.driver.name}</p>
                      <span
                        className={cn(
                          "shrink-0 px-2 h-5 inline-flex items-center rounded-pill text-[11px] font-medium",
                          STATUS_TONE[s.status],
                        )}
                      >
                        {t(STATUS_I18N[s.status])}
                      </span>
                    </div>
                    <p className="text-xs text-sand-500 mt-0.5">
                      {s.driver.fleetPartner?.name ?? s.driver.driverCode ?? "n/a"}
                      {" · "}
                      {t("driverTracking.days").replace("{n}", String(s.periodDays))}
                    </p>
                    {s.scorecard && (
                      <p className="text-xs text-sand-600 mt-1 tabular-nums">
                        {formatNumber(s.scorecard.delivered, locale)}/
                        {formatNumber(s.scorecard.assigned, locale)}
                        {" · "}
                        {pct(s.scorecard.onTimeRate)}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── The open window ──────────────────────────────────────────── */}
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5 space-y-5">
          {!detail ? (
            <p className="text-sm text-sand-500 py-10 text-center">{t("driverTraining.empty")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg text-sand-900">{detail.driver.name}</h3>
                  <p className="text-sm text-sand-600">
                    {t("driverTraining.ends").replace("{date}", formatDateTime(detail.endsAt, locale))}
                    {detail.coach ? ` · ${detail.coach.name}` : ""}
                  </p>
                  {detail.reason && <p className="text-xs text-sand-500 mt-1">{detail.reason}</p>}
                </div>
                <span
                  className={cn(
                    "px-3 h-7 inline-flex items-center rounded-pill text-xs font-medium",
                    STATUS_TONE[detail.status],
                  )}
                >
                  {t(STATUS_I18N[detail.status])}
                </span>
              </div>

              {/* The period, adjustable mid-window — the client asked for this
                  by name, so it is a control and not a read-only field. */}
              {canRun && live && (
                <div>
                  <p className="text-sm font-medium text-sand-900 mb-1">
                    {t("driverTraining.changePeriod")}
                  </p>
                  <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={periodMutation.isPending}
                        onClick={() => periodMutation.mutate({ id: detail.id, days: n })}
                        className={cn(
                          "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
                          detail.periodDays === n
                            ? "bg-white text-sand-900 shadow-soft"
                            : "text-sand-600 hover:text-sand-900",
                        )}
                      >
                        {n === 1
                          ? t("driverTracking.oneDay")
                          : t("driverTracking.days").replace("{n}", String(n))}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Performance ──────────────────────────────────────── */}
              {scorecard && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label={t("driverTraining.assigned")} value={formatNumber(scorecard.assigned, locale)} />
                  <Metric
                    label={t("driverTraining.deliveredCount")}
                    value={formatNumber(scorecard.delivered, locale)}
                  />
                  <Metric label={t("driverTraining.onTimeRate")} value={pct(scorecard.onTimeRate)} />
                  <Metric
                    label={t("driverTraining.avgMinutes")}
                    value={scorecard.avgMinutes === null ? "n/a" : String(scorecard.avgMinutes)}
                  />
                </div>
              )}

              {/* ── The practice orders ──────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-sand-900">{t("driverTraining.orders")}</p>
                  {canRun && detail.status === "IN_PROGRESS" && (
                    <button
                      type="button"
                      onClick={() => setIssuing(true)}
                      className="h-8 px-3 inline-flex items-center gap-1 rounded-pill bg-primary text-white text-xs font-medium"
                    >
                      <Plus size={13} aria-hidden="true" />
                      {t("driverTraining.issueOrder")}
                    </button>
                  )}
                  {canRun && detail.status === "SCHEDULED" && (
                    <button
                      type="button"
                      onClick={() => startMutation.mutate(detail.id)}
                      className="h-8 px-3 rounded-pill bg-primary text-white text-xs font-medium"
                    >
                      {t("driverTraining.start")}
                    </button>
                  )}
                </div>
                {detail.orders.length === 0 ? (
                  <p className="text-sm text-sand-500 py-6 text-center bg-sand-50 rounded-2xl">
                    {t("driverTraining.noOrders")}
                  </p>
                ) : (
                  <ul className="divide-y divide-sand-100 border border-sand-200 rounded-2xl overflow-hidden">
                    {detail.orders.map((o) => (
                      <li key={o.id} className="px-3 py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-sand-900 truncate">
                            {o.orderNumber}
                            <span className="ms-2 text-[10px] uppercase tracking-wide text-primary">
                              {t("driverTraining.practiceBadge")}
                            </span>
                          </p>
                          <p className="text-xs text-sand-500 truncate">
                            {o.branch?.name ?? "n/a"}
                            {o.dropoffAddress ? ` → ${o.dropoffAddress}` : ""}
                          </p>
                        </div>
                        <StatusBadge status={o.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Closing it ───────────────────────────────────────── */}
              {canRun && live && (
                <div className="border-t border-sand-100 pt-4 space-y-3">
                  <textarea
                    value={outcomeNote}
                    onChange={(e) => setOutcomeNote(e.target.value)}
                    rows={2}
                    placeholder={t("driverTraining.outcomeNote")}
                    className="w-full rounded-2xl border border-sand-200 bg-card p-3 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={completeMutation.isPending}
                      onClick={() => completeMutation.mutate({ id: detail.id, outcome: "PASSED" })}
                      className="h-10 px-5 inline-flex items-center gap-2 rounded-pill bg-forest-600 text-white text-sm font-medium disabled:opacity-40"
                    >
                      <CircleCheck size={15} aria-hidden="true" />
                      {t("driverTraining.pass")}
                    </button>
                    <button
                      type="button"
                      disabled={completeMutation.isPending}
                      onClick={() => completeMutation.mutate({ id: detail.id, outcome: "FAILED" })}
                      className="h-10 px-5 inline-flex items-center gap-2 rounded-pill border border-sand-200 text-sand-700 text-sm font-medium disabled:opacity-40"
                    >
                      <TriangleAlert size={15} aria-hidden="true" />
                      {t("driverTraining.fail")}
                    </button>
                    <button
                      type="button"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(detail.id)}
                      className="h-10 px-4 rounded-pill text-sand-600 text-sm hover:bg-sand-100 disabled:opacity-40"
                    >
                      {t("driverTraining.cancel")}
                    </button>
                  </div>
                  <p className="text-xs text-sand-500">{t("driverTraining.passHint")}</p>
                </div>
              )}

              {!live && detail.outcomeNote && (
                <p className="text-sm text-sand-600 border-t border-sand-100 pt-4">{detail.outcomeNote}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Give a practice order ───────────────────────────────────────── */}
      <SlidePanel
        open={issuing}
        onClose={() => setIssuing(false)}
        title={t("driverTraining.issueOrder")}
        subtitle={detail?.driver.name}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("driverTraining.pickupPoint")}
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full h-10 px-3 rounded-pill border border-sand-200 bg-card text-sm"
            >
              <option value="">n/a</option>
              {pickupPoints.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.vendor.name} — {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("driverTraining.dropoffAddress")}
            </label>
            <input
              value={dropoffAddress}
              onChange={(e) => setDropoffAddress(e.target.value)}
              className="w-full h-10 px-3 rounded-pill border border-sand-200 bg-card text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("driverTraining.customerName")}
            </label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full h-10 px-3 rounded-pill border border-sand-200 bg-card text-sm"
            />
          </div>
          <button
            type="button"
            disabled={!branchId || issueMutation.isPending}
            onClick={() => detail && issueMutation.mutate(detail.id)}
            className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          >
            {t("driverTraining.issueOrder")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
