"use client";
// Revision 24 (#8, #9) — private shifts, planned by Darb (Ops › Shift
// planning › Private shifts) or by the shop itself (merchant portal).
//
// Client note (#8): "we should be able to enter the number of private shifts
// needed, after that the system allocates which time to propose the shifts".
// (#9): "the vendor should be able to put the number of shifts needed for
// each branch, after which the allocating function would propose a plan for
// him and he can adjust it."
//
// So the screen is: ask (branch, day, vehicle, how many, how long), look at
// what the system proposed against the branch's own busy hours, move the
// times, confirm. Confirming is what opens the shifts to drivers, and the
// button says so, the same discipline as the weekly roster's Approve.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ErrorState from "@/components/shared/ErrorState";
import SlidePanel from "@/components/shared/SlidePanel";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { privateShiftsApi, vendorPrivateShiftsApi, type PlanShiftInput } from "@/lib/privateShiftsApi";
import { unwrapList, vendorApi, vendorsApi } from "@/lib/darbApi";
import type { PrivateShift, PrivateShiftPlan, VehicleType } from "@/types/privateShifts";
import { VEHICLE_TYPES, kuwaitClock, kuwaitToday, shiftHours } from "@/types/privateShifts";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatNumber } from "@/i18n/format";
import { cn } from "@/lib/cn";
import PrivateShiftDetailBody from "./PrivateShiftDetailBody";
import PrivateShiftStatusPill from "./PrivateShiftStatusPill";

type Mode = "staff" | "vendor";

function errorText(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const HOUR_CHOICES = [2, 3, 4, 5, 6, 8, 10, 12];

export default function PrivateShiftsPanel({ mode, canPlan }: { mode: Mode; canPlan: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const api = mode === "staff" ? privateShiftsApi : vendorPrivateShiftsApi;

  const [date, setDate] = useState(() => kuwaitToday());
  const [planOpen, setPlanOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PrivateShift | null>(null);

  const listQuery = useQuery({
    queryKey: ["darb", "private-shifts", mode, date],
    queryFn: () => api.list({ from: date, to: date }),
    refetchInterval: 60_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["darb", "private-shifts"] });

  const detailQuery = useQuery({
    queryKey: ["darb", "private-shift", mode, detailId],
    queryFn: () => api.detail(detailId!),
    enabled: !!detailId,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancel(id),
    onSuccess: () => {
      toast.success(t("privateShifts.cancelled"));
      setCancelTarget(null);
      void refresh();
    },
    onError: (err) => toast.error(errorText(err, t("errors.savingData"))),
  });

  if (listQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={6} />;
  if (listQuery.error) {
    return <ErrorState error={errorText(listQuery.error, t("errors.loadingData"))} onRetry={() => listQuery.refetch()} />;
  }
  const shifts = listQuery.data?.data ?? [];
  const drafts = listQuery.data?.drafts ?? [];

  return (
    <div className="space-y-4" data-testid="private-shifts-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-sand-900">{t("privateShifts.title")}</h2>
          <p className="text-sm text-sand-600 mt-1 max-w-2xl">
            {t(mode === "staff" ? "privateShifts.subtitleStaff" : "privateShifts.subtitleVendor")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDate((d) => addDays(d, -1))}
            title={t("privateShifts.prevDay")}
            className="h-9 w-9 rounded-pill grid place-items-center border border-sand-200 text-sand-600 hover:bg-sand-50"
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <label className="h-9 px-3 inline-flex items-center rounded-pill bg-sand-100 text-sm text-sand-900">
            <CalendarDays size={14} className="me-2 text-sand-500" aria-hidden="true" />
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label={t("privateShifts.day")}
              className="bg-transparent tabular-nums"
              dir="ltr"
            />
          </label>
          <button
            type="button"
            onClick={() => setDate((d) => addDays(d, 1))}
            title={t("privateShifts.nextDay")}
            className="h-9 w-9 rounded-pill grid place-items-center border border-sand-200 text-sand-600 hover:bg-sand-50"
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
          {canPlan && (
            <button
              type="button"
              data-testid="private-shifts-plan"
              onClick={() => setPlanOpen(true)}
              className="ms-2 h-9 px-4 inline-flex items-center gap-2 rounded-pill bg-primary text-white text-sm font-medium"
            >
              <Sparkles size={14} aria-hidden="true" />
              {t("privateShifts.planShifts")}
            </button>
          )}
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <p className="text-sm font-medium text-amber-900">{t("privateShifts.draftsTitle")}</p>
          <ul className="mt-1 space-y-1">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-amber-900 tabular-nums">
                  {d.date} · {t(`privateShifts.vehicle_${d.vehicleType}`)} ·{" "}
                  {t("privateShifts.shiftsCount").replace("{n}", formatNumber(d.requestedShifts, locale))}
                  {mode === "staff" && d.source === "VENDOR" ? ` · ${t("privateShifts.fromShop")}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setDraftId(d.id)}
                  className="h-8 px-3 rounded-pill bg-white border border-amber-300 text-xs text-amber-900"
                >
                  {t("privateShifts.openDraft")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand-50 text-sand-600">
              <tr>
                <th className="text-start font-medium px-4 py-3">{t("privateShifts.time")}</th>
                {mode === "staff" && <th className="text-start font-medium px-4 py-3">{t("privateShifts.shop")}</th>}
                <th className="text-start font-medium px-4 py-3">{t("privateShifts.branch")}</th>
                <th className="text-start font-medium px-4 py-3">{t("privateShifts.vehicle")}</th>
                <th className="text-start font-medium px-4 py-3">{t("privateShifts.status")}</th>
                <th className="text-start font-medium px-4 py-3">{t("privateShifts.driver")}</th>
                <th className="text-end font-medium px-4 py-3">{t("privateShifts.vendorCharge")}</th>
                {mode === "staff" && <th className="text-end font-medium px-4 py-3">{t("privateShifts.fleetPay")}</th>}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {shifts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sand-500">
                    {t("privateShifts.noneOnDay")}
                  </td>
                </tr>
              )}
              {shifts.map((s) => (
                <tr key={s.id} className="hover:bg-sand-50/60">
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap" dir="ltr">
                    {kuwaitClock(s.startAt)} - {kuwaitClock(s.endAt)}
                  </td>
                  {mode === "staff" && <td className="px-4 py-2">{s.vendor?.name ?? "n/a"}</td>}
                  <td className="px-4 py-2">{s.branch?.name ?? "n/a"}</td>
                  <td className="px-4 py-2">{t(`privateShifts.vehicle_${s.vehicleType}`)}</td>
                  <td className="px-4 py-2"><PrivateShiftStatusPill status={s.status} /></td>
                  <td className="px-4 py-2">{s.driver?.name ?? "n/a"}</td>
                  <td className="px-4 py-2 text-end tabular-nums" dir="ltr">
                    {s.vendorChargeKwd ? formatKwd(s.vendorChargeKwd, locale) : "n/a"}
                  </td>
                  {mode === "staff" && (
                    <td className="px-4 py-2 text-end tabular-nums" dir="ltr">
                      {s.fleetPayKwd ? formatKwd(s.fleetPayKwd, locale) : "n/a"}
                    </td>
                  )}
                  <td className="px-4 py-2 text-end whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setDetailId(s.id)}
                      className="h-8 px-3 rounded-pill border border-sand-200 text-xs text-sand-700 hover:bg-sand-50"
                    >
                      {t("common.view")}
                    </button>
                    {canPlan && (s.status === "OPEN" || s.status === "BOOKED") && (
                      <button
                        type="button"
                        onClick={() => setCancelTarget(s)}
                        className="ms-1 h-8 px-3 rounded-pill text-xs text-red-700 hover:bg-red-50"
                      >
                        {t("privateShifts.cancelShift")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {planOpen && (
        <NewPlanPanel
          mode={mode}
          defaultDate={date}
          onClose={() => setPlanOpen(false)}
          onCreated={(plan) => {
            setPlanOpen(false);
            setDraftId(plan.id);
            void refresh();
          }}
        />
      )}
      {draftId && (
        <DraftPlanPanel
          mode={mode}
          planId={draftId}
          onClose={() => setDraftId(null)}
          onDone={(planDate) => {
            setDraftId(null);
            if (planDate) setDate(planDate);
            void refresh();
          }}
        />
      )}

      <SlidePanel
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={t("privateShifts.detailTitle")}
      >
        {detailQuery.data ? (
          <PrivateShiftDetailBody
            shift={detailQuery.data}
            showVendorCharge
            showFleetPay={mode === "staff"}
          />
        ) : (
          <p className="text-sm text-sand-500">{t("common.loading")}</p>
        )}
      </SlidePanel>

      <ConfirmModal
        open={!!cancelTarget}
        title={t("privateShifts.cancelTitle")}
        message={t("privateShifts.cancelConfirm")}
        confirmLabel={t("privateShifts.cancelShift")}
        variant="warning"
        loading={cancelMutation.isPending}
        onConfirm={() => {
          if (cancelTarget) cancelMutation.mutate(cancelTarget.id);
        }}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}

// ─── Ask for shifts ─────────────────────────────────────────────────────────

function NewPlanPanel({
  mode,
  defaultDate,
  onClose,
  onCreated,
}: {
  mode: Mode;
  defaultDate: string;
  onClose: () => void;
  onCreated: (plan: PrivateShiftPlan) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [vendorId, setVendorId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType | "">("");
  const [date, setDate] = useState(defaultDate < kuwaitToday() ? kuwaitToday() : defaultDate);
  const [count, setCount] = useState(2);
  const [hours, setHours] = useState(4);

  // Staff pick the shop first; the shop's own portal already is one.
  const vendorsQuery = useQuery({
    queryKey: ["darb", "vendors", "private-shift-picker"],
    queryFn: () => vendorsApi.list({ limit: 100 }),
    enabled: mode === "staff",
  });
  const vendors = unwrapList(vendorsQuery.data);

  const branchesQuery = useQuery({
    queryKey: ["darb", "private-shift-branches", mode, vendorId],
    queryFn: async () =>
      mode === "staff" ? unwrapList(await vendorsApi.listBranches(vendorId)) : ((await vendorApi.me()).branches ?? []),
    enabled: mode === "vendor" || !!vendorId,
  });
  const branches = branchesQuery.data ?? [];

  const suitableQuery = useQuery({
    queryKey: ["darb", "private-shift-suitable", mode, vendorId],
    queryFn: async () =>
      mode === "staff"
        ? (await privateShiftsApi.vendorPlans(vendorId)).suitableVehicleTypes
        : (await vendorPrivateShiftsApi.list({ from: kuwaitToday(), to: kuwaitToday() })).suitableVehicleTypes,
    enabled: mode === "vendor" || !!vendorId,
  });
  const suitable = suitableQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => {
      const body = { branchId, vehicleType: vehicleType as VehicleType, date, count, hours };
      return mode === "staff"
        ? privateShiftsApi.createPlan({ ...body, vendorId })
        : vendorPrivateShiftsApi.createPlan(body);
    },
    onSuccess: onCreated,
    onError: (err) => toast.error(errorText(err, t("errors.savingData"))),
  });

  const ready = (mode === "vendor" || !!vendorId) && !!branchId && !!vehicleType && count > 0;
  const field = "w-full h-10 px-3 rounded-xl bg-white border border-sand-300 text-sm";

  return (
    <SlidePanel open onClose={onClose} title={t("privateShifts.planShifts")} subtitle={t("privateShifts.planHint")}>
      <div className="space-y-4">
        {mode === "staff" && (
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5">{t("privateShifts.shop")}</label>
            <select
              className={field}
              value={vendorId}
              onChange={(e) => {
                setVendorId(e.target.value);
                setBranchId("");
                setVehicleType("");
              }}
              data-testid="private-plan-vendor"
            >
              <option value="">{t("privateShifts.choose")}</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-sand-700 mb-1.5">{t("privateShifts.branch")}</label>
          <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="private-plan-branch">
            <option value="">{t("privateShifts.choose")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-sand-700 mb-1.5">{t("privateShifts.vehicle")}</label>
          {suitableQuery.isSuccess && suitable.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              {t(mode === "staff" ? "privateShifts.noVehiclesStaff" : "privateShifts.noVehiclesVendor")}
            </p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {VEHICLE_TYPES.filter((v) => suitable.includes(v)).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVehicleType(v)}
                  className={cn(
                    "h-9 px-4 rounded-pill border text-sm",
                    vehicleType === v ? "border-primary bg-primary/10 text-primary font-medium" : "border-sand-200 text-sand-700",
                  )}
                >
                  {t(`privateShifts.vehicle_${v}`)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5">{t("privateShifts.day")}</label>
            <input type="date" className={field} value={date} min={kuwaitToday()} onChange={(e) => setDate(e.target.value)} dir="ltr" />
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5">{t("privateShifts.howMany")}</label>
            <input
              type="number"
              min={1}
              max={20}
              className={field}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              data-testid="private-plan-count"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5">{t("privateShifts.hoursEach")}</label>
            <select className={field} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {HOUR_CHOICES.map((h) => (
                <option key={h} value={h}>{t("privateShifts.hoursN").replace("{n}", String(h))}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          disabled={!ready || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="h-10 px-5 inline-flex items-center gap-2 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          data-testid="private-plan-propose"
        >
          <Sparkles size={15} aria-hidden="true" />
          {t("privateShifts.propose")}
        </button>
      </div>
    </SlidePanel>
  );
}

// ─── Adjust and confirm ─────────────────────────────────────────────────────

function DraftPlanPanel({
  mode,
  planId,
  onClose,
  onDone,
}: {
  mode: Mode;
  planId: string;
  onClose: () => void;
  onDone: (date?: string) => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const api = mode === "staff" ? privateShiftsApi : vendorPrivateShiftsApi;
  const [rows, setRows] = useState<PlanShiftInput[] | null>(null);

  const planQuery = useQuery({
    queryKey: ["darb", "private-shift-plan", mode, planId],
    queryFn: () => api.plan(planId),
  });
  const plan = planQuery.data;
  const stored = useMemo<PlanShiftInput[]>(
    () => (plan?.shifts ?? []).map((s) => ({ startTime: kuwaitClock(s.startAt), hours: shiftHours(s) })),
    [plan],
  );
  const current = rows ?? stored;
  const dirty = rows !== null;
  const hourly = plan?.basis?.hourly ?? [];
  const peak = Math.max(1, ...hourly);

  const save = async () => {
    if (dirty) await api.savePlan(planId, current);
  };
  const confirmMutation = useMutation({
    mutationFn: async () => {
      await save();
      return api.confirmPlan(planId);
    },
    onSuccess: () => {
      toast.success(t("privateShifts.confirmed"));
      onDone(plan?.date);
    },
    onError: (err) => toast.error(errorText(err, t("errors.savingData"))),
  });
  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success(t("privateShifts.saved"));
      setRows(null);
      void planQuery.refetch();
    },
    onError: (err) => toast.error(errorText(err, t("errors.savingData"))),
  });
  const discardMutation = useMutation({
    mutationFn: () => api.discardPlan(planId),
    onSuccess: () => onDone(),
    onError: (err) => toast.error(errorText(err, t("errors.savingData"))),
  });

  const update = (i: number, patch: Partial<PlanShiftInput>) =>
    setRows(current.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const field = "h-9 px-3 rounded-xl bg-white border border-sand-300 text-sm tabular-nums";
  const draft = plan?.status === "DRAFT";

  return (
    <SlidePanel open onClose={onClose} wide title={t("privateShifts.draftTitle")} subtitle={t("privateShifts.draftHint")}>
      {!plan ? (
        <p className="text-sm text-sand-500">{t("common.loading")}</p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-sand-700">
            {plan.date} · {t(`privateShifts.vehicle_${plan.vehicleType}`)}
          </p>

          {/* The working, so a planner can argue with it: the branch's own
              orders by hour, with the proposed shifts drawn over them. */}
          <section>
            <p className="text-xs text-sand-500 mb-2">
              {plan.basis?.usedDefaultProfile
                ? t("privateShifts.basisDefault")
                : t("privateShifts.basisOrders")
                    .replace("{n}", formatNumber(plan.basis?.ordersSampled ?? 0, locale))
                    .replace("{weeks}", String(plan.basis?.lookbackWeeks ?? 4))}
            </p>
            <div className="flex items-end gap-0.5 h-20" dir="ltr" data-testid="private-plan-demand">
              {Array.from({ length: 24 }, (_, h) => {
                const covered = current.some((r) => {
                  const start = Number(r.startTime.slice(0, 2));
                  return h >= start && h < start + r.hours;
                });
                return (
                  <div key={h} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      className={cn("w-full rounded-t", covered ? "bg-primary/70" : "bg-sand-300")}
                      style={{ height: `${Math.max(4, ((hourly[h] ?? 0) / peak) * 100)}%` }}
                      title={`${String(h).padStart(2, "0")}:00 · ${hourly[h] ?? 0}`}
                    />
                    {h % 3 === 0 && <span className="text-[9px] text-sand-400 mt-0.5">{h}</span>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            {current.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-sand-500 w-16">{t("privateShifts.shiftN").replace("{n}", String(i + 1))}</span>
                <input
                  type="time"
                  step={1800}
                  disabled={!draft}
                  value={r.startTime}
                  onChange={(e) => update(i, { startTime: e.target.value })}
                  className={field}
                  dir="ltr"
                  aria-label={t("privateShifts.startTime")}
                />
                <select
                  disabled={!draft}
                  value={r.hours}
                  onChange={(e) => update(i, { hours: Number(e.target.value) })}
                  className={field}
                  aria-label={t("privateShifts.hoursEach")}
                >
                  {HOUR_CHOICES.map((h) => (
                    <option key={h} value={h}>{t("privateShifts.hoursN").replace("{n}", String(h))}</option>
                  ))}
                </select>
                {draft && current.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows(current.filter((_, j) => j !== i))}
                    title={t("privateShifts.removeShift")}
                    className="h-9 w-9 grid place-items-center rounded-pill text-sand-500 hover:bg-sand-100"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {draft && current.length < 20 && (
              <button
                type="button"
                onClick={() => setRows([...current, { startTime: current[current.length - 1]?.startTime ?? "12:00", hours: plan.shiftHours }])}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-pill border border-sand-200 text-sm text-sand-700"
              >
                <Plus size={14} aria-hidden="true" />
                {t("privateShifts.addShift")}
              </button>
            )}
          </section>

          {draft && (
            <>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2">
                {t("privateShifts.confirmWarning")}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate()}
                  className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
                  data-testid="private-plan-confirm"
                >
                  {t("privateShifts.confirm")}
                </button>
                <button
                  type="button"
                  disabled={!dirty || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  className="h-10 px-4 rounded-pill border border-sand-200 text-sm text-sand-700 disabled:opacity-40"
                >
                  {t("privateShifts.saveDraft")}
                </button>
                <button
                  type="button"
                  disabled={discardMutation.isPending}
                  onClick={() => discardMutation.mutate()}
                  className="h-10 px-4 rounded-pill text-sm text-sand-600 hover:bg-sand-100 disabled:opacity-40"
                >
                  {t("privateShifts.discard")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </SlidePanel>
  );
}
