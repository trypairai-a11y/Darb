"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import DataTable from "@/components/shared/DataTable";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import { formatTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

export default function AmericanaShiftsPage() {
  const { t, locale } = useI18n();
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));

  const params = new URLSearchParams({
    platform: "AMERICANA",
    dateFrom: date,
    dateTo: date,
    limit: "200",
  });
  const { data, loading } = useApiGet<any>(`/api/shifts?${params}`);
  const shifts: any[] = data?.data || [];

  const prevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split("T")[0]);
  };

  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().split("T")[0]);
  };

  const fmt = (v?: string | null) =>
    v ? formatTime(v, locale) : <span className="text-secondary">-</span>;

  const statusLabel = (s: string) => {
    switch (s) {
      case "ACTIVE":
        return t("status.active");
      case "COMPLETED":
        return t("status.completed");
      case "MISSED":
        return t("status.missed");
      case "SCHEDULED":
        return t("status.scheduled");
      default:
        return s || "-";
    }
  };

  const columns = [
    {
      key: "driver",
      label: t("americana.driverCol"),
      render: (_: any, row: any) => (
        <span className="text-sm font-medium">{row.driver?.name || "-"}</span>
      ),
    },
    {
      key: "zone",
      label: t("americana.branchCol"),
      render: (v: string) => (
        <span className="text-sm text-secondary">{v || "-"}</span>
      ),
    },
    {
      key: "scheduledStart",
      label: t("americana.scheduledStart"),
      render: (v: string) => <span className="text-sm">{fmt(v)}</span>,
    },
    {
      key: "scheduledEnd",
      label: t("americana.scheduledEnd"),
      render: (v: string) => <span className="text-sm">{fmt(v)}</span>,
    },
    {
      key: "actualStart",
      label: t("americana.actualStart"),
      render: (v: string) => <span className="text-sm">{fmt(v)}</span>,
    },
    {
      key: "actualEnd",
      label: t("americana.actualEnd"),
      render: (v: string) => <span className="text-sm">{fmt(v)}</span>,
    },
    {
      key: "status",
      label: t("table.status"),
      render: (v: string) => (
        <span
          className={cn(
            "px-2 py-0.5 rounded-md text-xs font-medium",
            {
              "bg-green-50 text-green-600": v === "COMPLETED",
              "bg-blue-50 text-blue-600": v === "ACTIVE",
              "bg-gray-100 text-gray-600": v === "SCHEDULED",
              "bg-red-50 text-red-600": v === "MISSED",
            }
          )}
        >
          {statusLabel(v)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-americana" />
          <h1 className="text-xl font-semibold">{t("americana.shiftsTitle")}</h1>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
          <button
            onClick={prevDay}
            className="p-1 hover:bg-gray-50 rounded-lg transition-colors"
            aria-label={t("actions.previous")}
          >
            <DirectionalIcon kind="chevron-back" size={16} />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm font-medium border-0 focus:outline-none bg-transparent"
          />
          <button
            onClick={nextDay}
            className="p-1 hover:bg-gray-50 rounded-lg transition-colors"
            aria-label={t("actions.next")}
          >
            <DirectionalIcon kind="chevron-forward" size={16} />
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={shifts}
        emptyMessage={
          loading ? t("common.loading") : t("americana.noShiftsFound")
        }
      />
    </div>
  );
}
