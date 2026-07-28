"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import StatCard from "@/components/shared/StatCard";
import { cn } from "@/lib/cn";
import { CalendarCheck, Clock, UserX, FileText } from "lucide-react";
import InsightBanner from "@/components/shared/InsightBanner";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatTime, formatNumber } from "@/i18n/format";

type Tab = "daily" | "monthly" | "leaves";

const STATUS_COLORS: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-700",
  LATE: "bg-orange-100 text-orange-700",
  ABSENT: "bg-red-100 text-red-700",
  EARLY_LEAVE: "bg-yellow-100 text-yellow-700",
  EXCUSED: "bg-gray-100 text-gray-600",
};

export default function AttendancePage() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>("daily");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));

  const { data: summary } = useApiGet<any>("/api/attendance/summary");
  const { data: records } = useApiGet<any>(
    `/api/attendance?dateFrom=${date}&dateTo=${date}&limit=100`
  );
  const { data: leaves } = useApiGet<any>("/api/leave-requests?limit=50");

  const attendanceList = records?.data || [];
  const leaveList = leaves?.data || [];

  const tabLabels: Record<Tab, string> = {
    daily: t("attendancePage.dailyLog"),
    monthly: t("attendancePage.monthlyLog"),
    leaves: t("attendancePage.leaveRequests"),
  };

  const statusLabel = (status: string): string => {
    const key = status?.toUpperCase();
    switch (key) {
      case "PRESENT": return t("status.present");
      case "LATE": return t("status.late");
      case "ABSENT": return t("status.absent");
      case "EARLY_LEAVE": return t("attendancePage.leave");
      case "EXCUSED": return t("labels.approved");
      case "PENDING": return t("status.pending");
      case "APPROVED": return t("labels.approved");
      case "REJECTED": return t("labels.rejected");
      default: return status;
    }
  };

  return (
    <div className="space-y-6 w-full max-w-none">
      <h1 className="text-xl font-semibold">{t("table.attendance")}</h1>

      {/* AI Insights */}
      <InsightBanner context="attendance" maxInsights={2} />

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title={t("attendancePage.presentToday")}
          value={`${formatNumber(summary?.present || 0, locale)} (${summary?.presentPercentage || 0}%)`}
          icon={CalendarCheck}
        />
        <StatCard title={t("attendancePage.lateToday")} value={summary?.late || 0} icon={Clock} />
        <StatCard title={t("attendancePage.absentToday")} value={summary?.absent || 0} icon={UserX} highlight={(summary?.absent || 0) > 5} />
        <StatCard title={t("attendancePage.pendingLeaves")} value={summary?.pendingLeaves || 0} icon={FileText} />
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
            {tabLabels[tabKey]}
          </button>
        ))}
      </div>

      {tab === "daily" && (
        <div>
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.driver")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.status")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("attendancePage.clockIn")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("attendancePage.clockOut")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("attendancePage.lateMin")}</th>
                </tr>
              </thead>
              <tbody>
                {attendanceList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-secondary">
                      {t("attendancePage.noAttendanceRecords")}
                    </td>
                  </tr>
                ) : (
                  attendanceList.map((record: any) => (
                    <tr key={record.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-25">
                      <td className="px-5 py-3 text-sm font-medium">{record.driver?.name}</td>
                      <td className="px-5 py-3">
                        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", STATUS_COLORS[record.status])}>
                          {statusLabel(record.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-secondary">
                        {record.shift?.actualStart
                          ? formatTime(record.shift.actualStart, locale)
                          : "-"}
                      </td>
                      <td className="px-5 py-3 text-sm text-secondary">
                        {record.shift?.actualEnd
                          ? formatTime(record.shift.actualEnd, locale)
                          : "-"}
                      </td>
                      <td className="px-5 py-3 text-sm text-secondary">{record.lateMinutes || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "monthly" && (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <p className="text-sm text-secondary">{t("attendancePage.monthlyHeatmapPlaceholder")}</p>
        </div>
      )}

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
                    <td className="px-5 py-3 text-sm text-secondary">
                      {formatDate(leave.startDate, locale)}
                    </td>
                    <td className="px-5 py-3 text-sm text-secondary">
                      {formatDate(leave.endDate, locale)}
                    </td>
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
    </div>
  );
}
