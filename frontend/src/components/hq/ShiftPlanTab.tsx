"use client";
// Revision 20 — Ops › Shift planning.
//
// "system should give a proposed plan for each shift weekly, the system should
// read the past data and arrange the driver shifts accordingly and the ops team
// should be able to modify and approve the plan".
//
// One day at a time, one card per area. Each slot shows the number the machine
// proposed and takes the number the planner wants, and the two are kept
// visibly apart: overwriting the proposal in place would lose the only thing
// that lets somebody argue with it.
//
// Revision 24 (#3): "Shifts must be either 2, 3, or 4-hour slots ... the
// system should optimize the shifts to handle the peak hours, so more drivers
// would be online at these times." The two fixed 12-hour duties are gone. An
// area's day is a set of 2, 3 and 4-hour slots, drawn against the hourly
// demand curve so the planner can see the peaks are staffed, and slots can be
// resized, added and removed before approval.
//
// Nothing here writes the capacity the driver app books against until Approve,
// and the button says so. That is the whole reason the client asked for an
// approval step.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronLeft, ChevronRight, Plus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { shiftPlanningApi } from "@/lib/darbApi";
import type { ShiftPlanEntryEdit } from "@/lib/darbApi";
import type { ShiftPlanEntry } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatNumber } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

/** Index IS the stored day number, 0 = Sunday, matching getDay(). */
const WEEKDAY_KEYS = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"] as const;

/** The lengths a slot may be, when the server does not say (revision 24 #3). */
const FALLBACK_SLOT_MINUTES = [120, 180, 240];
const DUTY_HOURS = 12;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hh(h: number): string {
  return `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;
}

/** A slot as the screen holds it: the stored entry with any unsaved edit on top. */
interface SlotView {
  key: string;
  start: string;
  startHour: number;
  durationMinutes: number;
  proposed: number;
  value: number;
  demandOrders: number;
  suggestedDriverIds: string[];
  added: boolean;
  changed: boolean;
}

/** An unsaved change to one slot, keyed zone|day|start. */
interface SlotEdit {
  approvedDrivers?: number;
  durationMinutes?: number;
  remove?: boolean;
  added?: boolean;
}

/** Drivers on per hour for a set of slots (anything past 24:00 is ignored). */
function coverOf(slots: SlotView[]): number[] {
  const out = HOURS.map(() => 0);
  for (const s of slots) {
    for (let j = s.startHour; j < s.startHour + s.durationMinutes / 60 && j < 24; j++) out[j] += s.value;
  }
  return out;
}

/**
 * The hourly picture for one area's day: orders (as the drivers they call
 * for) against the drivers the slots put on. Bars are the need, the line is
 * the planned cover; an hour where the line sits under its bar is drawn in
 * amber, because that is the hour the plan will run short.
 */
function DemandCurve({
  need,
  cover,
  label,
}: {
  need: number[] | null;
  cover: number[];
  label: (h: number) => string;
}) {
  const max = Math.max(1, ...cover, ...(need ?? []));
  const W = 24 * 10;
  const H = 64;
  const y = (v: number) => H - (v / max) * (H - 4);
  const line = cover
    .map((v, h) => `${h === 0 ? "M" : "L"}${h * 10},${y(v)} L${h * 10 + 10},${y(v)}`)
    .join(" ");
  return (
    <div className="mt-2" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none" role="img">
        {HOURS.map((h) => {
          const n = need?.[h] ?? 0;
          const short = need ? cover[h]! < n : false;
          return (
            <rect
              key={h}
              x={h * 10 + 1}
              y={y(n)}
              width={8}
              height={H - y(n)}
              className={short ? "fill-amber-300" : "fill-sand-200"}
            >
              <title>{label(h)}</title>
            </rect>
          );
        })}
        <path d={line} className="stroke-primary" fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-sand-400 tabular-nums">
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
          <span key={h}>{hh(h)}</span>
        ))}
        <span>24:00</span>
      </div>
    </div>
  );
}

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
  /** Slot changes the planner has made but not saved, keyed zone|day|start. */
  const [edits, setEdits] = useState<Record<string, SlotEdit>>({});
  /** The add-a-slot controls, per area. */
  const [adding, setAdding] = useState<Record<string, { start: number; minutes: number }>>({});

  const planQuery = useQuery({
    queryKey: ["darb", "shift-plan", weekStart],
    queryFn: () => shiftPlanningApi.plan(weekStart),
  });

  // A new week is a new grid; stale edits from the last one must not be
  // carried onto cells they were never typed for.
  useEffect(() => setEdits({}), [weekStart]);

  const payload = planQuery.data;
  const plan = payload?.plan ?? null;
  const zones = useMemo(() => payload?.zones ?? [], [payload]);
  const slotDurations = payload?.slotDurations ?? FALLBACK_SLOT_MINUTES;
  const dutyHours = payload?.dutyHours ?? DUTY_HOURS;
  const drivers = payload?.drivers ?? [];
  // Revision 21 (#2): "put the total number of drivers available". Total in
  // the header, per area in the row, and a cell that asks for more than the
  // area has is marked, because the app can never fill it.
  const availability = payload?.availability ?? { total: 0, unassigned: 0, byZone: {} };
  const isDraft = plan?.status === "DRAFT";
  const isApproved = plan?.status === "APPROVED";
  // Revision 21b: "must give the option to adjust the plan after approving".
  // An approved week stays editable; saving it rewrites the live grid.
  const editable = canPlan && (isDraft || isApproved);

  const byCell = useMemo(() => {
    const map = new Map<string, ShiftPlanEntry>();
    for (const e of plan?.entries ?? []) map.set(`${e.zoneId}|${e.dayOfWeek}|${e.startTime}`, e);
    return map;
  }, [plan]);

  const driverName = useMemo(
    () => new Map(drivers.map((d) => [d.id, d.name])),
    [drivers],
  );

  /**
   * The selected day's slots per area: what is stored, with unsaved edits on
   * top, removed slots dropped and added ones included, ordered by start.
   */
  const slotsByZone = useMemo(() => {
    const out: Record<string, SlotView[]> = {};
    for (const zone of zones) out[zone.id] = [];
    const seen = new Set<string>();
    for (const e of plan?.entries ?? []) {
      if (e.dayOfWeek !== day || !out[e.zoneId]) continue;
      const key = `${e.zoneId}|${e.dayOfWeek}|${e.startTime}`;
      seen.add(key);
      const edit = edits[key];
      if (edit?.remove) continue;
      const durationMinutes = edit?.durationMinutes ?? e.durationMinutes ?? 180;
      const value = edit?.approvedDrivers ?? e.approvedDrivers;
      out[e.zoneId]!.push({
        key,
        start: e.startTime,
        startHour: Number(e.startTime.slice(0, 2)),
        durationMinutes,
        proposed: e.proposedDrivers,
        value,
        demandOrders: e.demandOrders,
        suggestedDriverIds: e.suggestedDriverIds,
        added: false,
        changed: value !== e.proposedDrivers || durationMinutes !== (e.durationMinutes ?? 180),
      });
    }
    for (const [key, edit] of Object.entries(edits)) {
      if (seen.has(key) || edit.remove || !edit.added) continue;
      const [zoneId, d, start] = key.split("|");
      if (Number(d) !== day || !out[zoneId!]) continue;
      out[zoneId!]!.push({
        key,
        start: start!,
        startHour: Number(start!.slice(0, 2)),
        durationMinutes: edit.durationMinutes ?? 180,
        proposed: 0,
        value: edit.approvedDrivers ?? 0,
        demandOrders: 0,
        suggestedDriverIds: [],
        added: true,
        changed: true,
      });
    }
    for (const list of Object.values(out)) list.sort((x, y) => x.startHour - y.startHour);
    return out;
  }, [zones, plan, edits, day]);

  /**
   * People an area needs on the selected day: the driver-hours its slots
   * add up to, over the 12-hour duty one driver works. This is the number to
   * hold against the drivers an area has.
   */
  const neededByZone = useMemo(() => {
    const out: Record<string, { people: number; driverHours: number }> = {};
    for (const zone of zones) {
      const driverHours = (slotsByZone[zone.id] ?? []).reduce(
        (sum, s) => sum + (s.value * s.durationMinutes) / 60,
        0,
      );
      out[zone.id] = { driverHours, people: Math.ceil(driverHours / dutyHours) };
    }
    return out;
  }, [zones, slotsByZone, dutyHours]);
  const neededOnDay = Object.values(neededByZone).reduce((a, b) => a + b.people, 0);

  function editSlot(key: string, patch: SlotEdit) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function removeSlot(slot: SlotView) {
    setEdits((prev) => {
      const next = { ...prev };
      // A slot added and removed before saving was never on the server.
      if (slot.added) delete next[slot.key];
      else next[slot.key] = { remove: true };
      return next;
    });
  }
  function addSlot(zoneId: string) {
    const pick = adding[zoneId] ?? { start: 12, minutes: slotDurations[0] ?? 120 };
    const key = `${zoneId}|${day}|${hh(pick.start)}`;
    if ((slotsByZone[zoneId] ?? []).some((s) => s.key === key)) {
      toast.error(t("shiftSlots.slotExists"));
      return;
    }
    const stored = byCell.get(key);
    // A slot removed in this session and added back is an edit of the stored
    // row, not a new one.
    setEdits((prev) => ({
      ...prev,
      [key]: stored
        ? { approvedDrivers: 1, durationMinutes: pick.minutes }
        : { added: true, approvedDrivers: 1, durationMinutes: pick.minutes },
    }));
  }

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["darb", "shift-plan"] });
  }
  function failWith(err: unknown) {
    const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    toast.error(message ?? t("errors.savingData"));
  }

  // Revision 21c: "still I can't change the plan, need to be able to reset
  // the plan". Build it again on an APPROVED week used to answer 409 and
  // nothing on screen offered a way through. It now asks first, because the
  // rebuild drops the approval: the week goes back to a draft that has to be
  // signed off again, while the driver app keeps booking against the grid
  // that was approved until then.
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const generateMutation = useMutation({
    mutationFn: (opts?: { replaceApproved?: boolean }) => shiftPlanningApi.generatePlan(weekStart, opts),
    onSuccess: (_result, opts) => {
      if (opts?.replaceApproved) toast.success(t("shiftPlan.rebuilt"));
      setRebuildOpen(false);
      setEdits({});
      refresh();
    },
    onError: failWith,
  });
  function requestRebuild() {
    if (isApproved) setRebuildOpen(true);
    else generateMutation.mutate(undefined);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      shiftPlanningApi.savePlanEntries(
        plan!.id,
        Object.entries(edits).map(([key, edit]): ShiftPlanEntryEdit => {
          const [zoneId, dayOfWeek, startTime] = key.split("|");
          const base = { zoneId: zoneId!, dayOfWeek: Number(dayOfWeek), startTime: startTime! };
          if (edit.remove) return { ...base, remove: true };
          return {
            ...base,
            ...(edit.approvedDrivers !== undefined ? { approvedDrivers: edit.approvedDrivers } : {}),
            ...(edit.durationMinutes !== undefined ? { durationMinutes: edit.durationMinutes } : {}),
          };
        }),
      ),
    onSuccess: () => {
      toast.success(t(isApproved ? "shiftPlan.amended" : "shiftPlan.saved"));
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
          {/* Today's shifts, the coverage grid and which area each driver
              works in live at /shifts. The old Setup hub was its only link,
              and drivers with no area cannot book a shift at all. */}
          <Link
            href="/shifts?tab=areas"
            data-testid="shift-plan-open-shifts"
            className="h-9 px-4 me-2 inline-flex items-center rounded-pill border border-sand-200 text-sm text-sand-700 hover:bg-sand-50"
          >
            {t("shiftPlan.driverAreas")}
          </Link>
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
              onClick={() => generateMutation.mutate(undefined)}
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
                <span className="text-sm text-sand-700 tabular-nums" data-testid="shift-plan-needed-on-day">
                  {t("shiftSlots.neededOnDay")
                    .replace("{n}", formatNumber(neededOnDay, locale))
                    .replace("{day}", t(`shiftsPage.${WEEKDAY_KEYS[day]}`))}
                </span>
                <span className="text-sand-300">·</span>
                <span
                  className="text-sm text-sand-900 font-medium tabular-nums"
                  data-testid="shift-plan-drivers-available"
                >
                  {t("shiftPlan.driversAvailable").replace("{n}", formatNumber(availability.total, locale))}
                </span>
                {/* Client note, 2026-08-04: ops assigns drivers to areas. That
                    screen lives at /shifts?tab=areas and nothing linked to it,
                    so the warning is the way in. */}
                {availability.unassigned > 0 && (
                  <Link
                    href="/shifts?tab=areas"
                    data-testid="shift-plan-assign-areas"
                    className="text-xs text-amber-700 tabular-nums underline underline-offset-2 hover:text-amber-800"
                  >
                    {t("shiftPlan.driversUnassigned").replace(
                      "{n}",
                      formatNumber(availability.unassigned, locale),
                    )}
                  </Link>
                )}
              </div>
              <p className="text-xs text-sand-500 mt-1">
                <span className="font-medium">{t("shiftPlan.basis")}: </span>
                {basis.needByHour ? t("shiftSlots.planMethod") : String(basis.method ?? "n/a")}
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
                  data-testid="shift-plan-rebuild"
                  disabled={generateMutation.isPending}
                  onClick={requestRebuild}
                  className="h-9 px-4 inline-flex items-center gap-2 rounded-pill border border-sand-200 text-sand-700 text-sm disabled:opacity-40"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  {t("shiftPlan.regenerate")}
                </button>
                {(isDraft || isApproved) && (
                  <button
                    type="button"
                    data-testid="shift-plan-save"
                    disabled={Object.keys(edits).length === 0 || saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                    className={cn(
                      "h-9 px-4 rounded-pill text-sm disabled:opacity-40",
                      isApproved
                        ? "bg-primary text-white font-medium"
                        : "border border-sand-200 text-sand-700",
                    )}
                  >
                    {t("shiftPlan.save")}
                  </button>
                )}
                {isDraft && (
                  <>
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
          {isApproved && canPlan && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2">
              {t("shiftPlan.amendWarning")}
            </p>
          )}
          {!isDraft && !isApproved && (
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
                {/* `shiftsPage`, not `shifts`: the wrong namespace shipped in
                    revision 20 and the tabs read "shifts.daySun" on prod. */}
                {t(`shiftsPage.${key}`)}
              </button>
            ))}
          </div>

          {/* ── One card per area: the curve, then its slots ─────────────── */}
          <div className="space-y-3">
            {zones.map((zone) => {
              const slots = slotsByZone[zone.id] ?? [];
              const needCurve =
                (basis.needByHour as Record<string, number[][]> | undefined)?.[zone.id]?.[day] ?? null;
              const demandCurve =
                (basis.demandByHour as Record<string, number[][]> | undefined)?.[zone.id]?.[day] ?? null;
              const cover = coverOf(slots);
              const shortHours = needCurve ? HOURS.filter((h) => cover[h]! < (needCurve[h] ?? 0)) : [];
              const needed = neededByZone[zone.id] ?? { people: 0, driverHours: 0 };
              const has = availability.byZone[zone.id] ?? 0;
              const short = needed.people - has;
              const pick = adding[zone.id] ?? { start: 12, minutes: slotDurations[0] ?? 120 };
              return (
                <section
                  key={zone.id}
                  className="bg-card border border-sand-200 rounded-2xl shadow-soft p-4"
                  data-testid="shift-plan-zone"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="font-medium text-sand-900">{zone.name}</h3>
                      <p className="text-[11px] text-sand-500 tabular-nums">
                        {t("shiftPlan.zoneDrivers").replace("{n}", formatNumber(has, locale))}
                        {" · "}
                        {t("shiftSlots.driverHours").replace("{n}", formatNumber(Math.round(needed.driverHours), locale))}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-xs tabular-nums",
                        short > 0 ? "text-amber-700 font-medium" : "text-sand-600",
                      )}
                      data-testid="shift-plan-zone-needed"
                    >
                      {t("shiftSlots.zoneNeeded").replace("{n}", formatNumber(needed.people, locale))}
                      {short > 0 && ` · ${t("shiftSlots.zoneShort").replace("{n}", formatNumber(short, locale))}`}
                    </p>
                  </div>

                  {/* The demand curve against the planned cover. */}
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-sand-600">
                      <span className="font-medium text-sand-800">{t("shiftSlots.curveTitle")}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-sand-200" aria-hidden="true" />
                        {t("shiftSlots.legendNeed")}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-0.5 w-4 bg-primary" aria-hidden="true" />
                        {t("shiftSlots.legendCover")}
                      </span>
                    </div>
                    <DemandCurve
                      need={needCurve}
                      cover={cover}
                      label={(h) =>
                        t("shiftSlots.curveHour")
                          .replace("{hour}", hh(h))
                          .replace("{orders}", formatNumber(demandCurve?.[h] ?? 0, locale))
                          .replace("{need}", formatNumber(needCurve?.[h] ?? 0, locale))
                          .replace("{cover}", formatNumber(cover[h] ?? 0, locale))
                      }
                    />
                    {!needCurve && <p className="text-[11px] text-sand-500 mt-1">{t("shiftSlots.noCurve")}</p>}
                    {shortHours.length > 0 && (
                      <p className="text-[11px] text-amber-700 mt-1 tabular-nums">
                        {t("shiftSlots.underCovered").replace("{hours}", shortHours.map(hh).join(", "))}
                      </p>
                    )}
                  </div>

                  {/* The slots themselves. */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {slots.length === 0 && <p className="text-sm text-sand-500">{t("shiftSlots.noSlots")}</p>}
                    {slots.map((slot) => {
                      const over = slot.value > has;
                      const suggested = slot.suggestedDriverIds
                        .map((id) => driverName.get(id))
                        .filter(Boolean)
                        .join(", ");
                      const end = slot.startHour + slot.durationMinutes / 60;
                      return (
                        <div
                          key={slot.key}
                          className={cn(
                            "rounded-xl border px-3 py-2 min-w-[150px]",
                            slot.changed ? "border-primary/50" : "border-sand-200",
                          )}
                          data-testid="shift-plan-slot"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-sand-900 tabular-nums" dir="ltr">
                              {slot.start}-{hh(end)}
                            </span>
                            {editable && (
                              <button
                                type="button"
                                onClick={() => removeSlot(slot)}
                                title={t("shiftSlots.remove")}
                                aria-label={t("shiftSlots.remove")}
                                className="h-6 w-6 grid place-items-center rounded-pill text-sand-500 hover:bg-sand-100"
                              >
                                <X size={13} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              disabled={!editable}
                              value={slot.value}
                              aria-label={`${zone.name} ${slot.start}`}
                              onChange={(e) =>
                                editSlot(slot.key, {
                                  approvedDrivers: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                                })
                              }
                              title={
                                over
                                  ? t("shiftPlan.overCapacity")
                                  : suggested
                                    ? `${t("shiftPlan.suggestedDrivers")}: ${suggested}`
                                    : t("shiftPlan.noSuggestions")
                              }
                              className={cn(
                                "w-14 h-8 text-center rounded-pill border bg-card tabular-nums",
                                slot.value !== slot.proposed ? "border-primary text-primary font-medium" : "border-sand-200",
                                over && "border-amber-400 bg-amber-50 text-amber-800",
                                !editable && "opacity-60",
                              )}
                            />
                            <select
                              value={slot.durationMinutes}
                              disabled={!editable}
                              aria-label={t("shiftSlots.length")}
                              onChange={(e) => editSlot(slot.key, { durationMinutes: Number(e.target.value) })}
                              className="h-8 px-2 rounded-pill border border-sand-200 bg-card text-xs disabled:opacity-60"
                            >
                              {slotDurations.map((m) => (
                                <option key={m} value={m}>
                                  {t("shiftSlots.hours").replace("{n}", String(m / 60))}
                                </option>
                              ))}
                            </select>
                          </div>
                          <p className="text-[10px] text-sand-400 mt-1 tabular-nums whitespace-nowrap">
                            {slot.added
                              ? t("shiftSlots.added")
                              : `${t("shiftSlots.proposedN").replace("{n}", String(slot.proposed))} · ${t("shiftPlan.ordersCount").replace("{n}", String(slot.demandOrders))}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {editable && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-sand-600">
                      <label className="inline-flex items-center gap-1.5">
                        {t("shiftSlots.startsAt")}
                        <select
                          value={pick.start}
                          onChange={(e) =>
                            setAdding((prev) => ({ ...prev, [zone.id]: { ...pick, start: Number(e.target.value) } }))
                          }
                          className="h-8 px-2 rounded-pill border border-sand-200 bg-card text-xs tabular-nums"
                        >
                          {HOURS.map((h) => (
                            <option key={h} value={h}>
                              {hh(h)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="inline-flex items-center gap-1.5">
                        {t("shiftSlots.length")}
                        <select
                          value={pick.minutes}
                          onChange={(e) =>
                            setAdding((prev) => ({ ...prev, [zone.id]: { ...pick, minutes: Number(e.target.value) } }))
                          }
                          className="h-8 px-2 rounded-pill border border-sand-200 bg-card text-xs"
                        >
                          {slotDurations.map((m) => (
                            <option key={m} value={m}>
                              {t("shiftSlots.hours").replace("{n}", String(m / 60))}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => addSlot(zone.id)}
                        data-testid="shift-plan-add-slot"
                        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-pill border border-sand-200 text-sand-700 hover:bg-sand-50"
                      >
                        <Plus size={13} aria-hidden="true" />
                        {t("shiftSlots.addSlot")}
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      <ConfirmModal
        open={rebuildOpen}
        title={t("shiftPlan.rebuildTitle")}
        message={t("shiftPlan.rebuildConfirm")}
        confirmLabel={t("shiftPlan.rebuildAction")}
        variant="warning"
        loading={generateMutation.isPending}
        onConfirm={() => generateMutation.mutate({ replaceApproved: true })}
        onCancel={() => setRebuildOpen(false)}
      />
    </div>
  );
}
