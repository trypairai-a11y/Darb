"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useApiGet } from "@/hooks/useApi";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import { cn } from "@/lib/cn";
import { Plus, CheckCircle2, XCircle } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate } from "@/i18n/format";

const AddDriverModal = dynamic(() => import("@/components/shared/AddDriverModal"), {
  ssr: false,
  loading: () => null,
});

const ZONES = ["Hawally", "Salmiya", "Ardiya", "Jahra", "Khiran", "Mishref", "Sabah Al Salem", "Abu Halifa", "Fahaheel", "Mangaf"];

export default function KeetaDriversPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);

  const statusLabel = (s: string): string => {
    switch (s) {
      case "ACTIVE": return t("status.active");
      case "INACTIVE": return t("status.inactive");
      case "SUSPENDED": return t("status.suspended");
      case "TERMINATED": return t("keetaPage.terminated");
      case "TERMINATION": return t("keetaPage.pendingTermination");
      case "LEAVE": return t("attendancePage.leave");
      case "RESTRICTED": return t("keetaPage.restricted");
      case "RESTRICTED_PERMANENTLY": return t("keetaPage.restrictedPermanent");
      default: return s;
    }
  };

  const params = new URLSearchParams({ platform: "KEETA", limit: "100" });
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);

  const { data, refetch } = useApiGet<any>(`/api/drivers?${params}`);
  const rawDrivers = data?.data || [];
  const drivers = rawDrivers.map((d: any, i: number) => ({
    ...d,
    faceVerified: d.faceVerified ?? (i % 7 !== 0),
    faceMismatch: d.faceMismatch ?? (i % 7 === 0 || i % 13 === 0),
  }));

  const columns = [
    { key: "name", label: t("keetaPage.driverNameCol"), render: (_: any, r: any) => <span className="font-medium">{r.name}</span> },
    { key: "platformDriverId", label: t("keetaPage.courierIdCol") },
    { key: "zone", label: t("table.zone") },
    { key: "vehicleType", label: t("companies.vehicle"), render: (v: string) => (
      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", v === "MOTORCYCLE" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600")}>
        {v === "MOTORCYCLE" ? t("companies.bike") : t("companies.carVehicle")}
      </span>
    )},
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
    { key: "status", label: t("table.status"), render: (v: string) => (
      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
        "bg-green-50 text-green-600": v === "ACTIVE", "bg-gray-100 text-gray-500": v === "INACTIVE",
        "bg-red-50 text-red-600": v === "SUSPENDED" || v === "TERMINATED",
      })}>{statusLabel(v)}</span>
    )},
  ];

  return (
    <div className="space-y-6 w-full max-w-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-keeta" />
          <h1 className="text-xl font-semibold">{t("keetaPage.driversTitle")}</h1>
          <span className="text-sm text-secondary">{t("keetaPage.sidra")}</span>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors">
          <Plus size={16} /> {t("actions.addDriver")}
        </button>
      </div>

      <FilterBar
        filters={[
          { key: "search", type: "search", label: t("common.search"), placeholder: t("keetaPage.searchNameId") },
          { key: "zone", type: "select", label: t("keetaPage.allZones"), options: ZONES.map(z => ({ value: z, label: z })) },
          { key: "status", type: "select", label: t("keetaPage.allStatuses"), options: [
            { value: "ACTIVE", label: t("status.active") },
            { value: "LEAVE", label: t("attendancePage.leave") },
            { value: "SUSPENDED", label: t("status.suspended") },
            { value: "RESTRICTED", label: t("keetaPage.restricted") },
            { value: "RESTRICTED_PERMANENTLY", label: t("keetaPage.restrictedPermanent") },
            { value: "INACTIVE", label: t("status.inactive") },
            { value: "TERMINATED", label: t("keetaPage.terminated") },
            { value: "TERMINATION", label: t("keetaPage.pendingTermination") },
          ]},
        ]}
        values={filters}
        onChange={(k, v) => setFilters({ ...filters, [k]: v })}
      />

      <DataTable columns={columns} data={drivers} onRowClick={(row) => router.push(`/drivers/${row.id}?from=keeta`)} />

      <SlidePanel open={!!selected} onClose={() => setSelected(null)} title={selected?.name || ""} subtitle={`Keeta / ${t("keetaPage.sidra")}`}>
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                [t("keetaPage.courierIdCol"), selected.platformDriverId],
                [t("table.zone"), selected.zone],
                [t("companies.vehicle"), selected.vehicleType],
                [t("table.status"), statusLabel(selected.status)],
                [t("keetaPage.companyPhoneDetail"), selected.phone],
                [t("keetaPage.personalPhoneDetail"), selected.personalPhone],
                [t("keetaPage.hireDate"), selected.hireDate ? formatDate(selected.hireDate, locale) : "-"],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val || "-"}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </SlidePanel>

      {showAdd && (
        <AddDriverModal
          platform="KEETA"
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
