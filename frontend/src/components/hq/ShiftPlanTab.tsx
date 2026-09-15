"use client";
// Revision 20 — Ops › Shift planning.
//
// "system should give a proposed plan for each shift weekly, the system should
// read the past data and arrange the driver shifts accordingly and the ops team
// should be able to modify and approve the plan".
//
// A grid of areas by windows, one day at a time. Each cell shows the number the
// machine proposed and takes the number the planner wants, and the two are kept
// visibly apart: overwriting the proposal in place would lose the only thing
// that lets somebody argue with it.
//
// Nothing here writes the capacity the driver app books against until Approve,
// and the button says so. That is the whole reason the client asked for an
// approval step.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { shiftPlanningApi } from "@/lib/darbApi";
import type { ShiftPlanEntry } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatNumber } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

/** Index IS the stored day number, 0 = Sunday, matching getDay(). */
const WEEKDAY_KEYS = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"] as const;

/** Sunday 00:00 of the week containing `d`, as YYYY-MM-DD. */
function weekStartIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  // Local, not toISOString: a Kuwait Sunday is Saturday 21:00 UTC and the
  // server keys the plan on the date string, so UTC would land on the wrong
  // week for the first three hours of every day.
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function shiftWeek(iso: string, weeks: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return weekStartIso(d);
}

export default function ShiftPlanTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  const canPlan = hasRole("OPS_MANAGER");

  // Planning is done for the week ahead, so that is what opens.
  const [weekStart, setWeekStart] = useState(() => shiftWeek(weekStartIso(new Date()), 1));
  const [day, setDay] = useState<number>(0);
  /** Cell overrides the planner has typed but not saved, keyed zone|day|start. */
  const [edits, setEdits] = useState<Record<string, number>>({});

  const planQuery = useQuery({
    queryKey: ["darb", "shift-plan", weekStart],
    queryFn: () => shiftPlanningApi.plan(weekStart),
  });

  // A new week is a new grid; stale edits from the last one must not be
  // carried onto cells they were never typed for.
  useEffect(() => setEdits({}), [weekStart]);

  const payload = planQuery.data;
  const plan = payload?.plan ?? null;
  const zones = payload?.zones ?? [];
  const windows = payload?.windows ?? [];
  const drivers = payload?.drivers ?? [];
  const isDraft = plan?.status === "DRAFT";
  const editable = canPlan && isDraft;

  const byCell = useMemo(() => {
    const map = new Map<string, ShiftPlanEntry>();
    for (const e of plan?.entries ?? []) map.set(`${e.zoneId}|${e.dayOfWeek}|${e.startTime}`, e);
    return map;
  }, [plan]);

  const driverName = useMemo(
    () => new Map(drivers.map((d) => [d.id, d.name])),
    [drivers],
  );

  const totalSlots = useMemo(
    () =>
      (plan?.entries ?? []).reduce((sum, e) => {
        const key = `${e.zoneId}|${e.dayOfWeek}|${e.startTime}`;
        return sum + (edits[key] ?? e.approvedDrivers);
      }, 0),
    [plan, edits],
  );

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["darb", "shift-plan"] });
  }
  function failWith(err: unknown) {
    const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    toast.error(message ?? t("errors.savingData"));
  }

  const generateMutation = useMutation({
    mutationFn: () => shiftPlanningApi.generatePlan(weekStart),
    onSuccess: () => {
      setEdits({});
      refresh();
    },
    onError: failWith,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      shiftPlanningApi.savePlanEntries(
        plan!.id,
        Object.entries(edits).map(([key, approvedDrivers]) => {
          const [zoneId, dayOfWeek, startTime] = key.split("|");
          return { zoneId: zoneId!, dayOfWeek: Number(dayOfWeek), startTime: startTime!, approvedDrivers };
        }),
      ),
    onSuccess: () => {
      toast.success(t("shiftPlan.saved"));
      setEdits({});
      refresh();
    },
    onError: failWith,
  });

  const approveMutation = useMutation({
    // Save first: approving reads what is stored, so an unsaved cell would be
    // approved at its old value and nothing on screen would say so.
    mutationFn: async () => {
      if (Object.keys(edits).length > 0) await saveMutation.mutateAsync();
      return shiftPlanningApi.approvePlan(plan!.id);
    },
    onSuccess: () => {
      toast.success(t("shiftPlan.approvedToast"));
      setEdits({});
      refresh();
    },
    onError: failWith,
  });

  const discardMutation = useMutation({
    mutationFn: () => shiftPlanningApi.discardPlan(plan!.id),
    onSuccess: refresh,
    onError: failWith,
  });

  if (planQuery.isLoading) return <PageSkeleton statCards={0} tableRows={8} tableCols={8} />;
  if (planQuery.error) {
    return (
      <ErrorState
        error={planQuery.error instanceof Error ? planQuery.error.message : t("errors.loadingData")}
        onRetry={() => planQuery.refetch()}
      />
    );
  }

  const basis = (plan?.basis ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-sand-900">{t("shiftPlan.title")}</h2>
          <p className="text-sm text-sand-600 mt-1">{t("shiftPlan.subtitle")}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftWeek(w, -1))}
            title={t("shiftPlan.prevWeek")}
            className="h-9 w-9 rounded-pill grid place-items-center border border-sand-200 text-sand-600 hover:bg-sand-50"
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <span className="h-9 px-4 inline-flex items-center rounded-pill bg-sand-100 text-sm text-sand-900">
            <CalendarRange size={14} className="me-2 text-sand-500" aria-hidden="true" />
            {t("shiftPlan.weekOf").replace("{date}", formatDate(`${weekStart}T00:00:00`, locale))}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftWeek(w, 1))}
            title={t("shiftPlan.nextWeek")}
            className="h-9 w-9 rounded-pill grid place-items-center border border-sand-200 text-sand-600 hover:bg-sand-50"
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── No plan yet ─────────────────────────────────────────────────── */}
      {!plan && (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center">
          <p className="text-sand-900 font-medium">{t("shiftPlan.noPlan")}</p>
          <p className="text-sm text-sand-600 mt-1 max-w-lg mx-auto">{t("shiftPlan.noPlanHint")}</p>
          {canPlan && (
            <button
              type="button"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
              className="mt-4 h-10 px-5 inline-flex items-center gap-2 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
            >
              <Sparkles size={15} aria-hidden="true" />
              {t("shiftPlan.generate")}
            </button>
          )}
        </div>
      )}

      {plan && (
        <>
          {/* ── Status and what the proposal was built from ─────────────── */}
          <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "px-3 h-7 inline-flex items-center rounded-pill text-xs font-medium",
                    plan.status === "APPROVED"
                      ? "bg-forest-100 text-forest-700"
                      : plan.status === "DRAFT"
                        ? "bg-primary/10 text-primary"
                        : "bg-sand-200 text-sand-600",
                  )}
                >
                  {t(
                    plan.status === "APPROVED"
                      ? "shiftPlan.statusApproved"
                      : plan.status === "DRAFT"
                        ? "shiftPlan.statusDraft"
                        : "shiftPlan.statusDiscarded",
                  )}
                </span>
                <span className="text-sm text-sand-700 tabular-nums">
                  {t("shiftPlan.totalDrivers").replace("{n}", formatNumber(totalSlots, locale))}
                </span>
              </div>
              <p className="text-xs text-sand-500 mt-1">
                <span className="font-medium">{t("shiftPlan.basis")}: </span>
                {String(basis.method ?? "n/a")}
                {basis.ordersSampled !== undefined
                  ? ` (${formatNumber(Number(basis.ordersSampled), locale)} orders, ${String(basis.lookbackWeeks ?? "n/a")} weeks)`
                  : ""}
              </p>
              {plan.status === "APPROVED" && plan.approvedBy && (
                <p className="text-xs text-sand-500 mt-0.5">
                  {t("shiftPlan.approvedBy").replace("{name}", plan.approvedBy.name)}
                </p>
              )}
            </div>
            {canPlan && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={generateMutation.isPending}
                  onClick={() => generateMutation.mutate()}
                  className="h-9 px-4 inline-flex items-center gap-2 rounded-pill border border-sand-200 text-sand-700 text-sm disabled:opacity-40"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  {t("shiftPlan.regenerate")}
                </button>
                {isDraft && (
                  <>
                    <button
                      type="button"
                      disabled={Object.keys(edits).length === 0 || saveMutation.isPending}
                      onClick={() => saveMutation.mutate()}
                      className="h-9 px-4 rounded-pill border border-sand-200 text-sand-700 text-sm disabled:opacity-40"
                    >
                      {t("shiftPlan.save")}
                    </button>
                    <button
                      type="button"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate()}
                      className="h-9 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
                    >
                      {t("shiftPlan.approve")}
                    </button>
                    <button
                      type="button"
                      disabled={discardMutation.isPending}
                      onClick={() => discardMutation.mutate()}
                      className="h-9 px-4 rounded-pill text-sand-600 text-sm hover:bg-sand-100 disabled:opacity-40"
                    >
                      {t("shiftPlan.discard")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {isDraft && canPlan && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2">
              {t("shiftPlan.approveWarning")}
            </p>
          )}
          {!isDraft && (
            <p className="text-xs text-sand-600 bg-sand-50 border border-sand-200 rounded-2xl px-4 py-2">
              {t("shiftPlan.readOnly")}
            </p>
          )}

          {/* ── Day picker ──────────────────────────────────────────────── */}
          <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit flex-wrap">
            {WEEKDAY_KEYS.map((key, index) => (
              <button
                key={key}
                type="button"
                onClick={() => setDay(index)}
                className={cn(
                  "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
                  day === index ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
                )}
              >
                {t(`shifts.${key}`)}
              </button>
            ))}
          </div>

          {/* ── The grid ────────────────────────────────────────────────── */}
          <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sand-50 text-sand-600">
                  <tr>
                    <th className="text-start font-medium px-4 py-3 sticky start-0 bg-sand-50">
                      {t("shiftPlan.zone")}
                    </th>
                    {windows.map((w) => (
                      <th key={w} className="text-center font-medium px-3 py-3 whitespace-nowrap">
                        {w}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {zones.map((zone) => (
                    <tr key={zone.id} className="hover:bg-sand-50/60">
                      <td className="px-4 py-2 font-medium text-sand-900 sticky start-0 bg-card">
                        {zone.name}
                      </td>
                      {windows.map((w) => {
                        const key = `${zone.id}|${day}|${w}`;
                        const entry = byCell.get(key);
                        if (!entry) return <td key={w} className="px-3 py-2 text-center text-sand-400">n/a</td>;
                        const value = edits[key] ?? entry.approvedDrivers;
                        const changed = value !== entry.proposedDrivers;
                        const suggested = entry.suggestedDriverIds
                          .map((id) => driverName.get(id))
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <td key={w} className="px-3 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              disabled={!editable}
                              value={value}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [key]: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                                }))
                              }
                              title={
                                suggested
                                  ? `${t("shiftPlan.suggestedDrivers")}: ${suggested}`
                                  : t("shiftPlan.noSuggestions")
                              }
                              className={cn(
                                "w-14 h-9 text-center rounded-pill border bg-card tabular-nums",
                                changed ? "border-primary text-primary font-medium" : "border-sand-200",
                                !editable && "opacity-60",
                              )}
                            />
                            <p className="text-[10px] text-sand-400 mt-0.5 tabular-nums">
                              {t("shiftPlan.proposed")} {entry.proposedDrivers} · {entry.demandOrders}
                            </p>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
