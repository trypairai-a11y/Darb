"use client";

import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import api from "@/lib/api";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import StatCard from "@/components/shared/StatCard";
import { cn } from "@/lib/cn";
import { cleanDriverName } from "@/lib/formatters";
import { useRouter } from "next/navigation";
import type { Platform, Violation } from "@/types/api";
import { PageSkeleton } from "@/components/shared/Skeleton";
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ExternalLink,
  Plus,
} from "lucide-react";
import CreateAmericanaViolationModal from "./CreateAmericanaViolationModal";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import { formatDate, formatTime, formatDateTime } from "@/i18n/format";
import {
  getMockAmericanaViolations,
  getMockAmericanaSummary,
  filterMockAmericanaViolations,
} from "@/lib/mockAmericanaViolations";

type ViolationTab =
  | "ALL"
  | "LATE_PICKUP"
  | "ORDER_REJECTION_TIMEOUT"
  | "DROP_OFF_IN_ADVANCE"
  | "ORDER_SLIGHTLY_LATE"
  | "ORDER_VERY_LATE"
  | "INVALID_DELIVERY_PHOTO"
  | "GPS_NOT_UPLOADING"
  | "DELIVEROO_UNASSIGNED_ORDER"
  | "AMERICANA_LATE_ARRIVAL"
  | "AMERICANA_NO_SHOW"
  | "AMERICANA_EARLY_DEPARTURE_QUIT";

const TYPE_COLORS: Record<string, string> = {
  LATE_PICKUP: "bg-amber-50 text-amber-600",
  ORDER_REJECTION_TIMEOUT: "bg-purple-50 text-purple-600",
  DROP_OFF_IN_ADVANCE: "bg-red-50 text-red-600",
  ORDER_SLIGHTLY_LATE: "bg-yellow-50 text-yellow-600",
  ORDER_VERY_LATE: "bg-red-100 text-red-700",
  INVALID_DELIVERY_PHOTO: "bg-blue-50 text-blue-600",
  GPS_NOT_UPLOADING: "bg-orange-50 text-orange-600",
  DELIVEROO_UNASSIGNED_ORDER: "bg-pink-50 text-pink-700",
  AMERICANA_LATE_ARRIVAL: "bg-amber-50 text-amber-600",
  AMERICANA_NO_SHOW: "bg-red-50 text-red-600",
  AMERICANA_EARLY_DEPARTURE_QUIT: "bg-purple-50 text-purple-600",
};

const STATUS_COLORS: Record<string, string> = {
  ESTABLISHED: "bg-red-50 text-red-600",
  UNDER_REVIEW: "bg-amber-50 text-amber-600",
  OVERTURNED: "bg-green-50 text-green-600",
  EXPIRED: "bg-gray-100 text-gray-500",
};

const APPEAL_COLORS: Record<string, string> = {
  NOT_RAISED: "bg-gray-100 text-gray-500",
  PENDING: "bg-amber-50 text-amber-600",
  APPROVED: "bg-green-50 text-green-600",
  REJECTED: "bg-red-50 text-red-600",
};

const PLATFORM_DOT: Record<string, string> = {
  KEETA: "bg-keeta",
  TALABAT: "bg-talabat",
  DELIVEROO: "bg-deliveroo",
  AMERICANA: "bg-americana",
};

const PLATFORM_ACCENT: Record<string, { btn: string; text: string }> = {
  KEETA: { btn: "bg-keeta/10 text-keeta hover:bg-keeta/20", text: "text-keeta" },
  TALABAT: { btn: "bg-talabat/10 text-talabat hover:bg-talabat/20", text: "text-talabat" },
  DELIVEROO: { btn: "bg-deliveroo/10 text-deliveroo hover:bg-deliveroo/20", text: "text-deliveroo" },
  AMERICANA: { btn: "bg-americana/10 text-americana hover:bg-americana/20", text: "text-americana" },
};

const PLATFORM_LABELS: Record<string, string> = {
  KEETA: "Keeta",
  TALABAT: "Talabat",
  DELIVEROO: "Deliveroo",
  AMERICANA: "Americana",
};

interface ViolationsPageProps {
  platform: Platform;
}

export default function ViolationsPage({ platform }: ViolationsPageProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<ViolationTab>(
    platform === "DELIVEROO" ? "DELIVEROO_UNASSIGNED_ORDER" : "ALL"
  );
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Violation | null>(null);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const limit = 50;

  const violationTypeLabel = (type: string): string => {
    switch (type) {
      case "LATE_PICKUP": return t("violationTypes.latePickup");
      case "ORDER_REJECTION_TIMEOUT": return t("violationTypes.rejectionTimeout");
      case "DROP_OFF_IN_ADVANCE": return t("violationTypes.dropOffAdvance");
      case "ORDER_SLIGHTLY_LATE": return t("violationTypes.orderSlightlyLate");
      case "ORDER_VERY_LATE": return t("violationTypes.orderVeryLate");
      case "INVALID_DELIVERY_PHOTO": return t("violationTypes.invalidPhoto");
      case "GPS_NOT_UPLOADING": return t("violationTypes.gpsNotUploading");
      case "DELIVEROO_UNASSIGNED_ORDER": return t("violationTypes.unassigned");
      case "AMERICANA_LATE_ARRIVAL": return t("violationTypes.lateArrival");
      case "AMERICANA_NO_SHOW": return t("violationTypes.noShow");
      case "AMERICANA_EARLY_DEPARTURE_QUIT": return t("violationTypes.earlyQuit");
      default: return (type || "").replace(/_/g, " ");
    }
  };
  const vStatusLabel = (s: string): string => {
    switch (s) {
      case "ESTABLISHED": return t("violationStatuses.established");
      case "UNDER_REVIEW": return t("violationStatuses.underReview");
      case "OVERTURNED": return t("violationStatuses.overturned");
      case "EXPIRED": return t("violationStatuses.expired");
      default: return s;
    }
  };
  const aStatusLabel = (s: string): string => {
    switch (s) {
      case "NOT_RAISED": return t("appealStatuses.notRaised");
      case "PENDING": return t("appealStatuses.pending");
      case "APPROVED": return t("appealStatuses.approved");
      case "REJECTED": return t("appealStatuses.rejected");
      default: return s;
    }
  };

  const BASE_VIOLATION_TABS: { key: ViolationTab; label: string }[] = [
    { key: "ALL", label: t("labels.all") },
    { key: "LATE_PICKUP", label: t("violationTypes.latePickup") },
    { key: "ORDER_REJECTION_TIMEOUT", label: t("violationTypes.rejectionTimeout") },
    { key: "DROP_OFF_IN_ADVANCE", label: t("violationTypes.dropOffAdvance") },
    { key: "ORDER_SLIGHTLY_LATE", label: t("violationTypes.orderSlightlyLate") },
    { key: "ORDER_VERY_LATE", label: t("violationTypes.orderVeryLate") },
    { key: "INVALID_DELIVERY_PHOTO", label: t("violationTypes.invalidPhoto") },
    { key: "GPS_NOT_UPLOADING", label: t("violationTypes.gpsNotUploading") },
  ];

  const DELIVEROO_UNASSIGNED_TAB: { key: ViolationTab; label: string } = {
    key: "DELIVEROO_UNASSIGNED_ORDER",
    label: t("violationTypes.unassigned"),
  };

  const AMERICANA_TABS: { key: ViolationTab; label: string }[] = [
    { key: "AMERICANA_LATE_ARRIVAL", label: t("violationTypes.lateArrival") },
    { key: "AMERICANA_NO_SHOW", label: t("violationTypes.noShow") },
    { key: "AMERICANA_EARLY_DEPARTURE_QUIT", label: t("violationTypes.earlyQuit") },
  ];

  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
    platform,
  });
  if (tab !== "ALL") params.set("violationType", tab);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);
  if (filters.violationStatus) params.set("violationStatus", filters.violationStatus);
  if (filters.appealStatus) params.set("appealStatus", filters.appealStatus);

  const { data: summaryData, refetch: refetchSummary } = useApiGet<any>(
    `/api/violations/summary?platform=${platform}`
  );
  const { data, loading, refetch: refetchList } = useApiGet<any>(`/api/violations?${params}`);
  const [rootCauseBusy, setRootCauseBusy] = useState(false);

  const setRootCause = async (violationId: string, rootCause: string) => {
    setRootCauseBusy(true);
    try {
      const resp = await api.patch(`/api/violations/${violationId}/root-cause`, { rootCause });
      setSelected((prev) => (prev && prev.id === violationId ? { ...prev, metadata: resp.data.metadata } : prev));
      refetchList();
    } catch {
      /* no-op */
    } finally {
      setRootCauseBusy(false);
    }
  };

  const apiViolations: Violation[] = data?.data || [];
  const apiPagination = data?.pagination;
  const apiTotal = summaryData?.total || 0;

  // Demo fallback: when Americana has no real data, populate from mocks.
  // Only kicks in once the summary has loaded and confirmed total=0, so real data wins.
  const summaryLoaded = summaryData != null;
  const useMock = platform === "AMERICANA" && summaryLoaded && apiTotal === 0;

  const allMock = useMock ? getMockAmericanaViolations() : [];
  const filteredMock = useMock
    ? filterMockAmericanaViolations(allMock, {
        violationType: tab !== "ALL" ? tab : undefined,
        violationStatus: filters.violationStatus,
        appealStatus: filters.appealStatus,
        search: filters.search,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      })
    : [];

  const mockSummary = useMock ? getMockAmericanaSummary() : null;

  const violations: Violation[] = useMock
    ? filteredMock.slice((page - 1) * limit, page * limit)
    : apiViolations;

  const pagination = useMock
    ? {
        page,
        limit,
        total: filteredMock.length,
        totalPages: Math.max(1, Math.ceil(filteredMock.length / limit)),
      }
    : apiPagination;

  const byType = useMock ? mockSummary!.byType : summaryData?.byType || [];
  const totalCount = useMock ? mockSummary!.total : apiTotal;
  const pendingAppeals = useMock ? mockSummary!.pendingAppeals : summaryData?.pendingAppeals || 0;
  const established = useMock
    ? mockSummary!.byStatus.find((s: any) => s.status === "ESTABLISHED")?.count || 0
    : summaryData?.byStatus?.find((s: any) => s.status === "ESTABLISHED")?.count || 0;
  const overturned = useMock
    ? mockSummary!.byStatus.find((s: any) => s.status === "OVERTURNED")?.count || 0
    : summaryData?.byStatus?.find((s: any) => s.status === "OVERTURNED")?.count || 0;

  const tabCounts: Record<ViolationTab, number> = {
    ALL: totalCount,
    LATE_PICKUP: byType.find((tt: any) => tt.type === "LATE_PICKUP")?.count || 0,
    ORDER_REJECTION_TIMEOUT:
      byType.find((tt: any) => tt.type === "ORDER_REJECTION_TIMEOUT")?.count || 0,
    DROP_OFF_IN_ADVANCE:
      byType.find((tt: any) => tt.type === "DROP_OFF_IN_ADVANCE")?.count || 0,
    ORDER_SLIGHTLY_LATE:
      byType.find((tt: any) => tt.type === "ORDER_SLIGHTLY_LATE")?.count || 0,
    ORDER_VERY_LATE: byType.find((tt: any) => tt.type === "ORDER_VERY_LATE")?.count || 0,
    INVALID_DELIVERY_PHOTO:
      byType.find((tt: any) => tt.type === "INVALID_DELIVERY_PHOTO")?.count || 0,
    GPS_NOT_UPLOADING:
      byType.find((tt: any) => tt.type === "GPS_NOT_UPLOADING")?.count || 0,
    DELIVEROO_UNASSIGNED_ORDER:
      byType.find((tt: any) => tt.type === "DELIVEROO_UNASSIGNED_ORDER")?.count || 0,
    AMERICANA_LATE_ARRIVAL:
      byType.find((tt: any) => tt.type === "AMERICANA_LATE_ARRIVAL")?.count || 0,
    AMERICANA_NO_SHOW:
      byType.find((tt: any) => tt.type === "AMERICANA_NO_SHOW")?.count || 0,
    AMERICANA_EARLY_DEPARTURE_QUIT:
      byType.find((tt: any) => tt.type === "AMERICANA_EARLY_DEPARTURE_QUIT")?.count || 0,
  };

  const VIOLATION_TABS =
    platform === "DELIVEROO"
      ? [DELIVEROO_UNASSIGNED_TAB]
      : platform === "AMERICANA"
      ? [{ key: "ALL" as ViolationTab, label: t("labels.all") }, ...AMERICANA_TABS]
      : BASE_VIOLATION_TABS;

  const platformLabel = PLATFORM_LABELS[platform] || platform;
  const platformDot = PLATFORM_DOT[platform] || "bg-gray-400";
  const accent = PLATFORM_ACCENT[platform] || PLATFORM_ACCENT.KEETA;
  const platformBasePath = platformLabel.toLowerCase();

  const totalPages = pagination?.totalPages || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className={cn("w-3 h-3 rounded-full", platformDot)} />
        <h1 className="text-xl font-semibold">{platformLabel}</h1>
        <span className="text-secondary/30 text-lg font-light">/</span>
        <span className="text-xl text-secondary font-medium">{t("violationsPage.pageTitle")}</span>
        {platform === "AMERICANA" && (
          <button
            onClick={() => setCreateOpen(true)}
            className={cn(
              "ms-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              accent.btn
            )}
          >
            <Plus size={14} />
            {locale === "ar" ? "إنشاء مخالفة" : "Create Violation"}
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title={t("violationsPage.totalViolations")} value={totalCount} icon={ShieldAlert} />
        <StatCard title={t("violationStatuses.established")} value={established} icon={AlertTriangle} />
        <StatCard title={t("violationsPage.pendingAppeals")} value={pendingAppeals} icon={Clock} />
        <StatCard title={t("violationsPage.overturned")} value={overturned} icon={CheckCircle2} />
      </div>

      {/* Type Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit overflow-x-auto">
        {VIOLATION_TABS.map((tabEntry) => (
          <button
            key={tabEntry.key}
            onClick={() => { setTab(tabEntry.key); setPage(1); }}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
              tab === tabEntry.key
                ? "bg-white text-foreground shadow-sm"
                : "text-secondary hover:text-foreground"
            )}
          >
            {tabEntry.label}
            {tabCounts[tabEntry.key] > 0 && (
              <span
                className={cn(
                  "ms-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold min-w-[20px] text-center",
                  tab === tabEntry.key
                    ? "bg-foreground/10 text-foreground"
                    : "bg-gray-200/70 text-secondary"
                )}
              >
                {tabCounts[tabEntry.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <FilterBar
        filters={[
          {
            key: "search",
            type: "search",
            label: t("common.search"),
            placeholder: t("violationsPage.searchCourierPlaceholder"),
          },
          {
            key: "violationStatus",
            type: "select",
            label: t("violationsPage.allStatuses"),
            options: [
              { value: "ESTABLISHED", label: t("violationStatuses.established") },
              { value: "UNDER_REVIEW", label: t("violationStatuses.underReview") },
              { value: "OVERTURNED", label: t("violationStatuses.overturned") },
              { value: "EXPIRED", label: t("violationStatuses.expired") },
            ],
          },
          {
            key: "appealStatus",
            type: "select",
            label: t("violationsPage.allAppeals"),
            options: [
              { value: "NOT_RAISED", label: t("appealStatuses.notRaised") },
              { value: "PENDING", label: t("appealStatuses.pending") },
              { value: "APPROVED", label: t("appealStatuses.approved") },
              { value: "REJECTED", label: t("appealStatuses.rejected") },
            ],
          },
          { key: "dateFrom", type: "dateRange", label: t("violationsPage.dateRange"), toKey: "dateTo" },
        ]}
        values={filters}
        onChange={(k, v) => {
          setFilters((prev) => ({ ...prev, [k]: v }));
          setPage(1);
        }}
        onClear={() => { setFilters({}); setPage(1); }}
        defaultValues={{}}
      />

      {/* Loading State */}
      {loading && violations.length === 0 && (
        <PageSkeleton statCards={0} tableRows={8} tableCols={9} />
      )}

      {/* Table */}
      {(!loading || violations.length > 0) && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.id")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("violationsPage.violationsHeader")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("violationsPage.taskIdHeader")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("violationsPage.courierHeader")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("violationsPage.vehicleHeader")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("violationsPage.violationTimeHeader")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.status")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("violationsPage.appealHeader")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {violations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-sm text-secondary">
                      {t("violationsPage.noViolationsFound")}
                    </td>
                  </tr>
                ) : (
                  violations.map((v) => (
                    <tr
                      key={v.id}
                      onClick={() => setSelected(v)}
                      className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-5 py-3 text-xs text-secondary font-mono">
                        {v.id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-md font-medium",
                            TYPE_COLORS[v.violationType] || "bg-gray-100 text-gray-600"
                          )}
                        >
                          {violationTypeLabel(v.violationType)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-secondary font-mono">
                        {v.taskId ? v.taskId.slice(0, 8) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium">
                          {cleanDriverName(v.driver?.name) || "—"}
                        </p>
                        <p className="text-xs text-secondary">
                          {v.driver?.platformDriverId || ""}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-sm">
                        {v.driver?.vehicleType || "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-secondary font-mono">
                        {v.violationTime ? formatDate(v.violationTime, locale, { month: "short", day: "numeric" }) : "—"}
                        <br />
                        <span className="text-xs">
                          {v.violationTime ? formatTime(v.violationTime, locale) : ""}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-md font-medium",
                            STATUS_COLORS[v.violationStatus] || "bg-gray-100"
                          )}
                        >
                          {vStatusLabel(v.violationStatus)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {(() => {
                          const second = v.secondAppealStatus && v.secondAppealStatus !== "NOT_RAISED";
                          const status = second ? v.secondAppealStatus : v.firstAppealStatus || v.appealStatus;
                          return (
                            <div className="flex items-center gap-1">
                              <span
                                className={cn(
                                  "text-xs px-2 py-0.5 rounded-md font-medium",
                                  APPEAL_COLORS[status] || "bg-gray-100"
                                )}
                              >
                                {aStatusLabel(status)}
                              </span>
                              {second && (
                                <span className="text-[9px] font-bold text-secondary bg-gray-100 px-1 rounded">
                                  {t("violationsPage.secondShort")}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3">
                        <DirectionalIcon kind="chevron-forward" size={14} className="text-secondary" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50">
              <p className="text-xs text-secondary">
                {t("violationsPage.pageOf").replace("{current}", String(page)).replace("{total}", String(totalPages))}
                {pagination?.total != null && (
                  <span className="ms-1">({pagination.total} {t("violationsPage.totalSuffix")})</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t("actions.previous")}
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t("actions.next")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail SlidePanel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? violationTypeLabel(selected.violationType) : ""}
        subtitle={selected?.id ? `${t("table.id")} ${selected.id.slice(0, 8)}` : ""}
      >
        {selected && (
          <div className="space-y-6">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">{t("table.status")}</p>
                <span className={cn("text-xs px-2 py-0.5 rounded-md font-medium", STATUS_COLORS[selected.violationStatus])}>
                  {vStatusLabel(selected.violationStatus)}
                </span>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">{t("violationsPage.firstAppeal")}</p>
                <span className={cn("text-xs px-2 py-0.5 rounded-md font-medium", APPEAL_COLORS[selected.firstAppealStatus || "NOT_RAISED"])}>
                  {aStatusLabel(selected.firstAppealStatus || "NOT_RAISED")}
                </span>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">{t("violationsPage.secondAppeal")}</p>
                <span className={cn("text-xs px-2 py-0.5 rounded-md font-medium", APPEAL_COLORS[selected.secondAppealStatus || "NOT_RAISED"])}>
                  {aStatusLabel(selected.secondAppealStatus || "NOT_RAISED")}
                </span>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">{t("violationsPage.courierHeader")}</p>
                <p className="text-sm font-medium">
                  {cleanDriverName(selected.driver?.name) || "—"}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">{t("violationsPage.vehicleHeader")}</p>
                <p className="text-sm font-medium">
                  {selected.driver?.vehicleType || "—"}
                </p>
              </div>
              <div className="col-span-2 bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">{t("violationsPage.timeField")}</p>
                <p className="text-sm font-medium">
                  {selected.violationTime ? formatDateTime(selected.violationTime, locale) : "—"}
                </p>
              </div>
            </div>

            {/* Description */}
            {selected.details && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium mb-1">
                  {t("violationsPage.details")}
                </p>
                <p className="text-sm">{selected.details}</p>
              </div>
            )}

            {/* Root-cause picker */}
            {selected.violationType === "DELIVEROO_UNASSIGNED_ORDER" && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium mb-2">
                  {t("violationsPage.rootCause")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["NO_RIDER_IN_ZONE", t("violationsPage.rcNoRiderInZone")],
                      ["ALL_RIDERS_BUSY", t("violationsPage.rcAllRidersBusy")],
                      ["ALL_REJECTED", t("violationsPage.rcAllRejected")],
                      ["SYSTEM_ERROR", t("violationsPage.rcSystemError")],
                      ["UNKNOWN", t("violationsPage.rcUnknown")],
                    ] as const
                  ).map(([code, label]) => {
                    const current =
                      ((selected.metadata as any) ?? {}).rootCause ?? "UNKNOWN";
                    const active = current === code;
                    return (
                      <button
                        key={code}
                        disabled={rootCauseBusy}
                        onClick={() => setRootCause(selected.id, code)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                          active
                            ? "bg-foreground text-white border-foreground"
                            : "bg-white text-secondary border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {(selected.metadata as any)?.zone && (
                  <p className="text-xs text-secondary mt-2">
                    {t("violationsPage.zone")}:{" "}
                    <span className="font-medium text-foreground">
                      {(selected.metadata as any).zone}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Penalties */}
            {selected.penalties && selected.penalties.length > 0 && (
              <div>
                <p className="text-[10px] text-secondary uppercase font-medium mb-2">
                  {t("violationsPage.penalties")}
                </p>
                <div className="space-y-2">
                  {selected.penalties.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between bg-gray-50 rounded-xl p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {(p.penaltyType || "").replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-secondary">{p.penaltyStatus}</p>
                      </div>
                      {p.penaltyValue && (
                        <span className="text-xs font-mono text-secondary">
                          {p.penaltyValue}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Appeals */}
            {selected.appeals && selected.appeals.length > 0 && (
              <div>
                <p className="text-[10px] text-secondary uppercase font-medium mb-2">
                  {t("violationsPage.appealHistory")}
                </p>
                <div className="space-y-2">
                  {selected.appeals.map((a) => (
                    <div key={a.id} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-secondary bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                            {a.appealLevel === 2 ? t("violationsPage.secondAppealBadge") : t("violationsPage.firstAppealBadge")}
                          </span>
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded-md font-medium",
                              APPEAL_COLORS[a.appealStatus] || "bg-gray-100"
                            )}
                          >
                            {aStatusLabel(a.appealStatus)}
                          </span>
                        </div>
                        {a.channel && (
                          <span className="text-xs text-secondary">{a.channel}</span>
                        )}
                      </div>
                      {a.reason && <p className="text-sm mt-1">{a.reason}</p>}
                      {a.rejectionNote && (
                        <p className="text-xs text-red-500 mt-1">{a.rejectionNote}</p>
                      )}
                      <p className="text-xs text-secondary mt-1">
                        {formatDateTime(a.appealedAt, locale)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* View full details link */}
            <button
              onClick={() => {
                setSelected(null);
                router.push(`/${platformBasePath}/violations/${selected.id}`);
              }}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors",
                accent.btn
              )}
            >
              <ExternalLink size={14} />
              {t("violationsPage.viewFullDetails")}
            </button>
          </div>
        )}
      </SlidePanel>

      {createOpen && platform === "AMERICANA" && (
        <CreateAmericanaViolationModal
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            setPage(1);
            refetchList();
            refetchSummary();
          }}
        />
      )}
    </div>
  );
}
