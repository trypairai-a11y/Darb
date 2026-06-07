"use client";
import { useState, useMemo } from "react";
import { useApiGet } from "@/hooks/useApi";
import FilterBar from "@/components/shared/FilterBar";
import StatCard from "@/components/shared/StatCard";
import SlidePanel from "@/components/shared/SlidePanel";
import { cn } from "@/lib/cn";
import {
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart2,
  CalendarCheck,
  CalendarDays,
  Table2,
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  Phone,
  Flag,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import { formatDate as fmtDate, formatTime } from "@/i18n/format";

const ZONES = ["Hawally", "Salmiya", "Ardiya", "Jahra", "Khiran", "Mishref", "Sabah Al Salem", "Abu Halifa", "Fahaheel", "Mangaf"];

const ZONE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Hawally:          { bg: "bg-blue-50",   text: "text-blue-700",   dot: "bg-blue-400" },
  Salmiya:          { bg: "bg-teal-50",   text: "text-teal-700",   dot: "bg-teal-400" },
  Ardiya:           { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-400" },
  Jahra:            { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400" },
  Khiran:           { bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-400" },
  Mishref:          { bg: "bg-pink-50",   text: "text-pink-700",   dot: "bg-pink-400" },
  "Sabah Al Salem": { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-400" },
  "Abu Halifa":     { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-400" },
  Fahaheel:         { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-400" },
  Mangaf:           { bg: "bg-cyan-50",   text: "text-cyan-700",   dot: "bg-cyan-400" },
};

const DEFAULT_ZONE_COLOR = { bg: "bg-gray-50", text: "text-gray-600", dot: "bg-gray-400" };

function getZoneColor(zone: string | undefined | null) {
  if (!zone) return DEFAULT_ZONE_COLOR;
  return ZONE_COLORS[zone] || DEFAULT_ZONE_COLOR;
}

function isShiftLive(shift: any, slotStart: string, slotEnd: string): boolean {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const shiftDate = shift.date ? shift.date.split("T")[0] : "";
  if (shiftDate !== today) return false;
  let start: Date;
  let end: Date;
  if (shift.scheduledStart) {
    start = new Date(shift.scheduledStart);
    end = shift.scheduledEnd ? new Date(shift.scheduledEnd) : new Date(shift.scheduledStart);
  } else {
    start = new Date(`${today}T${slotStart}:00`);
    end = new Date(`${today}T${slotEnd}:00`);
  }
  return now >= start && now <= end;
}

const KEETA_SLOTS = [
  { id: "s1", label: "04:00 – 08:00", start: "04:00", end: "08:00" },
  { id: "s2", label: "08:00 – 12:00", start: "08:00", end: "12:00" },
  { id: "s3", label: "12:00 – 15:00", start: "12:00", end: "15:00" },
  { id: "s4", label: "15:00 – 19:00", start: "15:00", end: "19:00" },
];

const WEEK_DAYS = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"];

const SHIFT_STATUS_STYLES: Record<string, string> = {
  BOOKED: "bg-blue-50 text-blue-700 border border-blue-100",
  COMPLETED: "bg-green-50 text-green-700 border border-green-100",
  MISSED: "bg-red-50 text-red-600 border border-red-100",
  NO_SHOW: "bg-amber-50 text-amber-700 border border-amber-200",
};

function useShiftStatusLabel() {
  const { t } = useI18n();
  return (status: string): string => {
    switch (status) {
      case "BOOKED": return t("keetaPage.statusBooked");
      case "COMPLETED": return t("keetaPage.statusCompleted");
      case "IN_PROGRESS": return t("keetaPage.statusInProgress");
      case "NOT_BOOKED":
      case "MISSED": return t("keetaPage.statusNotBooked");
      case "NO_SHOW": return t("keetaPage.statusNoShow");
      default: return status;
    }
  };
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const offset = (day - 3 + 7) % 7;
  const wednesday = new Date(d);
  wednesday.setDate(d.getDate() - offset);
  return wednesday;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ShiftValidity({ valid }: { valid: boolean | null }) {
  if (valid === null) return null;
  return valid ? (
    <CheckCircle2 size={12} className="text-green-500 shrink-0" />
  ) : (
    <XCircle size={12} className="text-red-400 shrink-0" />
  );
}

// ─── Table view types ────────────────────────────────────────────────────────
type SortKey = "driverName" | "phone" | "zone" | "booking" | "weeklyBookings" | "bookedHours" | "actualHours" | "actualStart" | "actualEnd";
type SortDir = "asc" | "desc";

export default function KeetaShiftsPage() {
  const { t, locale } = useI18n();
  const shiftStatusLabel = useShiftStatusLabel();
  const [view, setView] = useState<"calendar" | "table">("calendar");
  const [weekStart, setWeekStart] = useState<Date>(getMonday(new Date()));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);

  // Table view state
  const [tableDate, setTableDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const weekEnd = addDays(weekStart, 6);

  // ─── Calendar data ─────────────────────────────────────────────────────────
  const calParams = new URLSearchParams({
    platform: "KEETA",
    dateFrom: formatDate(weekStart),
    dateTo: formatDate(weekEnd),
    limit: "500",
  });
  if (filters.zone) calParams.set("zone", filters.zone);
  if (filters.driver) calParams.set("search", filters.driver);

  const { data: calData, loading: calLoading } = useApiGet<any>(
    view === "calendar" ? `/api/shifts?${calParams}` : null
  );
  const shifts: any[] = calData?.data || [];

  // ─── Table data ────────────────────────────────────────────────────────────
  const tblParams = new URLSearchParams({ platform: "KEETA", date: tableDate });
  if (tableFilters.zone) tblParams.set("zone", tableFilters.zone);
  if (tableFilters.search) tblParams.set("search", tableFilters.search);
  if (tableFilters.bookingFilter) tblParams.set("bookingFilter", tableFilters.bookingFilter);

  const { data: bookingData } = useApiGet<any>(
    view === "table" ? `/api/shifts/booking-status?${tblParams}` : null
  );
  const driverList = bookingData?.drivers || [];
  const totalDrivers = bookingData?.totalDrivers || 0;
  const bookedCount = bookingData?.bookedCount || 0;
  const notBookedCount = bookingData?.notBookedCount || 0;
  const completedCount = bookingData?.completedCount || 0;
  const noShowCount = bookingData?.noShowCount || 0;

  // ─── Calendar helpers ──────────────────────────────────────────────────────
  const weekDates = WEEK_DAYS.map((_, i) => addDays(weekStart, i));

  const shiftMap: Record<string, any[]> = {};
  for (const shift of shifts) {
    const dateStr = shift.date ? shift.date.split("T")[0] : "";
    const slotId = KEETA_SLOTS.find(
      (s) => shift.startTime?.startsWith(s.start) || shift.scheduledStart?.includes(s.start)
    )?.id || "s1";
    const key = `${dateStr}_${slotId}`;
    if (!shiftMap[key]) shiftMap[key] = [];
    shiftMap[key].push(shift);
  }

  const driverDayZones: Record<string, Set<string>> = {};
  for (const shift of shifts) {
    const driverId = shift.driverId || shift.driver?.id;
    const dateStr = shift.date ? shift.date.split("T")[0] : "";
    if (!driverId || !dateStr) continue;
    const ddKey = `${driverId}_${dateStr}`;
    if (!driverDayZones[ddKey]) driverDayZones[ddKey] = new Set();
    const zone = shift.driver?.zone || shift.zone;
    if (zone) driverDayZones[ddKey].add(zone);
  }

  function getDriverDayAreaCount(shift: any): number {
    const driverId = shift.driverId || shift.driver?.id;
    const dateStr = shift.date ? shift.date.split("T")[0] : "";
    if (!driverId || !dateStr) return 0;
    return driverDayZones[`${driverId}_${dateStr}`]?.size || 0;
  }

  const total = shifts.length;
  const calBooked = shifts.filter((s) => s.status === "BOOKED" || s.status === "COMPLETED").length;
  const completed = shifts.filter((s) => s.status === "COMPLETED").length;
  const valid = shifts.filter((s) => s.isValid === true).length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const totalPlanned = shifts.reduce((acc: number, s: any) => acc + (s.plannedHours || 4), 0);
  const totalActual = shifts.reduce((acc: number, s: any) => acc + (s.actualHours || 0), 0);

  // ─── Table helpers ─────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedDrivers = useMemo(() => {
    if (!sortKey) return driverList;
    return [...driverList].sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case "driverName": aVal = a.driverName || ""; bVal = b.driverName || ""; break;
        case "phone": aVal = a.phone || ""; bVal = b.phone || ""; break;
        case "zone": aVal = a.zone || ""; bVal = b.zone || ""; break;
        case "booking": aVal = a.hasBooked ? 1 : 0; bVal = b.hasBooked ? 1 : 0; break;
        case "weeklyBookings": aVal = a.weeklyBookings || 0; bVal = b.weeklyBookings || 0; break;
        case "bookedHours": aVal = a.bookedHours || 0; bVal = b.bookedHours || 0; break;
        case "actualHours": aVal = a.actualHours || 0; bVal = b.actualHours || 0; break;
        case "actualStart": aVal = a.actualStart || ""; bVal = b.actualStart || ""; break;
        case "actualEnd": aVal = a.actualEnd || ""; bVal = b.actualEnd || ""; break;
        default: return 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [driverList, sortKey, sortDir]);

  const SortHeader = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <th
      className="text-start text-xs font-medium text-secondary px-5 py-3 cursor-pointer select-none hover:text-primary transition-colors"
      onClick={() => toggleSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === colKey ? (
          sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ChevronDown size={12} className="opacity-0 group-hover:opacity-30" />
        )}
      </span>
    </th>
  );

  const statusBadge = (status: string) => {
    const label = shiftStatusLabel(status);
    const styles: Record<string, string> = {
      BOOKED: "bg-blue-50 text-blue-700",
      IN_PROGRESS: "bg-cyan-50 text-cyan-700",
      COMPLETED: "bg-green-50 text-green-700",
      MISSED: "bg-red-50 text-red-700",
      NOT_BOOKED: "bg-red-50 text-red-700",
    };
    return (
      <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap", styles[status] || "bg-gray-50 text-gray-600")}>
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-keeta" />
          <h1 className="text-xl font-semibold">{t("keetaPage.shiftsTitle")}</h1>
          <span className="text-sm text-secondary">{t("keetaPage.sidra")}</span>
        </div>
        {/* View Toggle */}
        <div className="flex items-center rounded-xl border border-gray-200 p-0.5">
          <button
            onClick={() => setView("calendar")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              view === "calendar" ? "bg-keeta text-white" : "text-secondary hover:text-foreground"
            )}
          >
            <CalendarDays size={14} />
            {t("keetaPage.calendar")}
          </button>
          <button
            onClick={() => setView("table")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              view === "table" ? "bg-keeta text-white" : "text-secondary hover:text-foreground"
            )}
          >
            <Table2 size={14} />
            {t("keetaPage.tableView")}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TABLE VIEW                                                             */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {view === "table" && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-5 gap-4">
            <StatCard title={t("overview.totalDrivers")} value={totalDrivers} icon={Users} />
            <StatCard
              title={t("talabat.booked")}
              value={bookedCount}
              icon={UserCheck}
              trend={totalDrivers > 0 ? `${Math.round((bookedCount / totalDrivers) * 100)}% ${t("keetaPage.rateSuffix")}` : undefined}
            />
            <StatCard title={t("talabat.notBooked")} value={notBookedCount} icon={UserX} highlight={notBookedCount > 0} />
            <StatCard title={t("keetaPage.completed")} value={completedCount} icon={CheckCircle2} />
            <StatCard title={t("keetaPage.noShow")} value={noShowCount} icon={Flag} highlight={noShowCount > 0} />
          </div>

          {/* Filters */}
          <div className="flex gap-3 flex-wrap items-center">
            <input
              type="date"
              value={tableDate}
              onChange={(e) => setTableDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-keeta/30"
            />
            <FilterBar
              filters={[
                { key: "search", type: "search", label: t("common.search"), placeholder: t("talabatAttendance.searchDriver") },
                {
                  key: "zone", type: "select", label: t("keetaPage.allZones"),
                  options: ZONES.map(z => ({ value: z, label: z })),
                },
                {
                  key: "bookingFilter", type: "select", label: t("companies.allStatuses"), options: [
                    { value: "BOOKED", label: t("talabat.booked") },
                    { value: "COMPLETED", label: t("keetaPage.completed") },
                    { value: "NOT_BOOKED", label: t("talabat.notBooked") },
                    { value: "NO_SHOW", label: t("keetaPage.noShow") },
                    { value: "FLAGGED", label: t("talabat.flagged") },
                  ],
                },
              ]}
              values={tableFilters}
              onChange={(k, v) => setTableFilters({ ...tableFilters, [k]: v })}
            />
          </div>

          {/* Drivers Table */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <SortHeader label={t("table.driver")} colKey="driverName" />
                    <SortHeader label={t("table.phone")} colKey="phone" />
                    <SortHeader label={t("table.zone")} colKey="zone" />
                    <SortHeader label={t("table.status")} colKey="booking" />
                    <SortHeader label={t("keetaPage.weekHeader")} colKey="weeklyBookings" />
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("keetaPage.flagReasonHeader")}</th>
                    <SortHeader label={t("keetaPage.scheduledHeader")} colKey="bookedHours" />
                    <SortHeader label={t("keetaPage.actualHeader")} colKey="actualHours" />
                    <SortHeader label={t("keetaPage.inHeader")} colKey="actualStart" />
                    <SortHeader label={t("keetaPage.outHeader")} colKey="actualEnd" />
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {driverList.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-12 text-center text-sm text-secondary">
                        {t("keetaPage.noDriversFoundShifts")}
                      </td>
                    </tr>
                  ) : (
                    sortedDrivers.map((d: any) => {
                      const hoursMatch = !d.bookedHours || !d.actualHours || Math.abs(d.bookedHours - d.actualHours) < 0.5;
                      const zc = getZoneColor(d.zone);
                      return (
                        <tr
                          key={d.driverId}
                          onClick={() => setSelected(d)}
                          className={cn(
                            "border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50/50 transition-colors",
                            !d.hasBooked && "bg-red-50/30"
                          )}
                        >
                          <td className="px-5 py-3">
                            <span className="text-sm font-medium">{d.driverName}</span>
                          </td>
                          <td className="px-5 py-3">
                            <a
                              href={`tel:${d.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-mono"
                            >
                              <Phone size={11} />
                              {d.phone}
                            </a>
                          </td>
                          <td className="px-5 py-3">
                            {d.zone ? (
                              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium", zc.bg, zc.text)}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", zc.dot)} />
                                {d.zone}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-5 py-3">{statusBadge(d.status)}</td>
                          <td className="px-5 py-3">
                            {d.weeklyBookings !== undefined && d.weeklyBookings !== null ? (
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold font-mono",
                                d.weeklyFlag ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                              )}>
                                {d.weeklyBookings}/{d.weeklyExpected ?? 7}
                                {d.weeklyFlag && <AlertTriangle size={10} className="shrink-0" />}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            {d.weeklyFlagReason ? (
                              <span className="text-xs text-red-600 font-medium">{d.weeklyFlagReason}</span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-sm font-mono text-secondary whitespace-nowrap">
                            {d.scheduledStart && d.scheduledEnd
                              ? <div className="flex flex-col leading-tight gap-1">
                                  <span>{formatTime(d.scheduledStart, locale)}</span>
                                  <span className="text-gray-300">↓</span>
                                  <span>{formatTime(d.scheduledEnd, locale)}</span>
                                </div>
                              : d.bookedHours ? `${d.bookedHours.toFixed(1)}h` : "–"}
                          </td>
                          <td className="px-5 py-3">
                            <span className={cn(
                              "text-sm font-mono",
                              !hoursMatch ? "text-amber-600 font-medium" : "text-secondary"
                            )}>
                              {d.actualHours ? `${d.actualHours.toFixed(1)}h` : "-"}
                              {!hoursMatch && <AlertTriangle size={11} className="inline ms-1" />}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-sm font-mono text-secondary whitespace-nowrap">
                            {d.actualStart ? formatTime(d.actualStart, locale) : "–"}
                          </td>
                          <td className="px-5 py-3 text-sm font-mono text-secondary whitespace-nowrap">
                            {d.actualEnd ? formatTime(d.actualEnd, locale) : "–"}
                          </td>
                          <td className="px-5 py-3">
                            <DirectionalIcon kind="chevron-forward" size={15} className="text-gray-300" />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* CALENDAR VIEW                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {view === "calendar" && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard title={t("keetaPage.totalShifts")} value={total} icon={CalendarCheck} />
            <StatCard
              title={t("keetaPage.pctBooked")}
              value={`${pct(calBooked)}%`}
              icon={BarChart2}
              trend={`${calBooked} ${t("keetaPage.weekConnector")} ${total}`}
            />
            <StatCard
              title={t("keetaPage.pctValid")}
              value={`${pct(valid)}%`}
              icon={CheckCircle2}
              trend={`${valid} ${t("keetaPage.validShiftsSuffix")}`}
              highlight={pct(valid) < 70}
            />
            <StatCard
              title={t("keetaPage.pctCompleted")}
              value={`${pct(completed)}%`}
              icon={Clock}
              trend={`${totalActual.toFixed(1)}h / ${totalPlanned}h`}
            />
          </div>

          {/* Filters + Week nav */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <FilterBar
              filters={[
                { key: "zone", type: "select", label: t("keetaPage.allZones"), options: ZONES.map((z) => ({ value: z, label: z })) },
                { key: "driver", type: "search", label: t("table.driver"), placeholder: t("talabatAttendance.searchDriver") },
              ]}
              values={filters}
              onChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                aria-label={t("actions.previous")}
              >
                <DirectionalIcon kind="chevron-back" size={16} />
              </button>
              <span className="text-sm font-medium min-w-[160px] text-center">
                {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
              </span>
              <button
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                aria-label={t("actions.next")}
              >
                <DirectionalIcon kind="chevron-forward" size={16} />
              </button>
              <button
                onClick={() => setWeekStart(getMonday(new Date()))}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                {t("keetaPage.thisWeekBtn")}
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-gray-50">
              <div className="px-3 py-3 text-xs font-medium text-secondary">{t("keetaPage.slot")}</div>
              {weekDates.map((d, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-2 py-3 text-center text-xs font-medium",
                    formatDate(d) === formatDate(new Date()) ? "text-primary" : "text-secondary"
                  )}
                >
                  <div className="font-semibold">{WEEK_DAYS[i]}</div>
                  <div className="text-[11px] mt-0.5">{formatShortDate(d)}</div>
                </div>
              ))}
            </div>

            {calLoading ? (
              <div className="px-5 py-12 text-center text-sm text-secondary">{t("keetaPage.loadingShifts")}</div>
            ) : (
              KEETA_SLOTS.map((slot) => (
                <div key={slot.id} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-gray-50 last:border-0 min-h-[90px]">
                  <div className="px-3 py-3 flex flex-col justify-center border-r border-gray-50">
                    <p className="text-[11px] font-semibold text-foreground">{slot.start}</p>
                    <p className="text-[10px] text-secondary">{slot.end}</p>
                  </div>
                  {weekDates.map((d, di) => {
                    const key = `${formatDate(d)}_${slot.id}`;
                    const cells = shiftMap[key] || [];
                    return (
                      <div
                        key={di}
                        className={cn(
                          "px-1.5 py-2 border-r border-gray-50 last:border-0 space-y-1",
                          formatDate(d) === formatDate(new Date()) && "bg-primary/[0.02]"
                        )}
                      >
                        {cells.length === 0 ? (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-gray-200 text-xs">·</span>
                          </div>
                        ) : (
                          cells.map((shift: any) => {
                            const zone = shift.driver?.zone || shift.zone || null;
                            const zc = getZoneColor(zone);
                            const live = isShiftLive(shift, slot.start, slot.end);
                            const areaCount = getDriverDayAreaCount(shift);
                            return (
                              <button
                                key={shift.id}
                                onClick={() => setSelected(shift)}
                                className={cn(
                                  "w-full text-left rounded-lg px-2 py-1.5 text-[11px] transition-all hover:opacity-80 space-y-0.5",
                                  SHIFT_STATUS_STYLES[shift.status] || "bg-gray-50 border border-gray-100 text-gray-600",
                                  live && "ring-2 ring-green-400 ring-offset-1"
                                )}
                              >
                                <div className="flex items-center gap-1 justify-between">
                                  <span className="font-semibold truncate max-w-[70px]">{shift.driver?.name?.split(" ")[0] || "-"}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {live && (
                                      <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                                      </span>
                                    )}
                                    <ShiftValidity valid={shift.isValid ?? null} />
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {zone ? (
                                    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium", zc.bg, zc.text)}>
                                      <span className={cn("w-1.5 h-1.5 rounded-full", zc.dot)} />
                                      <span className="truncate max-w-[60px]">{zone}</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] opacity-70">-</span>
                                  )}
                                  {areaCount >= 2 && (
                                    <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold shrink-0">
                                      {areaCount} {t("keetaPage.areasSuffix")}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Slot legend */}
          <div className="flex items-center gap-6 text-xs text-secondary">
            {KEETA_SLOTS.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-keeta/60" />
                {s.label}
              </span>
            ))}
          </div>

          {/* Shift status legend */}
          <div className="flex items-center gap-4">
            {Object.entries(SHIFT_STATUS_STYLES).map(([status, cls]) => (
              <span key={status} className={cn("px-2 py-0.5 rounded-md text-xs font-medium", cls)}>{shiftStatusLabel(status)}</span>
            ))}
          </div>

          {/* Zone color legend */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-secondary">
            <span className="font-medium text-foreground">{t("keetaPage.zonesLabel")}</span>
            {ZONES.map((z) => {
              const zc = getZoneColor(z);
              return (
                <span key={z} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md", zc.bg, zc.text)}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", zc.dot)} />
                  {z}
                </span>
              );
            })}
          </div>
        </>
      )}

      {/* Detail Panel — shared across both views */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.driver?.name || selected?.driverName || t("keetaPage.shiftDetail")}
        subtitle={`Keeta / ${t("keetaPage.sidra")}${selected?.zone ? ` · ${selected.zone}` : ""}`}
      >
        {selected && (
          <div className="space-y-5">
            {/* Booking Status (table view data) */}
            {selected.hasBooked !== undefined && (
              <div className={cn(
                "p-4 rounded-xl border",
                selected.hasBooked ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"
              )}>
                <div className="flex items-center gap-2">
                  {selected.hasBooked ? (
                    <>
                      <CheckCircle2 size={18} className="text-green-600" />
                      <div>
                        <p className="text-sm font-semibold text-green-800">{t("keetaPage.bookedShiftLabel")}</p>
                        <p className="text-xs text-green-600 font-mono mt-0.5">
                          {selected.scheduledStart ? formatTime(selected.scheduledStart, locale) : ""}
                          {selected.scheduledEnd ? ` – ${formatTime(selected.scheduledEnd, locale)}` : ""}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle size={18} className="text-red-600" />
                      <div>
                        <p className="text-sm font-semibold text-red-800">{t("talabat.noShiftBookedDetail")}</p>
                        <p className="text-xs text-red-600 mt-0.5">{t("keetaPage.notBookedDriver")}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Weekly Booking Status */}
            {selected.weeklyBookings !== undefined && (
              <div className={cn(
                "p-4 rounded-xl border",
                selected.weeklyFlag ? "bg-amber-50 border-amber-100" : "bg-gray-50 border-gray-100"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-secondary uppercase tracking-wide">{t("talabat.thisWeek")}</p>
                  <span className={cn(
                    "text-lg font-bold font-mono",
                    selected.weeklyFlag ? "text-red-600" : "text-green-700"
                  )}>
                    {selected.weeklyBookings ?? "—"}/{selected.weeklyExpected ?? 7}
                  </span>
                </div>
                {selected.weeklyFlag && selected.weeklyFlagReason ? (
                  <div className="flex items-start gap-1.5 mt-1">
                    <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600 font-medium">{selected.weeklyFlagReason}</p>
                  </div>
                ) : (
                  <p className="text-xs text-green-600">{t("keetaPage.allDaysBookedNoIssues")}</p>
                )}
              </div>
            )}

            {/* Contact Info */}
            {(selected.phone || selected.driver?.phone) && (
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-2">{t("keetaPage.contactK")}</p>
                <a
                  href={`tel:${selected.phone || selected.driver?.phone}`}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <Phone size={14} />
                  {t("keetaPage.callPrefixK")} {selected.phone || selected.driver?.phone}
                </a>
              </div>
            )}

            {/* Shift Details Grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                [t("table.date"), selected.date ? fmtDate(selected.date, locale) : "-"],
                [t("table.zone"), selected.driver?.zone || selected.zone || "-"],
                [t("table.status"), shiftStatusLabel(selected.status)],
                [t("companies.vehicle"), selected.vehicleType || selected.driver?.vehicleType || "-"],
                [t("keetaPage.plannedHours"), selected.plannedHours ? `${selected.plannedHours}h` : selected.bookedHours ? `${selected.bookedHours}h` : "-"],
                [t("keetaPage.actualHoursLabel2"), selected.actualHours ? `${typeof selected.actualHours === "number" ? selected.actualHours.toFixed(1) : selected.actualHours}h` : "-"],
                [t("keetaPage.actualStart"), selected.actualStart ? formatTime(selected.actualStart, locale) : "-"],
                [t("keetaPage.actualEnd"), selected.actualEnd ? formatTime(selected.actualEnd, locale) : "-"],
              ].map(([label, val]) => (
                <div key={label as string} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val}</p>
                </div>
              ))}
            </div>

            {selected.notes && (
              <div className="bg-yellow-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium mb-1">{t("keetaPage.notesLabel")}</p>
                <p className="text-sm">{selected.notes}</p>
              </div>
            )}
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
