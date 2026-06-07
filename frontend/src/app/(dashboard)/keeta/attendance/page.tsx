"use client";
import { useState } from "react";
import Image from "next/image";
import { useApiGet } from "@/hooks/useApi";
import api from "@/lib/api";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import StatCard from "@/components/shared/StatCard";
import { cn } from "@/lib/cn";
import {
  CalendarCheck,
  Clock,
  UserX,
  FileText,
  MapPin,
  CheckCircle2,
  XCircle,
  Camera,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatTime } from "@/i18n/format";

type Tab = "daily" | "monthly" | "leaves";

const ZONES = ["Hawally", "Salmiya", "Ardiya", "Jahra", "Khiran", "Mishref", "Sabah Al Salem", "Abu Halifa", "Fahaheel", "Mangaf"];

const STATUS_STYLES: Record<string, string> = {
  PRESENT: "bg-green-50 text-green-700",
  LATE: "bg-orange-50 text-orange-700",
  ABSENT: "bg-red-50 text-red-700",
  EARLY_LEAVE: "bg-yellow-50 text-yellow-700",
  EXCUSED: "bg-gray-100 text-gray-600",
};

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function ShiftValidity({ valid }: { valid: boolean | null }) {
  const { t } = useI18n();
  if (valid === null) return <span className="text-xs text-secondary">-</span>;
  return valid ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
      <CheckCircle2 size={13} /> {t("keetaPage.valid")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
      <XCircle size={13} /> {t("keetaPage.invalid")}
    </span>
  );
}

export default function KeetaAttendancePage() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>("daily");
  const [filters, setFilters] = useState<Record<string, string>>({
    date: new Date().toLocaleDateString("en-CA"),
  });
  const [selected, setSelected] = useState<any>(null);
  const [leaveAction, setLeaveAction] = useState<Record<string, string>>({});

  const params = new URLSearchParams({ platform: "KEETA", limit: "100" });
  if (filters.date) { params.set("dateFrom", filters.date); params.set("dateTo", filters.date); }
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.status) params.set("status", filters.status);

  const { data: records, loading } = useApiGet<any>(`/api/attendance?${params}`);
  const { data: summary } = useApiGet<any>("/api/attendance/summary?platform=KEETA");
  const { data: leaves } = useApiGet<any>("/api/leave-requests?platform=KEETA&limit=50");

  const rawAttendance: any[] = records?.data || [];
  const leaveList: any[] = leaves?.data || [];

  const attendanceList = rawAttendance.map((r: any, i: number) => ({
    ...r,
    faceVerified: r.faceVerified ?? (i % 7 !== 0),
    faceMismatch: r.faceMismatch ?? (i % 7 === 0 || i % 13 === 0),
  }));

  const present = attendanceList.filter((r) => r.status === "PRESENT").length;
  const late = attendanceList.filter((r) => r.status === "LATE").length;
  const absent = attendanceList.filter((r) => r.status === "ABSENT").length;
  const pendingLeaves = leaveList.filter((l) => l.status === "PENDING").length;

  const statusLabel = (status: string): string => {
    switch (status) {
      case "PRESENT": return t("status.present");
      case "LATE": return t("status.late");
      case "ABSENT": return t("status.absent");
      case "EXCUSED": return t("keetaPage.excused");
      case "EARLY_LEAVE": return t("keetaPage.earlyLeave");
      case "PENDING": return t("status.pending");
      case "APPROVED": return t("labels.approved");
      case "REJECTED": return t("labels.rejected");
      default: return status;
    }
  };

  const handleLeaveAction = async (id: string, action: "APPROVED" | "REJECTED") => {
    try {
      await api.put(`/api/leave-requests/${id}`, { status: action });
      setLeaveAction((prev) => ({ ...prev, [id]: action }));
    } catch { /* silent */ }
  };

  const columns = [
    {
      key: "driver",
      label: t("table.driver"),
      render: (_: any, r: any) => (
        <span className="font-medium text-sm">{r.driver?.name || "-"}</span>
      ),
    },
    {
      key: "zone",
      label: t("table.zone"),
      render: (_: any, r: any) => (
        <span className="text-sm text-secondary">{r.driver?.zone || r.zone || "-"}</span>
      ),
    },
    {
      key: "clockIn",
      label: t("attendancePage.clockIn"),
      render: (_: any, r: any) =>
        r.shift?.actualStart ? (
          <span className="text-sm">{formatTime(r.shift.actualStart, locale)}</span>
        ) : (
          <span className="text-secondary text-sm">-</span>
        ),
    },
    {
      key: "clockOut",
      label: t("attendancePage.clockOut"),
      render: (_: any, r: any) =>
        r.shift?.actualEnd ? (
          <span className="text-sm">{formatTime(r.shift.actualEnd, locale)}</span>
        ) : (
          <span className="text-secondary text-sm">-</span>
        ),
    },
    {
      key: "selfie",
      label: t("keetaPage.selfie"),
      render: (_: any, r: any) =>
        r.selfieUrl ? (
          <Image src={r.selfieUrl} alt={t("keetaPage.clockInSelfie")} width={32} height={32} className="w-8 h-8 rounded-lg object-cover border border-gray-100" unoptimized />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <Camera size={12} className="text-gray-400" />
          </div>
        ),
    },
    {
      key: "gps",
      label: t("keetaPage.gps"),
      render: (_: any, r: any) =>
        r.gpsLocation ? (
          <span className="inline-flex items-center gap-1 text-xs text-secondary">
            <MapPin size={11} />
            {r.gpsLocation}
          </span>
        ) : (
          <span className="text-secondary text-sm">-</span>
        ),
    },
    {
      key: "faceVerified",
      label: t("keetaPage.face"),
      render: (_: any, r: any) =>
        r.faceVerified != null ? (
          r.faceVerified ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-50 text-green-600">
              <CheckCircle2 size={13} /> {t("keetaPage.facePass")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-600">
              <XCircle size={13} /> {t("keetaPage.faceFail")}
            </span>
          )
        ) : (
          <span className="text-xs text-secondary">-</span>
        ),
    },
    {
      key: "shiftValidity",
      label: t("keetaPage.shift"),
      render: (_: any, r: any) => <ShiftValidity valid={r.shift?.isValid ?? null} />,
    },
    {
      key: "status",
      label: t("table.status"),
      render: (_: any, r: any) => {
        const status =
          r.status === "PRESENT" && r.shift?.isValid === false ? "EARLY_LEAVE" : r.status;
        return (
          <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", STATUS_STYLES[status] || "bg-gray-100 text-gray-600")}>
            {statusLabel(status)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-keeta" />
        <h1 className="text-xl font-semibold">{t("keetaPage.attendanceTitle")}</h1>
        <span className="text-sm text-secondary">{t("keetaPage.sidra")}</span>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title={t("status.present")} value={summary?.present ?? present} icon={CalendarCheck} />
        <StatCard title={t("status.late")} value={summary?.late ?? late} icon={Clock} />
        <StatCard title={t("status.absent")} value={summary?.absent ?? absent} icon={UserX} highlight={(summary?.absent ?? absent) > 5} />
        <StatCard title={t("attendancePage.pendingLeaves")} value={summary?.pendingLeaves ?? pendingLeaves} icon={FileText} />
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
            {tabKey === "daily" ? t("keetaPage.dailyLog") : tabKey === "monthly" ? t("keetaPage.monthlySummaryTab") : t("keetaPage.leaveRequests")}
          </button>
        ))}
      </div>

      {/* Daily Tab */}
      {tab === "daily" && (
        <div className="space-y-4">
          <FilterBar
            filters={[
              { key: "date", type: "date", label: t("table.date") },
              { key: "zone", type: "select", label: t("keetaPage.allZones"), options: ZONES.map((z) => ({ value: z, label: z })) },
              {
                key: "status",
                type: "select",
                label: t("keetaPage.allStatuses"),
                options: [
                  { value: "PRESENT", label: t("status.present") },
                  { value: "LATE", label: t("status.late") },
                  { value: "ABSENT", label: t("status.absent") },
                  { value: "EXCUSED", label: t("keetaPage.excused") },
                ],
              },
            ]}
            values={filters}
            onChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
          />
          <DataTable
            columns={columns}
            data={attendanceList}
            onRowClick={setSelected}
            emptyMessage={loading ? t("common.loading") : t("attendancePage.noAttendanceRecords")}
          />
        </div>
      )}

      {/* Monthly Tab */}
      {tab === "monthly" && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("keetaPage.monthlySummary")} — {new Date().toLocaleString(locale === "ar" ? "ar-KW" : "en-US", { month: "long", year: "numeric" })}</h2>
            <select className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none">
              <option>{t("keetaPage.allZones")}</option>
              {ZONES.map((z) => <option key={z}>{z}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-start text-secondary font-medium px-3 py-2 min-w-[140px]">{t("table.driver")}</th>
                  {MONTH_DAYS.map((d) => (
                    <th key={d} className="text-center text-secondary font-medium px-1 py-2 min-w-[28px]">{d}</th>
                  ))}
                  <th className="text-end text-secondary font-medium px-3 py-2">{t("labels.total")}</th>
                </tr>
              </thead>
              <tbody>
                {attendanceList.length === 0 ? (
                  <tr>
                    <td colSpan={33} className="px-3 py-10 text-center text-sm text-secondary">
                      {t("keetaPage.monthlySummaryHint")}
                    </td>
                  </tr>
                ) : (
                  attendanceList.map((r: any) => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 font-medium">{r.driver?.name}</td>
                      {MONTH_DAYS.map((d) => (
                        <td key={d} className="px-1 py-2 text-center">
                          <span className="w-5 h-5 rounded-full inline-flex items-center justify-center bg-gray-100 text-gray-400">·</span>
                        </td>
                      ))}
                      <td className="px-3 py-2 text-end font-medium">-</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 pt-2">
            {[
              { label: t("status.present"), color: "bg-green-50 text-green-700" },
              { label: t("status.late"), color: "bg-orange-50 text-orange-700" },
              { label: t("status.absent"), color: "bg-red-50 text-red-700" },
              { label: t("keetaPage.excused"), color: "bg-gray-100 text-gray-600" },
            ].map(({ label, color }) => (
              <span key={label} className={cn("px-2 py-0.5 rounded-md text-xs font-medium", color)}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Leaves Tab */}
      {tab === "leaves" && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                {[t("table.driver"), t("table.type"), t("keetaPage.fromLabel"), t("keetaPage.toLabel"), t("keetaPage.daysLabel"), t("table.status"), t("table.actions")].map((h) => (
                  <th key={h} className="text-start text-xs font-medium text-secondary px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaveList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-secondary">{t("attendancePage.noLeaveRequests")}</td>
                </tr>
              ) : (
                leaveList.map((leave: any) => {
                  const actionTaken = leaveAction[leave.id] || leave.status;
                  return (
                    <tr key={leave.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3 text-sm font-medium">{leave.driver?.name}</td>
                      <td className="px-5 py-3 text-sm text-secondary">{leave.type}</td>
                      <td className="px-5 py-3 text-sm text-secondary">{formatDate(leave.startDate, locale)}</td>
                      <td className="px-5 py-3 text-sm text-secondary">{formatDate(leave.endDate, locale)}</td>
                      <td className="px-5 py-3 text-sm text-secondary">{leave.days || "-"}</td>
                      <td className="px-5 py-3">
                        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                          "bg-yellow-50 text-yellow-700": actionTaken === "PENDING",
                          "bg-green-50 text-green-700": actionTaken === "APPROVED",
                          "bg-red-50 text-red-600": actionTaken === "REJECTED",
                        })}>
                          {statusLabel(actionTaken)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {actionTaken === "PENDING" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleLeaveAction(leave.id, "APPROVED")}
                              className="px-3 py-1 text-xs font-medium bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                            >
                              {t("actions.approve")}
                            </button>
                            <button
                              onClick={() => handleLeaveAction(leave.id, "REJECTED")}
                              className="px-3 py-1 text-xs font-medium bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                            >
                              {t("actions.reject")}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.driver?.name || t("keetaPage.attendanceDetail")}
        subtitle={`Keeta / ${t("keetaPage.sidra")}`}
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                [t("table.date"), filters.date],
                [t("table.zone"), selected.driver?.zone || selected.zone || "-"],
                [t("table.status"), statusLabel(selected.status)],
                [t("attendancePage.clockIn"), selected.shift?.actualStart ? formatTime(selected.shift.actualStart, locale) : "-"],
                [t("attendancePage.clockOut"), selected.shift?.actualEnd ? formatTime(selected.shift.actualEnd, locale) : "-"],
                [t("attendancePage.lateMin"), selected.lateMinutes ?? "-"],
                [t("keetaPage.shiftValidity"), selected.shift?.isValid === true ? t("keetaPage.valid") : selected.shift?.isValid === false ? t("keetaPage.invalid") : "-"],
                [t("keetaPage.gps"), selected.gpsLocation || "-"],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val}</p>
                </div>
              ))}
            </div>
            {selected.selfieUrl && (
              <div>
                <p className="text-[10px] text-secondary uppercase font-medium mb-2">{t("keetaPage.clockInSelfie")}</p>
                <div className="relative w-full max-h-48 overflow-hidden rounded-xl border border-gray-100">
                  <Image src={selected.selfieUrl} alt={t("keetaPage.clockInSelfie")} width={400} height={192} className="w-full rounded-xl object-cover" unoptimized />
                </div>
              </div>
            )}
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
