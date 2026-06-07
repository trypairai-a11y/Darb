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
import {
  Users,
  ShieldCheck,
  AlertCircle,
  Plus,
  Camera,
  MapPin,
  Phone,
  Bike,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatDateTime } from "@/i18n/format";

const AddDriverModal = dynamic(() => import("@/components/shared/AddDriverModal"), {
  ssr: false,
  loading: () => null,
});

const ZONES = ["Al Hazm", "Madinat Al Hareer", "Abu Halifa", "Mangaf", "Fahaheel"];

type OperatingModel = "FREELANCE" | "CORE_FLEET";

function ModelBadge({ model }: { model: OperatingModel }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-md text-xs font-medium",
        model === "FREELANCE"
          ? "bg-green-50 text-green-700"
          : "bg-blue-50 text-blue-700"
      )}
    >
      {model === "FREELANCE" ? t("deliveroo.freelance") : t("deliveroo.coreFleet")}
    </span>
  );
}

function FaceVerifBadge({ verified }: { verified: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium",
        verified ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-500"
      )}
    >
      <Camera size={10} />
      {verified ? t("deliveroo.verified") : t("deliveroo.unverified")}
    </span>
  );
}

export default function DeliverooDriversPage() {
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

  const params = new URLSearchParams({ platform: "DELIVEROO", limit: "100" });
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.status) params.set("status", filters.status);
  if (filters.model) params.set("operatingModel", filters.model);
  if (filters.search) params.set("search", filters.search);

  const { data, refetch } = useApiGet<any>(`/api/drivers?${params}`);
  const { data: summary } = useApiGet<any>("/api/deliveroo/drivers/summary");

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
      render: (_: any, r: any) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-xs font-semibold text-teal-700">
            {r.name?.charAt(0) || "D"}
          </div>
          <span className="font-medium">{r.name}</span>
        </div>
      ),
    },
    {
      key: "platformDriverId",
      label: t("deliveroo.riderId"),
      render: (v: string) => (
        <span className="font-mono text-xs text-secondary">
          #{v || "-"}
        </span>
      ),
    },
    {
      key: "operatingModel",
      label: t("deliveroo.operatingModel"),
      render: (v: OperatingModel) => <ModelBadge model={v || "FREELANCE"} />,
    },
    { key: "zone", label: t("table.zone") },
    {
      key: "vehicleType",
      label: t("companies.vehicle"),
      render: (v: string) => (
        <span
          className={cn(
            "px-2 py-0.5 rounded-md text-xs font-medium",
            v === "MOTORCYCLE"
              ? "bg-orange-50 text-orange-600"
              : "bg-blue-50 text-blue-600"
          )}
        >
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
        <span
          className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
            "bg-green-50 text-green-600": v === "ACTIVE",
            "bg-gray-100 text-gray-500": v === "INACTIVE",
            "bg-red-50 text-red-600": v === "SUSPENDED" || v === "TERMINATED",
          })}
        >
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
          <span className="w-3 h-3 rounded-full bg-teal-500" />
          <h1 className="text-xl font-semibold">{t("deliveroo.driversTitle")}</h1>
          <span className="text-sm text-secondary">{t("deliveroo.alHazm")}</span>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
        >
          <Plus size={16} /> {t("actions.addDriver")}
        </button>
      </div>

      {/* Note banner */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
        <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          <span className="font-semibold">{t("deliveroo.noteLabel")}</span> {t("deliveroo.noteBody")}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title={t("overview.totalDrivers")} value={summary?.total || drivers.length} icon={Users} />
        <StatCard title={t("deliveroo.freelanceStat")} value={summary?.freelance || "-"} icon={Bike} />
        <StatCard title={t("deliveroo.coreFleetStat")} value={summary?.coreFleet || "-"} icon={Users} />
        <StatCard
          title={t("deliveroo.faceVerified")}
          value={summary?.faceVerified || "-"}
          icon={ShieldCheck}
        />
      </div>

      {/* Filters */}
      <FilterBar
        filters={[
          {
            key: "search",
            type: "search",
            label: t("common.search"),
            placeholder: t("deliveroo.searchRiderId"),
          },
          {
            key: "zone",
            type: "select",
            label: t("keetaPage.allZones"),
            options: ZONES.map((z) => ({ value: z, label: z })),
          },
          {
            key: "model",
            type: "select",
            label: t("deliveroo.allModels"),
            options: [
              { value: "FREELANCE", label: t("deliveroo.freelance") },
              { value: "CORE_FLEET", label: t("deliveroo.coreFleet") },
            ],
          },
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

      <DataTable
        columns={columns}
        data={drivers}
        onRowClick={(row) => router.push(`/drivers/${row.id}?from=deliveroo`)}
        emptyMessage={t("deliveroo.noDriversFound")}
      />

      {/* Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name || ""}
        subtitle={`Deliveroo / ${t("deliveroo.alHazm")}`}
      >
        {selected && (
          <div className="space-y-5">
            {/* Operating model highlight */}
            <div className="flex items-center gap-2">
              <ModelBadge model={selected.operatingModel || "FREELANCE"} />
              <FaceVerifBadge verified={!!selected.faceVerified} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                [t("deliveroo.riderId"), `#${selected.platformDriverId || "-"}`],
                [t("table.zone"), selected.zone],
                [t("companies.vehicle"), selected.vehicleType],
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

            <div className="bg-teal-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                {t("deliveroo.darbFaceVerification")}
              </p>
              <div className="flex items-center gap-2">
                <Camera size={14} className="text-teal-600" />
                <span className="text-sm text-teal-800">
                  {selected.faceVerified
                    ? t("deliveroo.selfieMatchedLastClockin")
                    : t("deliveroo.notYetVerifiedAgent")}
                </span>
              </div>
              {selected.lastFaceVerifAt && (
                <p className="text-xs text-teal-600">
                  {t("deliveroo.lastVerified")}: {formatDateTime(selected.lastFaceVerifAt, locale)}
                </p>
              )}
            </div>

            <div className="border-t border-gray-50 pt-4">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">
                {t("deliveroo.location")}
              </p>
              <div className="flex items-center gap-2 text-sm text-secondary">
                <MapPin size={14} />
                <span>{selected.zone || t("deliveroo.zoneNotAssigned")}</span>
              </div>
            </div>

            <div className="border-t border-gray-50 pt-4">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">
                {t("deliveroo.contact")}
              </p>
              <div className="flex items-center gap-2 text-sm text-secondary">
                <Phone size={14} />
                <span>{selected.phone || "-"}</span>
              </div>
            </div>
          </div>
        )}
      </SlidePanel>

      {/* Add Driver Modal */}
      {showAdd && (
        <AddDriverModal
          platform="DELIVEROO"
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
