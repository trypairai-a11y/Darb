"use client";
// /shifts — the shift screen, in three tabs.
//
// Today is the live table this page has always been: who started when, straight
// from the driver app. The two new tabs are the client's request of 2026-08-06,
// "in the hq portal we need a place for assigning the zones for the driver and
// to put the maximum number of drivers for each shift".
//
// They are tabs of this page rather than a new rail entry because they are the
// same subject read at two speeds: Coverage and Driver areas are the plan, and
// Today is what happened against it. The rail is deliberately five items and a
// screen nobody opens on a normal day belongs behind Setup, which is where the
// card that links here lives.
//
// Default tab stays Today, so an existing /shifts link opens what it always
// opened. The Setup card points at ?tab=coverage.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Users, Timer } from "lucide-react";
import { useApiGet } from "@/hooks/useApi";
import StatCard from "@/components/shared/StatCard";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/cn";
import { shiftPlanningApi, type ShiftCapacityRow } from "@/lib/darbApi";
import { useI18n } from "@/i18n/I18nProvider";
import { formatTime, formatNumber } from "@/i18n/format";

type Tab = "today" | "coverage" | "areas";

const TABS: Tab[] = ["today", "coverage", "areas"];

/**
 * Index IS the day number the server stores, 0 = Sunday, matching getDay().
 * Kuwait's week runs Sunday to Saturday, so the strip reads in working order.
 */
const WEEKDAY_KEYS = [
  "daySun",
  "dayMon",
  "dayTue",
  "dayWed",
  "dayThu",
  "dayFri",
  "daySat",
] as const;

function isTab(value: string | null): value is Tab {
  return TABS.includes(value as Tab);
}

interface ShiftSession {
  id: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number;
  area: string | null;
  isOnline: boolean;
  availability: string;
}

interface ShiftDriver {
  driverId: string;
  name: string;
  phone: string | null;
  sessions: ShiftSession[];
  totalMinutes: number;
  firstStart: string | null;
  lastEnd: string | null;
  onlineNow: boolean;
}

interface ShiftsResponse {
  date: string;
  summary: { onlineNow: number; driversOnShift: number; totalHours: number };
  drivers: ShiftDriver[];
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "10:00" plus three hours, wrapping so a 22:00 window reads 22:00-01:00. */
function windowLabel(start: string, hours: number): string {
  const [h, m] = start.split(":").map(Number);
  const end = `${String((h + hours) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return `${start}-${end}`;
}

// ── Today: the live table, unchanged ────────────────────────────────────────

function TodayPanel() {
  const { t, locale } = useI18n();
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));

  const { data, loading } = useApiGet<ShiftsResponse>(`/api/drivers/shifts?date=${date}`);
  const drivers = data?.drivers || [];
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label={t("shiftsPage.date")}
          className="px-3 py-2 rounded-xl border border-sand-200 dark:border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t("shiftsPage.onlineNow")}
          value={formatNumber(summary?.onlineNow || 0, locale)}
          icon={Clock}
          highlight={(summary?.onlineNow || 0) > 0}
        />
        <StatCard
          title={t("shiftsPage.driversOnShift")}
          value={formatNumber(summary?.driversOnShift || 0, locale)}
          icon={Users}
        />
        <StatCard
          title={t("shiftsPage.totalHours")}
          value={formatNumber(summary?.totalHours || 0, locale)}
          icon={Timer}
        />
      </div>

      <div className="bg-card border border-sand-200 dark:border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 dark:border-border text-start text-[11px] uppercase tracking-[0.12em] text-sand-600">
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.driver")}</th>
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.start")}</th>
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.finish")}</th>
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.duration")}</th>
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.area")}</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) =>
                driver.sessions.map((session, idx) => (
                  <tr
                    key={session.id}
                    className="border-b border-sand-100 dark:border-border/50 last:border-0 hover:bg-sand-50/60 dark:hover:bg-sand-900/20"
                  >
                    <td className="px-5 py-3">
                      {idx === 0 ? (
                        <div className="min-w-0">
                          <div className="font-medium text-sand-900 dark:text-foreground truncate">
                            {driver.name}
                            {driver.sessions.length > 1 && (
                              <span className="ms-2 text-xs text-sand-500">
                                ({driver.sessions.length} {t("shiftsPage.sessions")})
                              </span>
                            )}
                          </div>
                          {driver.phone && (
                            <div className="text-xs text-sand-500 truncate" dir="ltr">
                              {driver.phone}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sand-400 ps-4">↳</span>
                      )}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-sand-700 dark:text-foreground/80">
                      {formatTime(session.startTime, locale)}
                    </td>
                    <td className="px-5 py-3">
                      {session.isOnline ? (
                        <span className="inline-flex items-center gap-1.5 rounded-pill bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2.5 py-0.5 text-xs font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                          {t("shiftsPage.onlineNowBadge")}
                        </span>
                      ) : (
                        <span className="tabular-nums text-sand-700 dark:text-foreground/80">
                          {session.endTime ? formatTime(session.endTime, locale) : "n/a"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-sand-700 dark:text-foreground/80">
                      {formatDuration(session.durationMinutes)}
                    </td>
                    <td className="px-5 py-3 text-sand-600">{session.area || "n/a"}</td>
                  </tr>
                ))
              )}
              {!loading && drivers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sand-500">
                    {t("shiftsPage.noShifts")}
                  </td>
                </tr>
              )}
              {loading && drivers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sand-400">
                    …
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Coverage: how many drivers each area takes in each window ───────────────

function CoveragePanel() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["darb", "shift-planning"],
    queryFn: () => shiftPlanningApi.get(),
  });

  // An empty string is "no limit" and a 0 is "closed", so the draft holds text
  // rather than numbers: collapsing both onto a number would make one of the
  // two answers impossible to type.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  // Client request, revision 16 (#2): a day is edited on its own, so the grid
  // shows one day at a time rather than growing to 7 x 8 cells per zone. The
  // draft still holds the whole week, so switching days loses nothing.
  const [day, setDay] = useState<number>(() => new Date().getDay());

  const zones = useMemo(() => query.data?.zones ?? [], [query.data]);
  const windows = useMemo(() => query.data?.windows ?? [], [query.data]);
  const hours = query.data?.hours ?? 3;

  useEffect(() => {
    if (!query.data) return;
    const next: Record<string, string> = {};
    for (const row of query.data.capacity) {
      next[`${row.zoneId}|${row.dayOfWeek}|${row.startTime}`] = String(row.maxDrivers);
    }
    setDraft(next);
    setDirty(false);
  }, [query.data]);

  /**
   * Copy the open day across the whole week.
   *
   * Without it, a tenant whose week is the same everywhere has to type the same
   * grid seven times, which is the kind of chore that ends with six days left
   * blank and every window uncapped.
   */
  function copyDayToWeek() {
    setDraft((prev) => {
      const next = { ...prev };
      for (const zone of zones) {
        for (const w of windows) {
          const value = prev[`${zone.id}|${day}|${w}`] ?? "";
          for (let d = 0; d < 7; d += 1) {
            if (d === day) continue;
            next[`${zone.id}|${d}|${w}`] = value;
          }
        }
      }
      return next;
    });
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const rows: ShiftCapacityRow[] = [];
      for (const [key, value] of Object.entries(draft)) {
        const trimmed = value.trim();
        if (trimmed === "") continue;
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n < 0) continue;
        const [zoneId, dayOfWeek, startTime] = key.split("|");
        const d = Number(dayOfWeek);
        if (!Number.isInteger(d) || d < 0 || d > 6) continue;
        rows.push({ zoneId, dayOfWeek: d, startTime, maxDrivers: Math.floor(n) });
      }
      return shiftPlanningApi.saveCapacity(rows);
    },
    onSuccess: () => {
      toast.success(t("shiftsPage.saved"));
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["darb", "shift-planning"] });
    },
    onError: (err: unknown) =>
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      ),
  });

  if (query.isLoading) return <PageSkeleton statCards={0} tableRows={5} tableCols={6} />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-sand-900">{t("shiftsPage.coverageTitle")}</h2>
          <p className="text-xs text-sand-600 mt-1 max-w-2xl">{t("shiftsPage.coverageHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="shift-coverage-copy-week"
            onClick={copyDayToWeek}
            disabled={zones.length === 0}
            className="h-9 px-3 rounded-pill border border-sand-300 bg-card text-xs font-medium text-sand-700 hover:bg-sand-100 disabled:opacity-40 transition-colors"
          >
            {t("shiftsPage.copyToWeek")}
          </button>
          <button
            type="button"
            data-testid="shift-coverage-save"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="h-9 px-4 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-40 transition-colors"
          >
            {save.isPending ? t("shiftsPage.saving") : t("shiftsPage.save")}
          </button>
        </div>
      </div>

      {/* One day at a time. The whole week stays in the draft, so a planner can
          move between days and save once. */}
      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit flex-wrap" data-testid="shift-coverage-days">
        {WEEKDAY_KEYS.map((key, index) => (
          <button
            key={key}
            type="button"
            onClick={() => setDay(index)}
            className={cn(
              "px-3.5 h-8 text-xs font-medium rounded-pill transition-colors",
              day === index ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
            )}
          >
            {t(`shiftsPage.${key}`)}
          </button>
        ))}
      </div>

      {zones.length === 0 ? (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center text-sm text-sand-600">
          {t("shiftsPage.coverageNoZones")}
        </div>
      ) : (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-start text-[11px] uppercase tracking-[0.12em] text-sand-600">
                  <th className="text-start font-medium px-5 py-3">{t("shiftsPage.area")}</th>
                  {windows.map((w) => (
                    <th key={w} className="text-start font-medium px-3 py-3 tabular-nums" dir="ltr">
                      {windowLabel(w, hours)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id} className="border-b border-sand-100 last:border-0">
                    <td className="px-5 py-2.5 font-medium text-sand-900" dir="auto">
                      {zone.name}
                    </td>
                    {windows.map((w) => {
                      const key = `${zone.id}|${day}|${w}`;
                      return (
                        <td key={w} className="px-3 py-2.5">
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={draft[key] ?? ""}
                            aria-label={`${zone.name} ${t(`shiftsPage.${WEEKDAY_KEYS[day]}`)} ${windowLabel(w, hours)}`}
                            onChange={(e) => {
                              setDraft((prev) => ({ ...prev, [key]: e.target.value }));
                              setDirty(true);
                            }}
                            className="w-16 h-8 px-2 rounded-xl border border-sand-300 bg-card text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Driver areas: which zone each driver books in ───────────────────────────

function DriverAreasPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["darb", "shift-planning"],
    queryFn: () => shiftPlanningApi.get(),
  });

  const assign = useMutation({
    mutationFn: ({ id, zoneId }: { id: string; zoneId: string | null }) =>
      shiftPlanningApi.assignZone(id, zoneId),
    onSuccess: () => {
      toast.success(t("shiftsPage.areaSaved"));
      void queryClient.invalidateQueries({ queryKey: ["darb", "shift-planning"] });
    },
    onError: (err: unknown) =>
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      ),
  });

  const zones = query.data?.zones ?? [];
  const drivers = useMemo(() => {
    const all = query.data?.drivers ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.driverCode ?? "").toLowerCase().includes(q) ||
        (d.phone ?? "").includes(q),
    );
  }, [query.data, search]);

  if (query.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={4} />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-sand-900">{t("shiftsPage.areasTitle")}</h2>
          <p className="text-xs text-sand-600 mt-1 max-w-2xl">{t("shiftsPage.areasHint")}</p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("shiftsPage.areasSearch")}
          className="h-9 w-64 px-3 rounded-xl border border-sand-200 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 text-start text-[11px] uppercase tracking-[0.12em] text-sand-600">
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.driver")}</th>
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.company")}</th>
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.area")}</th>
              </tr>
            </thead>
            <tbody data-testid="driver-areas-table">
              {drivers.map((driver) => (
                <tr key={driver.id} className="border-b border-sand-100 last:border-0">
                  <td className="px-5 py-2.5">
                    <div className="font-medium text-sand-900 truncate" dir="auto">
                      {driver.name}
                    </div>
                    <div className="text-xs text-sand-500 tabular-nums" dir="ltr">
                      {driver.driverCode || "n/a"}
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-sand-600" dir="auto">
                    {driver.fleetPartner?.name || "n/a"}
                  </td>
                  <td className="px-5 py-2.5">
                    <select
                      value={driver.assignedZoneId ?? ""}
                      disabled={assign.isPending}
                      aria-label={`${driver.name} ${t("shiftsPage.area")}`}
                      onChange={(e) =>
                        assign.mutate({ id: driver.id, zoneId: e.target.value || null })
                      }
                      className="h-8 min-w-[10rem] px-2 rounded-xl border border-sand-300 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">{t("shiftsPage.notAssigned")}</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-sand-500">
                    {t("shiftsPage.noDrivers")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ShiftsScreen() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get("tab");
    return isTab(requested) ? requested : "today";
  });

  const tabLabels: Record<Tab, string> = {
    today: t("shiftsPage.tabToday"),
    coverage: t("shiftsPage.tabCoverage"),
    areas: t("shiftsPage.tabAreas"),
  };

  return (
    <div className="space-y-6 w-full max-w-none">
      <div>
        <h1 className="text-xl font-semibold">{t("shiftsPage.title")}</h1>
        <p className="text-sm text-secondary mt-1">{t("shiftsPage.subtitle")}</p>
      </div>

      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit flex-wrap">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            data-testid={`shifts-tab-${key}`}
            onClick={() => setTab(key)}
            className={cn(
              "px-4 h-9 text-sm font-medium rounded-pill transition-colors",
              tab === key ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900"
            )}
          >
            {tabLabels[key]}
          </button>
        ))}
      </div>

      {tab === "today" && <TodayPanel />}
      {tab === "coverage" && <CoveragePanel />}
      {tab === "areas" && <DriverAreasPanel />}
    </div>
  );
}

export default function ShiftsPage() {
  // useSearchParams needs a Suspense boundary in the app router, the same shape
  // /finance uses for its own ?tab= deep links.
  return (
    <Suspense fallback={<PageSkeleton statCards={3} tableRows={4} tableCols={5} />}>
      <ShiftsScreen />
    </Suspense>
  );
}
