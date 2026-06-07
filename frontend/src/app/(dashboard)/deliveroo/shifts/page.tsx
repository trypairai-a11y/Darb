"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import StatCard from "@/components/shared/StatCard";
import SlidePanel from "@/components/shared/SlidePanel";
import FilterBar from "@/components/shared/FilterBar";
import { cn } from "@/lib/cn";
import {
  Clock,
  Users,
  AlertTriangle,
  CheckCircle2,
  Camera,
  MapPin,
  Calendar,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import { formatDate } from "@/i18n/format";

type ShiftModel = "FREELANCE" | "CORE_FLEET";

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ZONES = ["Al Hazm", "Madinat Al Hareer", "Abu Halifa", "Mangaf", "Fahaheel"];

function getWeekDates(offset = 0) {
  const now = new Date();
  now.setDate(now.getDate() - now.getDay() + offset * 7);
  return DAYS.map((_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    return d;
  });
}

function VerifBadge({
  label,
  ok,
}: {
  label: string;
  ok: boolean | null;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium",
        ok === true
          ? "bg-green-50 text-green-700"
          : ok === false
          ? "bg-red-50 text-red-600"
          : "bg-gray-100 text-gray-400"
      )}
    >
      {ok === true ? <CheckCircle2 size={10} /> : ok === false ? <AlertTriangle size={10} /> : null}
      {label}
    </span>
  );
}

/* ─── Freelance Timeline View ─── */
function FreelanceView({
  date,
  onDateChange,
}: {
  date: string;
  onDateChange: (d: string) => void;
}) {
  const { t } = useI18n();
  const { data } = useApiGet<any>(
    `/api/shifts/freelance-timeline?platform=DELIVEROO&date=${date}`
  );
  const drivers: any[] = data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
        <p className="text-xs text-secondary">
          {t("deliveroo.timelineHint")}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {/* Hour axis header */}
        <div className="flex border-b border-gray-50">
          <div className="w-44 shrink-0 px-5 py-2 text-[10px] text-secondary font-medium uppercase">
            {t("table.driver")}
          </div>
          <div className="flex-1 relative">
            <div className="flex">
              {HOURS_24.filter((h) => h % 3 === 0).map((h) => (
                <div
                  key={h}
                  className="flex-1 text-[9px] text-secondary text-center py-2 border-l border-gray-50 first:border-l-0"
                >
                  {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
                </div>
              ))}
            </div>
          </div>
        </div>

        {drivers.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-secondary">
            {t("deliveroo.noFreelanceData")}
          </div>
        ) : (
          drivers.map((driver: any) => {
            const totalHours = driver.totalOnlineHours || 0;
            const hitTarget = totalHours >= 12;
            const segments: Array<{ start: number; end: number }> = driver.onlineSegments || [];

            return (
              <div
                key={driver.id}
                className={cn(
                  "flex border-b border-gray-50 last:border-0",
                  !hitTarget && "bg-amber-50/30"
                )}
              >
                {/* Driver name */}
                <div className="w-44 shrink-0 px-5 py-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center text-[10px] font-semibold text-teal-700">
                    {driver.name?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-medium leading-tight">{driver.name}</p>
                    <p className={cn("text-[10px]", hitTarget ? "text-green-600" : "text-amber-500")}>
                      {totalHours.toFixed(1)}h {hitTarget ? "✓" : "< 12h"}
                    </p>
                  </div>
                </div>

                {/* Timeline */}
                <div className="flex-1 relative py-3 pe-3">
                  <div className="relative h-5 bg-gray-50 rounded-lg overflow-hidden">
                    {/* 12h target line at 50% */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-teal-400 z-10"
                      style={{ left: "50%" }}
                      title={t("deliveroo.targetMarker")}
                    />
                    {segments.map((seg, i) => {
                      const left = (seg.start / 24) * 100;
                      const width = ((seg.end - seg.start) / 24) * 100;
                      return (
                        <div
                          key={i}
                          className="absolute top-1 bottom-1 bg-green-400 rounded-sm opacity-80"
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[9px] text-gray-300">0:00</span>
                    <span className="text-[9px] text-teal-400">12h</span>
                    <span className="text-[9px] text-gray-300">24:00</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 bg-green-400 rounded-sm inline-block" /> {t("deliveroo.onlinePeriod")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-px h-3 bg-teal-400 inline-block" /> {t("deliveroo.targetMarker")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 bg-amber-100 rounded-sm inline-block border border-amber-200" /> {t("deliveroo.below12h2")}
        </span>
      </div>
    </div>
  );
}

/* ─── Core Fleet Weekly Calendar View ─── */
function CoreFleetView() {
  const { t, locale } = useI18n();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<any>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const weekDates = getWeekDates(weekOffset);

  const params = new URLSearchParams({
    platform: "DELIVEROO",
    operatingModel: "CORE_FLEET",
    weekStart: weekDates[0].toISOString().split("T")[0],
    limit: "100",
  });
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.search) params.set("search", filters.search);

  const { data } = useApiGet<any>(`/api/shifts?${params}`);
  const drivers: any[] = data?.drivers || [];

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label={t("actions.previous")}
        >
          <DirectionalIcon kind="chevron-back" size={16} />
        </button>
        <span className="text-sm font-medium">
          {formatDate(weekDates[0], locale, { day: "numeric", month: "short" })} -{" "}
          {formatDate(weekDates[6], locale, { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label={t("actions.next")}
        >
          <DirectionalIcon kind="chevron-forward" size={16} />
        </button>
        <button
          onClick={() => setWeekOffset(0)}
          className="px-3 py-1 text-xs text-secondary border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {t("keetaPage.thisWeekBtn")}
        </button>
      </div>

      <FilterBar
        filters={[
          { key: "search", type: "search", label: t("common.search"), placeholder: t("talabatAttendance.searchDriver") },
          {
            key: "zone",
            type: "select",
            label: t("keetaPage.allZones"),
            options: ZONES.map((z) => ({ value: z, label: z })),
          },
        ]}
        values={filters}
        onChange={(k, v) => setFilters({ ...filters, [k]: v })}
      />

      <div className="bg-white rounded-2xl shadow-sm overflow-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="text-start text-xs font-medium text-secondary px-5 py-3 w-44">{t("table.driver")}</th>
              {weekDates.map((d, i) => (
                <th key={i} className="text-center text-xs font-medium text-secondary px-2 py-3 w-28">
                  <div>{DAYS[i]}</div>
                  <div className="text-[10px] font-normal text-gray-300">
                    {formatDate(d, locale, { day: "numeric", month: "short" })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-secondary">
                  {t("deliveroo.noCoreFleetData")}
                </td>
              </tr>
            ) : (
              drivers.map((driver: any) => (
                <tr key={driver.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-5 py-3 text-sm font-medium">{driver.name}</td>
                  {weekDates.map((d, i) => {
                    const dayKey = d.toISOString().split("T")[0];
                    const shift = driver.shifts?.[dayKey];
                    return (
                      <td key={i} className="px-2 py-2 text-center">
                        {shift ? (
                          <button
                            onClick={() => setSelected({ driver, shift, date: d })}
                            className="w-full bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg px-1.5 py-1.5 transition-colors text-start"
                          >
                            <p className="text-[10px] font-semibold truncate">{shift.zone || "-"}</p>
                            <p className="text-[10px] text-teal-600">
                              {shift.startTime} – {shift.endTime}
                            </p>
                            <p className="text-[10px] text-teal-500">{shift.duration}h</p>
                          </button>
                        ) : (
                          <div className="text-[10px] text-gray-200 py-1">-</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Shift Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.driver?.name || ""}
        subtitle={`Deliveroo ${t("deliveroo.coreFleet")} · ${selected?.date ? formatDate(selected.date, locale, { weekday: "long", day: "numeric", month: "short" }) : ""}`}
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                [t("table.zone"), selected.shift?.zone],
                [t("deliveroo.duration"), `${selected.shift?.duration}h`],
                [t("deliveroo.startCol"), selected.shift?.startTime],
                [t("deliveroo.endCol"), selected.shift?.endTime],
                [t("table.status"), selected.shift?.status],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val || "-"}</p>
                </div>
              ))}
            </div>

            {/* Darb Verification Checks */}
            <div className="bg-teal-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                {t("deliveroo.darbVerifChecks")}
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-teal-800 flex items-center gap-1.5">
                    <Camera size={12} /> {t("deliveroo.uniformCheck")}
                  </span>
                  <VerifBadge label={selected.shift?.uniformOk ? t("deliveroo.pass") : t("deliveroo.fail")} ok={selected.shift?.uniformOk ?? null} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-teal-800 flex items-center gap-1.5">
                    <MapPin size={12} /> {t("deliveroo.locationCheck")}
                  </span>
                  <VerifBadge label={selected.shift?.locationOk ? t("deliveroo.pass") : t("deliveroo.fail")} ok={selected.shift?.locationOk ?? null} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-teal-800 flex items-center gap-1.5">
                    <Clock size={12} /> {t("deliveroo.timeCheck")}
                  </span>
                  <VerifBadge label={selected.shift?.timeOk ? t("deliveroo.pass") : t("deliveroo.fail")} ok={selected.shift?.timeOk ?? null} />
                </div>
              </div>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}

/* ─── Page ─── */
export default function DeliverooShiftsPage() {
  const { t } = useI18n();
  const [model, setModel] = useState<ShiftModel>("FREELANCE");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));

  const { data: summary } = useApiGet<any>("/api/shifts/summary?platform=DELIVEROO");

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-teal-500" />
        <h1 className="text-xl font-semibold">{t("deliveroo.shiftsTitle")}</h1>
        <span className="text-sm text-secondary">{t("deliveroo.alHazm")}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title={t("deliveroo.activeShifts")} value={summary?.active || 0} icon={Clock} />
        <StatCard title={t("deliveroo.freelanceOnline")} value={summary?.freelanceOnline || 0} icon={Users} />
        <StatCard
          title={t("deliveroo.below12hToday")}
          value={summary?.belowTarget || 0}
          icon={AlertTriangle}
          highlight={(summary?.belowTarget || 0) > 0}
        />
        <StatCard title={t("deliveroo.coreFleetShifts")} value={summary?.coreFleetShifts || 0} icon={Calendar} />
      </div>

      {/* Model Toggle */}
      <div className="flex items-center gap-3">
        <p className="text-sm text-secondary font-medium">{t("deliveroo.viewLabel")}</p>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {(["FREELANCE", "CORE_FLEET"] as ShiftModel[]).map((m) => (
            <button
              key={m}
              onClick={() => setModel(m)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                model === m ? "bg-white text-foreground shadow-sm" : "text-secondary hover:text-foreground"
              )}
            >
              {m === "FREELANCE" ? t("deliveroo.freelance") : t("deliveroo.coreFleet")}
            </button>
          ))}
        </div>

        {model === "FREELANCE" && (
          <span className="text-xs text-secondary bg-white border border-gray-100 rounded-xl px-3 py-1.5 shadow-sm">
            {t("deliveroo.freelanceHintHeader")}
          </span>
        )}
        {model === "CORE_FLEET" && (
          <span className="text-xs text-secondary bg-white border border-gray-100 rounded-xl px-3 py-1.5 shadow-sm">
            {t("deliveroo.coreFleetHintHeader")}
          </span>
        )}
      </div>

      {/* View */}
      {model === "FREELANCE" ? (
        <FreelanceView date={date} onDateChange={setDate} />
      ) : (
        <CoreFleetView />
      )}
    </div>
  );
}
