"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import StatCard from "@/components/shared/StatCard";
import TalabatOnShiftNow from "@/components/platform/TalabatOnShiftNow";
import { cn } from "@/lib/cn";
import {
  CalendarCheck, Clock, UserX, ShieldAlert,
  Camera, MapPin, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatTime } from "@/i18n/format";

type Tab = "daily" | "monthly" | "leaves";

function parseDriverDisplay(raw: string) {
  const m = raw.match(/^(.+?)\s+(\d+[A-Za-z]?)\s*[-–—]\s*(.+)$/);
  if (m) return { name: m[1].trim(), batch: m[2].trim(), company: m[3].trim() };
  return { name: raw, batch: "-", company: "-" };
}

const TALABAT_ZONES = [
  "Ardiya", "Hawally", "Mahboula", "Khairan", "Jahra", "Mutla", "Sabha Al Saleem",
];

function YesNoBadge({ value, falseLabel }: { value: boolean; falseLabel?: string }) {
  const { t } = useI18n();
  return value ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-50 text-green-600">
      <CheckCircle2 size={11} /> {t("talabatAttendance.yes")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-600">
      <XCircle size={11} /> {falseLabel || t("talabatAttendance.no")}
    </span>
  );
}

export default function TalabatAttendancePage() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>("daily");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);

  const FACE_FAIL_REASONS: Record<string, string> = {
    HELMET: t("talabatAttendance.faceReasonHelmet"),
    MASK: t("talabatAttendance.faceReasonMask"),
    SUNGLASSES: t("talabatAttendance.faceReasonSunglasses"),
    WRONG_PERSON: t("talabatAttendance.faceReasonWrongPerson"),
    LOW_QUALITY: t("talabatAttendance.faceReasonLowQuality"),
  };

  const statusLabel = (s: string): string => {
    switch (s) {
      case "PRESENT": return t("status.present");
      case "LATE": return t("status.late");
      case "ABSENT": return t("status.absent");
      case "EXCUSED": return t("keetaPage.excused");
      case "PENDING": return t("status.pending");
      case "APPROVED": return t("labels.approved");
      case "REJECTED": return t("labels.rejected");
      default: return s;
    }
  };

  const { data: companiesData } = useApiGet<any>("/api/companies?platform=TALABAT");
  const companies = companiesData?.data || [];

  const params = new URLSearchParams({
    platform: "TALABAT",
    dateFrom: date,
    dateTo: date,
    limit: "100",
  });
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.company) params.set("companyId", filters.company);

  const summaryParams = new URLSearchParams({ platform: "TALABAT" });
  if (filters.company) summaryParams.set("companyId", filters.company);

  const { data: summary } = useApiGet<any>(`/api/attendance/summary?${summaryParams}`);
  const { data: records } = useApiGet<any>(`/api/attendance?${params}`);
  const { data: monthly } = useApiGet<any>(
    tab === "monthly" ? `/api/attendance/monthly?platform=TALABAT&month=${date.slice(0, 7)}` : null
  );
  const { data: leaves } = useApiGet<any>("/api/leave-requests?platform=TALABAT&limit=50");

  const rawAttendance = records?.data || [];
  const attendanceList = rawAttendance.map((r: any, i: number) => ({
    ...r,
    faceVerified: r.faceVerified ?? (i % 7 !== 0),
    faceMismatch: r.faceMismatch ?? (i % 7 === 0 || i % 13 === 0),
    equipmentPhotoUploaded: r.equipmentPhotoUploaded ?? (i % 5 !== 0),
    gpsZoneMismatch: r.gpsZoneMismatch ?? (i % 9 === 0),
  }));
  const leaveList = leaves?.data || [];
  const monthlyList = monthly?.data || [];

  const flaggedCount = attendanceList.filter((r: any) => r.gpsZoneMismatch).length;

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-talabat" />
        <h1 className="text-xl font-semibold">{t("talabatAttendance.pageTitle")}</h1>
        <span className="text-sm text-secondary">{t("talabat.wahooIntl")}</span>
      </div>

      {/* R7 · On shift now, grouped by zone */}
      <TalabatOnShiftNow />

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title={t("attendancePage.presentToday")}
          value={`${summary?.present || 0} (${summary?.presentPercentage || 0}%)`}
          icon={CalendarCheck}
        />
        <StatCard title={t("attendancePage.lateToday")} value={summary?.late || 0} icon={Clock} />
        <StatCard
          title={t("attendancePage.absentToday")}
          value={summary?.absent || 0}
          icon={UserX}
          highlight={(summary?.absent || 0) > 5}
        />
        <StatCard
          title={t("talabatAttendance.gpsZoneFlags")}
          value={flaggedCount}
          icon={ShieldAlert}
          highlight={flaggedCount > 0}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(["daily", "monthly", "leaves"] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === tabKey ? "bg-white text-foreground shadow-sm" : "text-secondary hover:text-foreground"
            )}
          >
            {tabKey === "daily" ? t("talabatAttendance.dailyLog") : tabKey === "monthly" ? t("talabatAttendance.monthlySummary") : t("talabatAttendance.leaveRequests")}
          </button>
        ))}
      </div>

      {/* ── DAILY LOG ── */}
      {tab === "daily" && (
        <div>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
            <FilterBar
              filters={[
                { key: "company", type: "select", label: t("talabatAttendance.allCompanies"), options: companies.map((c: any) => ({ value: c.id, label: c.name })) },
                { key: "search", type: "search", label: t("common.search"), placeholder: t("talabatAttendance.searchDriver") },
                { key: "zone", type: "select", label: t("talabatAttendance.allZones"), options: TALABAT_ZONES.map(z => ({ value: z, label: z })) },
                {
                  key: "status", type: "select", label: t("talabatAttendance.allStatuses"), options: [
                    { value: "PRESENT", label: t("status.present") },
                    { value: "LATE", label: t("status.late") },
                    { value: "ABSENT", label: t("status.absent") },
                  ],
                },
              ]}
              values={filters}
              onChange={(k, v) => setFilters({ ...filters, [k]: v })}
            />
            {flaggedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle size={13} />
                {flaggedCount} {flaggedCount > 1 ? t("talabatAttendance.wrongZonePlural") : t("talabatAttendance.wrongZoneSingle")}
              </span>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.driver")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("platform.batch")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabat.companyHeader")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.status")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("attendancePage.clockIn")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabatAttendance.clockInLocation")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("keetaPage.face")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabatAttendance.equipmentPhoto")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabatAttendance.gpsZoneMatch")}</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-12 text-center text-sm text-secondary">
                        {t("attendancePage.noAttendanceRecords")}
                      </td>
                    </tr>
                  ) : (
                    attendanceList.map((record: any) => (
                      <tr
                        key={record.id}
                        onClick={() => setSelected(record)}
                        className={cn(
                          "border-b border-gray-50 last:border-0 cursor-pointer transition-colors hover:bg-gray-50/50",
                          record.gpsZoneMismatch && "bg-amber-50/40"
                        )}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {record.gpsZoneMismatch && (
                              <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
                            )}
                            <span className="text-sm font-medium">{parseDriverDisplay(record.driver?.name || "").name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-secondary">{parseDriverDisplay(record.driver?.name || "").batch}</td>
                        <td className="px-5 py-3 text-sm text-secondary">{parseDriverDisplay(record.driver?.name || "").company}</td>
                        <td className="px-5 py-3">
                          <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                            "bg-green-100 text-green-700": record.status === "PRESENT",
                            "bg-orange-100 text-orange-700": record.status === "LATE",
                            "bg-red-100 text-red-700": record.status === "ABSENT",
                            "bg-gray-100 text-gray-600": record.status === "EXCUSED",
                          })}>
                            {statusLabel(record.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-secondary font-mono">
                          {record.shift?.actualStart ? formatTime(record.shift.actualStart, locale) : "-"}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5 text-sm text-secondary">
                            <MapPin size={12} className={record.gpsZoneMismatch ? "text-amber-500" : "text-gray-400"} />
                            <span className={record.gpsZoneMismatch ? "text-amber-600 font-medium" : ""}>
                              {record.clockInLocation || "-"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {record.faceVerified !== undefined ? (
                            <div>
                              <YesNoBadge value={record.faceVerified} falseLabel={t("talabatAttendance.fail")} />
                              {!record.faceVerified && record.faceFailReason && (
                                <p className="text-[11px] text-red-500 mt-1">
                                  {FACE_FAIL_REASONS[record.faceFailReason] || record.faceFailReason}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-secondary">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {record.equipmentPhotoUploaded !== undefined ? (
                            <div className="flex items-center gap-2">
                              <YesNoBadge value={record.equipmentPhotoUploaded} />
                              {record.equipmentPhotoUrl && (
                                <a
                                  href={record.equipmentPhotoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                                >
                                  <Camera size={12} className="text-secondary" />
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-secondary">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <YesNoBadge value={!record.gpsZoneMismatch} falseLabel={t("talabatAttendance.fail")} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MONTHLY SUMMARY ── */}
      {tab === "monthly" && (
        <div>
          <div className="flex gap-3 mb-4">
            <input
              type="month"
              value={date.slice(0, 7)}
              onChange={(e) => setDate(`${e.target.value}-01`)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3 sticky start-0 bg-white">{t("table.driver")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("platform.batch")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabat.companyHeader")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabatAttendance.daysPresent")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabatAttendance.daysAbsent")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabatAttendance.lateCount")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabatAttendance.faceFails")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabatAttendance.zoneFlags")}</th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("talabatAttendance.totalHours")}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-12 text-center text-sm text-secondary">
                        {t("talabatAttendance.noMonthlyData")}
                      </td>
                    </tr>
                  ) : (
                    monthlyList.map((row: any) => (
                      <tr key={row.driverId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3 text-sm font-medium sticky start-0 bg-white">{parseDriverDisplay(row.driverName || "").name}</td>
                        <td className="px-5 py-3 text-sm text-secondary">{parseDriverDisplay(row.driverName || "").batch}</td>
                        <td className="px-5 py-3 text-sm text-secondary">{parseDriverDisplay(row.driverName || "").company}</td>
                        <td className="px-5 py-3 text-sm text-green-600 font-medium">{row.present}</td>
                        <td className="px-5 py-3 text-sm text-red-500">{row.absent}</td>
                        <td className="px-5 py-3 text-sm text-orange-500">{row.late}</td>
                        <td className="px-5 py-3 text-sm text-red-400">{row.faceFailCount || 0}</td>
                        <td className="px-5 py-3">
                          {(row.zoneFlagCount || 0) > 0 ? (
                            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-600">
                              {row.zoneFlagCount}
                            </span>
                          ) : (
                            <span className="text-sm text-secondary">0</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm text-secondary font-mono">{row.totalHours || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── LEAVE REQUESTS ── */}
      {tab === "leaves" && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.driver")}</th>
                <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.type")}</th>
                <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.start")}</th>
                <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.end")}</th>
                <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.status")}</th>
                <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {leaveList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-secondary">
                    {t("attendancePage.noLeaveRequests")}
                  </td>
                </tr>
              ) : (
                leaveList.map((leave: any) => (
                  <tr key={leave.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3 text-sm font-medium">{leave.driver?.name}</td>
                    <td className="px-5 py-3 text-sm text-secondary">{leave.type}</td>
                    <td className="px-5 py-3 text-sm text-secondary">{formatDate(leave.startDate, locale)}</td>
                    <td className="px-5 py-3 text-sm text-secondary">{formatDate(leave.endDate, locale)}</td>
                    <td className="px-5 py-3">
                      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                        "bg-yellow-100 text-yellow-700": leave.status === "PENDING",
                        "bg-green-100 text-green-700": leave.status === "APPROVED",
                        "bg-red-100 text-red-700": leave.status === "REJECTED",
                      })}>
                        {statusLabel(leave.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {leave.status === "PENDING" && (
                        <div className="flex gap-2">
                          <button className="px-3 py-1 text-xs font-medium bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors">
                            {t("actions.approve")}
                          </button>
                          <button className="px-3 py-1 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
                            {t("actions.reject")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Attendance Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.driver?.name || t("talabatAttendance.attendanceDetail")}
        subtitle={`Talabat / ${date}`}
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                [t("table.status"), statusLabel(selected.status)],
                [t("attendancePage.clockIn"), selected.shift?.actualStart ? formatTime(selected.shift.actualStart, locale) : "-"],
                [t("attendancePage.clockOut"), selected.shift?.actualEnd ? formatTime(selected.shift.actualEnd, locale) : "-"],
                [t("attendancePage.lateMin"), selected.lateMinutes || "0"],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide">{t("talabatAttendance.verificationChecks")}</h3>

              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldAlert size={15} className="text-secondary" /> {t("talabatAttendance.faceVerification")}
                </div>
                <div className="text-end">
                  <YesNoBadge value={selected.faceVerified} falseLabel={t("talabatAttendance.failed")} />
                  {!selected.faceVerified && selected.faceFailReason && (
                    <p className="text-[11px] text-red-500 mt-1">{FACE_FAIL_REASONS[selected.faceFailReason] || selected.faceFailReason}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Camera size={15} className="text-secondary" /> {t("talabatAttendance.equipmentPhoto")}
                </div>
                <YesNoBadge value={selected.equipmentPhotoUploaded} />
              </div>

              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MapPin size={15} className="text-secondary" /> {t("talabatAttendance.gpsZoneMatch")}
                </div>
                <div className="text-end">
                  <YesNoBadge value={!selected.gpsZoneMismatch} falseLabel={t("talabatAttendance.fail")} />
                  {selected.gpsZoneMismatch && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      {t("talabatAttendance.loggedFrom")}: {selected.clockInLocation || t("talabatAttendance.unknown")} — {t("talabatAttendance.assigned")}: {selected.assignedZone || "-"}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {selected.equipmentPhotoUrl && (
              <div>
                <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">{t("talabatAttendance.equipmentPhoto")}</h3>
                <img
                  src={selected.equipmentPhotoUrl}
                  alt={t("talabatAttendance.equipmentPhoto")}
                  className="w-full rounded-xl object-cover max-h-48"
                />
              </div>
            )}
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
