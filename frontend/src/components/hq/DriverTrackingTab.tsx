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
import { ArrowDown, ArrowUp, CircleCheck, CircleX, GraduationCap, Search, Snowflake, Sun, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import ConfirmModal from "@/components/shared/ConfirmModal";
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

/**
 * Revision 21 (#1): "should be able to filter" every metric column, not just
 * company, area and window. The list already arrives whole (one request, up
 * to a thousand rows), so filtering and sorting happen here, on what is on
 * screen, and every choice is a plain predicate over the row.
 */
type MetricKey =
  | "delivered"
  | "onTime"
  | "acceptance"
  | "rating"
  | "documents"
  | "violations"
  | "rejections";

type SortKey = "name" | MetricKey | "lastSeen";

interface MetricOption {
  value: string;
  label: string;
  test: (row: DriverTrackingRow) => boolean;
}

/** The sortable value behind a column. Absent sorts last whichever way. */
function sortValue(row: DriverTrackingRow, key: SortKey): number | string | null {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "delivered":
      return row.delivered;
    case "onTime":
      return row.onTimeRate;
    case "acceptance":
      return row.acceptanceRate;
    case "rating":
      return row.rating;
    case "documents":
      return row.docsValid;
    case "violations":
      return row.violations;
    case "rejections":
      return row.rejections;
    case "lastSeen":
      return row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : null;
  }
}

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

/**
 * Client note of 2026-10-05: "should have a filter for the status of the
 * driver active/frozen/in training/terminated". The buckets follow the same
 * precedence StateBadge draws (training, then frozen, then status), so a row
 * always lands in the bucket whose badge it shows.
 */
type StateFilter = "" | "ACTIVE" | "FROZEN" | "TRAINING" | "INACTIVE" | "SUSPENDED" | "TERMINATED";

function stateBucket(row: DriverTrackingRow): Exclude<StateFilter, ""> {
  if (row.status === "TERMINATED") return "TERMINATED";
  if (row.inTraining) return "TRAINING";
  if (row.isFrozen) return "FROZEN";
  if (row.status === "ACTIVE") return "ACTIVE";
  if (row.status === "SUSPENDED") return "SUSPENDED";
  return "INACTIVE";
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
      : row.status === "SUSPENDED" || row.status === "TERMINATED"
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
  const [stateFilter, setStateFilter] = useState<StateFilter>("");
  /** One chosen option per metric column; "" is "any". */
  const [metric, setMetric] = useState<Partial<Record<MetricKey, string>>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  // Which driver a modal is open for, and which of the two modals it is. Both
  // need a reason, and a freeze with no reason is the support call this screen
  // exists to remove.
  const [freezing, setFreezing] = useState<DriverTrackingRow | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [training, setTraining] = useState<DriverTrackingRow | null>(null);
  const [periodDays, setPeriodDays] = useState(1);
  const [trainingReason, setTrainingReason] = useState("");

  const trackingQuery = useQuery({
    queryKey: ["darb", "driver-tracking", days, q, fleetPartnerId, zoneId, stateFilter === "TERMINATED"],
    queryFn: () =>
      driverTrackingApi.list({
        days,
        // Terminated drivers are left out of the list unless asked for, so
        // the everyday view stays the people who can still work.
        ...(stateFilter === "TERMINATED" ? { status: "TERMINATED" } : {}),
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

  const allRows = useMemo(() => trackingQuery.data?.rows ?? [], [trackingQuery.data]);
  const fleets = useMemo(() => unwrapList<FleetProfile>(fleetsQuery.data), [fleetsQuery.data]);
  const zones = useMemo(() => unwrapList<DeliveryZone>(zonesQuery.data), [zonesQuery.data]);

  // The filter vocabulary. Rates share one ladder (the same thresholds the
  // cell colours use, so "below 70%" is exactly the red rows), counts share
  // another, and "not rated yet" is its own answer because a new joiner with
  // no offers is not a driver with 0% acceptance.
  const metricFilters = useMemo<Array<{ key: MetricKey; label: string; options: MetricOption[] }>>(() => {
    const any = t("driverTracking.filterAny");
    const none = t("driverTracking.filterNone");
    const atLeast = (n: number) => t("driverTracking.filterAtLeast").replace("{n}", String(n));
    const below = (n: string) => t("driverTracking.filterBelow").replace("{n}", n);
    const between = (a: string, b: string) =>
      t("driverTracking.filterBetween").replace("{a}", a).replace("{b}", b);
    const notRated = t("driverTracking.filterNotRated");

    const rate = (pick: (r: DriverTrackingRow) => number | null): MetricOption[] => [
      { value: "", label: any, test: () => true },
      { value: "lt70", label: below("70%"), test: (r) => pick(r) !== null && pick(r)! < 0.7 },
      { value: "lt85", label: below("85%"), test: (r) => pick(r) !== null && pick(r)! < 0.85 },
      { value: "ge85", label: atLeast(85).replace("85", "85%"), test: (r) => pick(r) !== null && pick(r)! >= 0.85 },
      { value: "na", label: notRated, test: (r) => pick(r) === null },
    ];
    const count = (pick: (r: DriverTrackingRow) => number, steps: [number, number]): MetricOption[] => [
      { value: "", label: any, test: () => true },
      { value: "0", label: none, test: (r) => pick(r) === 0 },
      { value: `ge${steps[0]}`, label: atLeast(steps[0]), test: (r) => pick(r) >= steps[0] },
      { value: `ge${steps[1]}`, label: atLeast(steps[1]), test: (r) => pick(r) >= steps[1] },
    ];

    return [
      {
        key: "delivered",
        label: t("driverTracking.delivered"),
        options: [
          { value: "", label: any, test: () => true },
          { value: "0", label: none, test: (r) => r.delivered === 0 },
          { value: "1-9", label: between("1", "9"), test: (r) => r.delivered >= 1 && r.delivered <= 9 },
          { value: "ge10", label: atLeast(10), test: (r) => r.delivered >= 10 },
          { value: "ge50", label: atLeast(50), test: (r) => r.delivered >= 50 },
        ],
      },
      { key: "onTime", label: t("driverTracking.onTime"), options: rate((r) => r.onTimeRate) },
      { key: "acceptance", label: t("driverTracking.acceptance"), options: rate((r) => r.acceptanceRate) },
      {
        key: "rating",
        label: t("driverTracking.rating"),
        options: [
          { value: "", label: any, test: () => true },
          { value: "lt3", label: below("3"), test: (r) => r.rating !== null && r.rating < 3 },
          { value: "3-4", label: between("3", "4"), test: (r) => r.rating !== null && r.rating >= 3 && r.rating < 4 },
          { value: "ge4", label: atLeast(4), test: (r) => r.rating !== null && r.rating >= 4 },
          { value: "na", label: notRated, test: (r) => r.rating === null },
        ],
      },
      {
        key: "documents",
        label: t("driverTracking.documents"),
        options: [
          { value: "", label: any, test: () => true },
          { value: "ok", label: t("driverTracking.docsComplete"), test: (r) => r.docsValid >= r.docsRequired },
          { value: "gap", label: t("driverTracking.docsMissing"), test: (r) => r.docsValid < r.docsRequired },
        ],
      },
      { key: "violations", label: t("driverTracking.violations"), options: count((r) => r.violations, [1, 3]) },
      { key: "rejections", label: t("driverTracking.rejections"), options: count((r) => r.rejections, [1, 5]) },
    ];
  }, [t]);

  const rows = useMemo(() => {
    const active = metricFilters
      .map((f) => f.options.find((o) => o.value === (metric[f.key] ?? "")) ?? f.options[0]!)
      .filter((o) => o.value !== "");
    const kept = allRows.filter(
      (r) => (!stateFilter || stateBucket(r) === stateFilter) && active.every((o) => o.test(r)),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...kept].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      // Absent goes to the bottom in both directions, so "sort by rating"
      // never opens on a page of n/a.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [allRows, metricFilters, metric, sort, stateFilter]);

  const filtersActive = Object.values(metric).some(Boolean) || !!stateFilter;

  function toggleSort(key: SortKey) {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : // Numbers open worst-first for rates and most-first for counts;
          // names open A to Z.
          { key, dir: key === "name" ? "asc" : key === "onTime" || key === "acceptance" || key === "rating" || key === "documents" ? "asc" : "desc" },
    );
  }

  // A render helper rather than a nested component: a component declared
  // inside render is a new type every pass and React would remount the header.
  function sortableTh(k: SortKey, label: string, align: "start" | "end" = "end", hint?: string) {
    const on = sort.key === k;
    return (
      <th key={k} className={cn("font-medium px-4 py-3", align === "end" ? "text-end" : "text-start")}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          title={hint ?? t("driverTracking.sortHint")}
          className={cn(
            "inline-flex items-center gap-1 hover:text-sand-900",
            on && "text-sand-900",
          )}
        >
          {label}
          {on &&
            (sort.dir === "asc" ? (
              <ArrowUp size={12} aria-hidden="true" />
            ) : (
              <ArrowDown size={12} aria-hidden="true" />
            ))}
        </button>
      </th>
    );
  }

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

  // Revision 21c (client note, 2026-09-21): "must be able to finish training
  // from this subtab". A driver in training showed nothing here but Freeze:
  // Activate was hidden because the server refuses it past an open window,
  // and the verbs that close the window lived on another tab. Pass and Did
  // not pass sit on the row now, and passing is what activates.
  const [finishing, setFinishing] = useState<{ row: DriverTrackingRow; outcome: "PASSED" | "FAILED" } | null>(null);
  const finishMutation = useMutation({
    mutationFn: ({ sessionId, outcome }: { sessionId: string; outcome: "PASSED" | "FAILED" }) =>
      driverTrainingApi.complete(sessionId, outcome),
    onSuccess: () => {
      toast.success(t("driverTracking.trainingFinished"));
      setFinishing(null);
      invalidate();
    },
    onError: (err: unknown) => {
      const payload = (err as { response?: { data?: { error?: string } } })?.response?.data;
      toast.error(payload?.error ?? t("errors.savingData"));
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

      {/* ── Per-column filters (revision 21 #1) ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2" data-testid="driver-metric-filters">
        <span className="text-sm text-sand-600">{t("driverTracking.filterBy")}</span>
        <select
          aria-label={t("driverTracking.state")}
          data-testid="driver-state-filter"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as StateFilter)}
          className={cn(
            "h-8 px-2 rounded-pill border bg-card text-xs",
            stateFilter ? "border-primary text-primary font-medium" : "border-sand-200 text-sand-700",
          )}
        >
          {(
            [
              ["", t("driverTracking.filterAny")],
              ["ACTIVE", t("driverTracking.stateActive")],
              ["FROZEN", t("driverTracking.frozen")],
              ["TRAINING", t("driverTracking.inTraining")],
              ["INACTIVE", t("driverTracking.stateInactive")],
              ["SUSPENDED", t("driverTracking.stateSuspended")],
              ["TERMINATED", t("driverTracking.stateTerminated")],
            ] as Array<[StateFilter, string]>
          ).map(([v, label]) => (
            <option key={v} value={v}>{`${t("driverTracking.state")}: ${label}`}</option>
          ))}
        </select>
        {metricFilters.map((f) => {
          const chosen = metric[f.key] ?? "";
          return (
            <select
              key={f.key}
              aria-label={f.label}
              value={chosen}
              onChange={(e) => setMetric((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className={cn(
                "h-8 px-2 rounded-pill border bg-card text-xs",
                chosen ? "border-primary text-primary font-medium" : "border-sand-200 text-sand-700",
              )}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {`${f.label}: ${o.label}`}
                </option>
              ))}
            </select>
          );
        })}
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setMetric({});
              setStateFilter("");
            }}
            className="h-8 px-3 rounded-pill text-xs text-sand-600 hover:bg-sand-100"
          >
            {t("driverTracking.clearFilters")}
          </button>
        )}
        <span className="text-xs text-sand-500 tabular-nums ms-auto">
          {t("driverTracking.matching")
            .replace("{n}", formatNumber(rows.length, locale))
            .replace("{total}", formatNumber(allRows.length, locale))}
        </span>
      </div>

      {/* ── The table ───────────────────────────────────────────────────── */}
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand-50 text-sand-600">
              <tr>
                {sortableTh("name", t("driverTracking.driver"), "start")}
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.company")}</th>
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.area")}</th>
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.state")}</th>
                {sortableTh("delivered", t("driverTracking.delivered"))}
                {sortableTh("onTime", t("driverTracking.onTime"))}
                {sortableTh("acceptance", t("driverTracking.acceptance"))}
                {sortableTh("rejections", t("driverTracking.rejections"), "end", t("driverTracking.rejectionsHint"))}
                {sortableTh("violations", t("driverTracking.violations"), "end", t("driverTracking.violationsHint"))}
                {sortableTh("rating", t("driverTracking.rating"))}
                {sortableTh("documents", t("driverTracking.documents"))}
                {sortableTh("lastSeen", t("driverTracking.lastSeen"), "start")}
                {canEdit && (
                  <th className="text-end font-medium px-4 py-3">{t("driverTracking.actions")}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 13 : 12} className="px-4 py-10 text-center text-sand-500">
                    {t("driverTracking.empty")}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-sand-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/drivers/${row.id}`} className="font-medium text-sand-900 hover:underline">
                      {row.name}
                    </Link>
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
                  <td
                    className={cn(
                      "px-4 py-3 text-end tabular-nums",
                      row.rejections >= 5 ? "text-red-600 font-medium" : row.rejections > 0 ? "text-amber-600" : "text-sand-900",
                    )}
                    title={t("driverTracking.rejectionsHint")}
                  >
                    {formatNumber(row.rejections, locale)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-end tabular-nums",
                      row.violationsOpen > 0 ? "text-red-600 font-medium" : row.violations > 0 ? "text-amber-600" : "text-sand-900",
                    )}
                    title={t("driverTracking.violationsHint")}
                  >
                    {formatNumber(row.violations, locale)}
                    {row.violationsOpen > 0 && (
                      <span className="block text-[10px] font-normal text-red-600">
                        {t("driverTracking.openIssues").replace("{n}", formatNumber(row.violationsOpen, locale))}
                      </span>
                    )}
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
                        {row.inTraining && row.trainingSessionId && (
                          <>
                            <button
                              type="button"
                              data-testid="tracking-pass-training"
                              title={t("driverTracking.passTraining")}
                              onClick={() => setFinishing({ row, outcome: "PASSED" })}
                              className="h-8 w-8 rounded-pill grid place-items-center text-forest-700 hover:bg-forest-50"
                            >
                              <CircleCheck size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              title={t("driverTracking.failTraining")}
                              onClick={() => setFinishing({ row, outcome: "FAILED" })}
                              className="h-8 w-8 rounded-pill grid place-items-center text-red-600 hover:bg-red-50"
                            >
                              <CircleX size={15} aria-hidden="true" />
                            </button>
                          </>
                        )}
                        {/* A flag with no open window behind it is cleared by
                            Activate itself, so the button shows for it. */}
                        {row.status !== "ACTIVE" && !(row.inTraining && row.trainingSessionId) && (
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
                        {/* A terminated driver only offers Activate, to take them back on. */}
                        {row.status === "TERMINATED" ? null : row.isFrozen ? (
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
                        {!row.inTraining && row.status !== "TERMINATED" && (
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

      {/* ── Finish training from this row ───────────────────────────────── */}
      <ConfirmModal
        open={finishing !== null}
        title={t("driverTracking.finishTrainingTitle").replace("{name}", finishing?.row.name ?? "")}
        message={t(
          finishing?.outcome === "PASSED"
            ? "driverTracking.passTrainingConfirm"
            : "driverTracking.failTrainingConfirm",
        )}
        confirmLabel={t(finishing?.outcome === "PASSED" ? "driverTracking.passTraining" : "driverTracking.failTraining")}
        variant={finishing?.outcome === "PASSED" ? "default" : "warning"}
        loading={finishMutation.isPending}
        onConfirm={() => {
          if (!finishing?.row.trainingSessionId) return;
          finishMutation.mutate({ sessionId: finishing.row.trainingSessionId, outcome: finishing.outcome });
        }}
        onCancel={() => setFinishing(null)}
      />

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
