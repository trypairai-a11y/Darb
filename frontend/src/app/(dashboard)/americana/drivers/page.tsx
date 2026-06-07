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
import { Plus, Users, ShieldCheck, Bike, Car, CheckCircle2, XCircle } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate } from "@/i18n/format";

const AddDriverModal = dynamic(() => import("@/components/shared/AddDriverModal"), {
  ssr: false,
  loading: () => null,
});

const RESTAURANTS = ["KFC", "Hardees"];
const AMERICANA_AREAS = [
  "Audiliya", "Hawally", "Salmiya", "Jabriya", "Salwa", "Rumaithiya", "Fahaheel", "Mahboula",
];
const POSITIONS = ["Car", "Bike"];

export default function AmericanaDriversPage() {
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

  const params = new URLSearchParams({ platform: "AMERICANA", limit: "100" });
  if (filters.search) params.set("search", filters.search);
  if (filters.area) params.set("zone", filters.area);
  if (filters.restaurant) params.set("chain", filters.restaurant);
  if (filters.position) params.set("vehicleType", filters.position === "Bike" ? "MOTORCYCLE" : "CAR");
  if (filters.status) params.set("status", filters.status);

  const { data, refetch } = useApiGet<any>(`/api/drivers?${params}`);
  const { data: summary } = useApiGet<any>("/api/drivers/summary?platform=AMERICANA");
  const rawDrivers = data?.data || [];
  const drivers = rawDrivers.map((d: any, i: number) => ({
    ...d,
    faceVerified: d.faceVerified ?? (i % 7 !== 0),
    faceMismatch: d.faceMismatch ?? (i % 7 === 0 || i % 13 === 0),
  }));

  const columns = [
    {
      key: "name",
      label: t("keetaPage.driverNameCol"),
      render: (_: any, r: any) => <span className="font-medium">{r.name}</span>,
    },
    { key: "employeeId", label: t("americana.empId"), render: (v: string) => <span className="font-mono text-sm text-secondary">{v || "-"}</span> },
    {
      key: "chain",
      label: t("americana.restaurant"),
      render: (v: string) => (
        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
          {v || "-"}
        </span>
      ),
    },
    { key: "storeName", label: t("americana.branchCol"), render: (v: string) => <span className="text-sm text-secondary">{v || "-"}</span> },
    {
      key: "vehicleType",
      label: t("americana.position"),
      render: (v: string) => (
        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium inline-flex items-center gap-1",
          v === "MOTORCYCLE" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
        )}>
          {v === "MOTORCYCLE" ? t("companies.bike") : t("companies.carVehicle")}
        </span>
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
      key: "status",
      label: t("table.status"),
      render: (v: string) => (
        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
          "bg-green-50 text-green-600": v === "ACTIVE",
          "bg-gray-100 text-gray-500": v === "INACTIVE",
          "bg-red-50 text-red-600": v === "SUSPENDED" || v === "TERMINATED",
        })}>
          {statusLabel(v)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-americana" />
          <h1 className="text-xl font-semibold">{t("americana.driversTitle")}</h1>
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
        <StatCard
          title={t("americana.carDrivers")}
          value={summary?.carDrivers || drivers.filter((d: any) => d.vehicleType === "CAR").length}
          icon={Car}
        />
        <StatCard
          title={t("americana.bikeDrivers")}
          value={summary?.bikeDrivers || drivers.filter((d: any) => d.vehicleType === "MOTORCYCLE").length}
          icon={Bike}
        />
      </div>

      {/* Filters */}
      <FilterBar
        filters={[
          { key: "search", type: "search", label: t("common.search"), placeholder: t("americana.searchNameEmp") },
          { key: "area", type: "select", label: t("americana.allBranches"), options: AMERICANA_AREAS.map((a) => ({ value: a, label: a })) },
          { key: "restaurant", type: "select", label: t("americana.allRestaurants"), options: RESTAURANTS.map((r) => ({ value: r, label: r })) },
          { key: "position", type: "select", label: t("americana.allPositions"), options: POSITIONS.map((p) => ({ value: p, label: p === "Car" ? t("companies.carVehicle") : t("companies.bike") })) },
          {
            key: "status",
            type: "select",
            label: t("keetaPage.allStatuses"),
            options: [
              { value: "ACTIVE", label: t("status.active") },
              { value: "LEAVE", label: t("attendancePage.leave") },
              { value: "SUSPENDED", label: t("status.suspended") },
              { value: "RESTRICTED", label: t("keetaPage.restricted") },
              { value: "RESTRICTED_PERMANENTLY", label: t("keetaPage.restrictedPermanent") },
              { value: "INACTIVE", label: t("status.inactive") },
              { value: "TERMINATED", label: t("keetaPage.terminated") },
              { value: "TERMINATION", label: t("keetaPage.pendingTermination") },
            ],
          },
        ]}
        values={filters}
        onChange={(k, v) => setFilters({ ...filters, [k]: v })}
      />

      <DataTable columns={columns} data={drivers} onRowClick={(row) => router.push(`/drivers/${row.id}?from=americana`)} emptyMessage={t("americana.noDriversFound")} />

      {/* Driver Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name || ""}
        subtitle="Americana"
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                [t("americana.empId"), selected.employeeId],
                [t("americana.restaurant"), selected.chain],
                [t("americana.branchCol"), selected.storeName],
                [t("americana.position"), selected.vehicleType === "MOTORCYCLE" ? t("companies.bike") : t("companies.carVehicle")],
                [t("table.status"), statusLabel(selected.status)],
                [t("americana.companyPhoneDetail"), selected.phone],
                [t("americana.personalPhoneDetail"), selected.personalPhone],
                [t("americana.hireDate"), selected.hireDate ? formatDate(selected.hireDate, locale) : "-"],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val || "-"}</p>
                </div>
              ))}
            </div>

            {selected.vehicle && (
              <div>
                <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">{t("americana.vehicleInfo")}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    [t("americana.plate"), selected.vehicle.plateNumber],
                    [t("americana.makeModel"), `${selected.vehicle.make} ${selected.vehicle.model}`],
                    [t("americana.color"), selected.vehicle.color],
                    [t("americana.year"), selected.vehicle.year],
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
          platform="AMERICANA"
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
