"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useApiGet } from "@/hooks/useApi";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import StatCard from "@/components/shared/StatCard";
import { cn } from "@/lib/cn";
import { cleanDriverName } from "@/lib/formatters";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { Plus, Users, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, TrendingUp, Package } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate } from "@/i18n/format";

const AddDriverModal = dynamic(() => import("@/components/shared/AddDriverModal"), {
  ssr: false,
  loading: () => null,
});

const TALABAT_ZONES = [
  "Ardiya", "Hawally", "Mahboula", "Khairan", "Jahra", "Mutla", "Sabha Al Saleem",
];

const BATCH_NUMBERS = ["1", "2", "3", "4", "5", "6", "7"];

const DOC_STATUS_COLORS: Record<string, string> = {
  VALID: "bg-green-50 text-green-600",
  EXPIRING: "bg-yellow-50 text-yellow-600",
  EXPIRED: "bg-red-50 text-red-600",
  MISSING: "bg-gray-100 text-gray-500",
};

export default function TalabatDriversPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);

  const talabatStatusLabel = (v: string): string => {
    switch (v) {
      case "ONLINE": return t("talabat.onlineStatus");
      case "OFFLINE": return t("talabat.offlineStatus");
      case "RESTRICTED": return t("talabat.restrictedStatus");
      case "PERMANENTLY_RESTRICTED": return t("talabat.permanentlyRestricted");
      default: return v || "—";
    }
  };

  const docStatusLabel = (v: string): string => {
    switch (v) {
      case "VALID": return t("status.active");
      case "EXPIRING": return t("overview.aboveTarget");
      case "EXPIRED": return t("violationStatuses.expired");
      case "MISSING": return t("talabat.missingDoc");
      default: return v || t("talabat.missingDoc");
    }
  };

  const { data: companiesData } = useApiGet<any>("/api/companies?platform=TALABAT");
  const companies = companiesData?.data || [];

  const params = new URLSearchParams({ platform: "TALABAT", limit: "100" });
  if (filters.company) params.set("companyId", filters.company);
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.status) params.set("status", filters.status);
  if (filters.batch) params.set("batchNumber", filters.batch);
  if (filters.search) params.set("search", filters.search);
  if (filters.tier) params.set("performanceTier", filters.tier);

  const summaryParams = new URLSearchParams({ platform: "TALABAT" });
  if (filters.company) summaryParams.set("companyId", filters.company);

  const { data, refetch, loading } = useApiGet<any>(`/api/drivers?${params}`);
  const { data: summary } = useApiGet<any>(`/api/drivers/summary?${summaryParams}`);
  const rawDrivers = data?.data || [];
  const drivers = rawDrivers.map((d: any) => ({
    ...d,
    faceVerified: d.faceVerified ?? null,
    faceMismatch: d.faceMismatch ?? null,
  }));

  const columns = [
    {
      key: "name",
      label: t("talabat.nameCol"),
      render: (_: any, r: any) => {
        const raw = r.talabatDisplayName || r.name || "";
        return (
          <span className="font-medium font-mono text-sm">
            {cleanDriverName(raw)}
          </span>
        );
      },
    },
    {
      key: "batchNumber",
      label: t("platform.batch"),
      render: (v: string) => (
        <span className="font-medium text-sm tabular-nums">
          {v ? v.replace(/[A-Za-z]/g, "") : "-"}
        </span>
      ),
    },
    {
      key: "company",
      label: t("talabat.companyHeader"),
      render: (_: any, r: any) => {
        if (r.company?.name) return <span className="text-sm text-secondary">{r.company.name}</span>;
        const raw = r.talabatDisplayName || r.name || "";
        const m = raw.match(/\d+[A-Z]?\s*[-–—]+\s*(\w+)$/i);
        return <span className="text-sm text-secondary">{m?.[1] || "-"}</span>;
      },
    },
    {
      key: "dailyOrders",
      label: t("talabat.dailyOrders"),
      render: (v: number) => (
        <span className="font-medium text-sm tabular-nums">
          {v ?? 0}
        </span>
      ),
    },
    {
      key: "uti",
      label: t("overview.utr"),
      headerTitle: t("talabat.utrHeaderTitle"),
      render: (v: number) => (
        <span className={cn("font-medium text-sm tabular-nums", {
          "text-green-600": v != null && v >= 1.0,
          "text-yellow-600": v != null && v >= 0.5 && v < 1.0,
          "text-red-600": v != null && v < 0.5,
        })}>
          {v != null ? v.toFixed(2) : "-"}
        </span>
      ),
    },
    {
      key: "vehicleType",
      label: t("talabat.vehicleTypeCol"),
      render: (v: string) => (
        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
          "bg-blue-50 text-blue-600": v === "MOTORCYCLE",
          "bg-purple-50 text-purple-600": v === "CAR",
        })}>
          {v === "MOTORCYCLE" ? t("companies.bike") : v === "CAR" ? t("companies.carVehicle") : v || "-"}
        </span>
      ),
    },
    { key: "zone", label: t("table.zone") },
    {
      key: "faceVerified",
      label: t("keetaPage.face"),
      render: (_: any, r: any) => {
        if (r.faceMismatch === true) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-600">
              <AlertTriangle size={13} /> {t("keetaPage.faceMismatch")}
            </span>
          );
        }
        if (r.faceVerified === true) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-50 text-green-600">
              <CheckCircle2 size={13} /> {t("keetaPage.faceSuccess")}
            </span>
          );
        }
        if (r.faceVerified === false) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-600">
              <XCircle size={13} /> {t("keetaPage.faceFailed")}
            </span>
          );
        }
        return <span className="text-xs text-secondary">-</span>;
      },
    },
    {
      key: "depositCount",
      label: t("keetaPage.deposits"),
      render: (v: number) => (
        <span className="font-medium text-sm tabular-nums">{v ?? 0}</span>
      ),
    },
    {
      key: "phone",
      label: t("table.phone"),
      render: (v: string) => (
        <span className="font-mono text-sm text-secondary">
          {v || "-"}
        </span>
      ),
    },
    {
      key: "talabatStatus",
      label: t("table.status"),
      render: (v: string) => {
        const cfg: Record<string, { cls: string; label: string; dot?: string }> = {
          ONLINE:                 { cls: "bg-green-50 text-green-700",   label: t("talabat.onlineStatus"),          dot: "bg-green-500" },
          OFFLINE:                { cls: "bg-gray-100 text-gray-500",    label: t("talabat.offlineStatus"),         dot: "bg-gray-400" },
          RESTRICTED:             { cls: "bg-amber-50 text-amber-700",   label: t("talabat.restrictedStatus"),      dot: "bg-amber-500" },
          PERMANENTLY_RESTRICTED: { cls: "bg-red-100 text-red-700",      label: t("talabat.permRestrictedShort"),   dot: "bg-red-600" },
        };
        const s = cfg[v] || { cls: "bg-gray-100 text-gray-500", label: v || "—", dot: "bg-gray-400" };
        return (
          <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium", s.cls)}>
            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", s.dot)} />
            {s.label}
          </span>
        );
      },
    },
  ];

  if (loading && !data) {
    return (
      <div className="space-y-6 w-full">
        <PageSkeleton statCards={4} tableRows={8} tableCols={10} />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-talabat" />
          <h1 className="text-xl font-semibold">{t("talabat.driversTitle")}</h1>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} /> {t("actions.addDriver")}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title={t("overview.totalDrivers")} value={summary?.total || drivers.length} icon={Users} />
        <StatCard title={t("americana.active")} value={summary?.active || 0} icon={ShieldCheck} />
        <StatCard title={t("talabat.avgUtrToday")} value={summary?.avgUtrToday ? Number(summary.avgUtrToday).toFixed(1) : "0.0"} icon={TrendingUp} />
        <StatCard title={t("talabat.totalOrdersToday")} value={summary?.totalOrdersToday || 0} icon={Package} />
      </div>

      {/* Filters */}
      <FilterBar
        filters={[
          { key: "search", type: "search", label: t("common.search"), placeholder: t("talabat.searchTalabatId") },
          { key: "company", type: "multi-select", label: t("talabat.allCompanies"), options: companies.map((c: any) => ({ value: c.id, label: c.name })) },
          { key: "zone", type: "multi-select", label: t("talabat.allZones"), options: TALABAT_ZONES.map(z => ({ value: z, label: z })) },
          { key: "batch", type: "multi-select", label: t("talabat.allBatches"), options: BATCH_NUMBERS.map(b => ({ value: b, label: b })) },
          {
            key: "status", type: "multi-select", label: t("keetaPage.allStatuses"), options: [
              { value: "ACTIVE,INACTIVE", label: t("talabat.onlineOffline") },
              { value: "ACTIVE", label: t("status.active") },
              { value: "LEAVE", label: t("attendancePage.leave") },
              { value: "SUSPENDED", label: t("status.suspended") },
              { value: "RESTRICTED", label: t("keetaPage.restricted") },
              { value: "RESTRICTED_PERMANENTLY", label: t("talabat.permanentlyRestricted") },
              { value: "INACTIVE", label: t("status.inactive") },
              { value: "TERMINATED", label: t("keetaPage.terminated") },
              { value: "TERMINATION", label: t("keetaPage.pendingTermination") },
            ]
          },
          {
            key: "tier", type: "multi-select", label: t("talabat.performanceTier"), options: [
              { value: "GOLD", label: t("talabat.gold") },
              { value: "SILVER", label: t("talabat.silver") },
              { value: "BRONZE", label: t("talabat.bronze") },
              { value: "WATCHLIST", label: t("talabat.watchlist") },
            ]
          },
        ]}
        values={filters}
        onChange={(k, v) => setFilters({ ...filters, [k]: v })}
      />

      <DataTable columns={columns} data={drivers} onRowClick={(row) => router.push(`/drivers/${row.id}?from=talabat`)} emptyMessage={t("talabat.noTalabatDriversFound")} />

      {/* Driver Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={cleanDriverName(selected?.talabatDisplayName || selected?.name || "")}
        subtitle={`Talabat / ${selected?.company?.name || "-"}`}
      >
        {selected && (
          <div className="space-y-5">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3">
              {[
                [t("talabat.talabatIdField"), selected.platformDriverId],
                [t("platform.batch"), selected.batchNumber],
                [t("table.zone"), selected.zone],
                [t("companies.vehicle"), selected.vehicleType === "MOTORCYCLE" ? t("companies.bike") : selected.vehicleType === "CAR" ? t("companies.carVehicle") : selected.vehicleType],
                [t("table.status"), talabatStatusLabel(selected.talabatStatus) || selected.status],
                [t("americana.companyPhoneDetail"), selected.phone],
                [t("americana.personalPhoneDetail"), selected.personalPhone],
                [t("americana.hireDate"), selected.hireDate ? formatDate(selected.hireDate, locale) : "-"],
                [t("talabat.companyCodeField"), selected.companyCode || t("talabat.companyCodeDefault")],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val || "-"}</p>
                </div>
              ))}
            </div>

            {/* Talabat-Specific Documents */}
            <div>
              <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">{t("talabat.talabatDocuments")}</h3>
              <div className="space-y-2">
                {[
                  { label: t("talabat.healthCertificate"), key: "healthCertExpiry", status: selected.healthCertStatus },
                  { label: t("talabat.foodHandlingCertificate"), key: "foodHandlingCertExpiry", status: selected.foodHandlingCertStatus },
                  { label: t("talabat.vehicleRegistration"), key: "vehicleRegExpiry", status: selected.vehicleRegStatus },
                  { label: t("talabat.vehicleInsurance"), key: "vehicleInsuranceExpiry", status: selected.vehicleInsuranceStatus },
                  { label: t("talabat.drivingLicense"), key: "drivingLicenseExpiry", status: selected.drivingLicenseStatus },
                ].map(({ label, key, status }) => (
                  <div key={key} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      {selected[key] && (
                        <p className="text-xs text-secondary mt-0.5">
                          {t("talabat.expires")} {formatDate(selected[key], locale)}
                        </p>
                      )}
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", DOC_STATUS_COLORS[status || "MISSING"])}>
                      {docStatusLabel(status || "MISSING")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Vehicle Info */}
            {selected.vehicle && (
              <div>
                <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">{t("talabat.vehicleInfo")}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    [t("talabat.plate"), selected.vehicle.plateNumber],
                    [t("talabat.makeModel"), `${selected.vehicle.make} ${selected.vehicle.model}`],
                    [t("talabat.color"), selected.vehicle.color],
                    [t("talabat.year"), selected.vehicle.year],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                      <p className="text-sm font-medium mt-0.5">{val || "-"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SlidePanel>

      {/* Add Driver Modal */}
      {showAdd && (
        <AddDriverModal
          platform="TALABAT"
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
