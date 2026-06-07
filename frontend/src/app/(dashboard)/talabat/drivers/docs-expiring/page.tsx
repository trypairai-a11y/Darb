"use client";
import { useRouter } from "next/navigation";
import { useApiGet } from "@/hooks/useApi";
import DataTable from "@/components/shared/DataTable";
import { cn } from "@/lib/cn";
import { cleanDriverName } from "@/lib/formatters";
import { ArrowLeft, AlertTriangle } from "lucide-react";

const DOC_FIELDS = [
  { label: "Health Certificate", expiryKey: "healthCertExpiry", statusKey: "healthCertStatus" },
  { label: "Food Handling Cert", expiryKey: "foodHandlingCertExpiry", statusKey: "foodHandlingCertStatus" },
  { label: "Vehicle Registration", expiryKey: "vehicleRegExpiry", statusKey: "vehicleRegStatus" },
  { label: "Vehicle Insurance", expiryKey: "vehicleInsuranceExpiry", statusKey: "vehicleInsuranceStatus" },
  { label: "Driving License", expiryKey: "drivingLicenseExpiry", statusKey: "drivingLicenseStatus" },
];

const STATUS_COLORS: Record<string, string> = {
  VALID: "bg-green-50 text-green-600",
  EXPIRING: "bg-yellow-50 text-yellow-600",
  EXPIRED: "bg-red-50 text-red-600",
  MISSING: "bg-gray-100 text-gray-500",
};

interface DriverDoc {
  driverId: string;
  driverName: string;
  platformDriverId: string;
  zone: string;
  batchNumber: string;
  docLabel: string;
  expiryDate: string | null;
  status: string;
  daysLeft: number | null;
}

export default function DocsExpiringPage() {
  const router = useRouter();
  const { data } = useApiGet<any>("/api/drivers?platform=TALABAT&limit=500");
  const drivers = data?.data || [];

  // Flatten: one row per driver per expiring/expired document
  const rows: DriverDoc[] = [];
  const now = new Date();

  for (const d of drivers) {
    for (const doc of DOC_FIELDS) {
      const status = d[doc.statusKey];
      if (status === "EXPIRING" || status === "EXPIRED") {
        const expiry = d[doc.expiryKey] ? new Date(d[doc.expiryKey]) : null;
        const daysLeft = expiry ? Math.ceil((expiry.getTime() - now.getTime()) / 86400000) : null;
        rows.push({
          driverId: d.id,
          driverName: d.talabatDisplayName || d.name || "",
          platformDriverId: d.platformDriverId || "",
          zone: d.zone || "",
          batchNumber: d.batchNumber || "",
          docLabel: doc.label,
          expiryDate: d[doc.expiryKey] || null,
          status: status,
          daysLeft,
        });
      }
    }
  }

  // Sort: expired first, then by days left ascending
  rows.sort((a, b) => {
    if (a.status === "EXPIRED" && b.status !== "EXPIRED") return -1;
    if (a.status !== "EXPIRED" && b.status === "EXPIRED") return 1;
    return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
  });

  const columns = [
    {
      key: "driverName",
      label: "Driver",
      render: (_: any, r: DriverDoc) => {
        return <span className="font-medium text-sm">{cleanDriverName(r.driverName)}</span>;
      },
    },
    { key: "platformDriverId", label: "Talabat ID" },
    {
      key: "batchNumber",
      label: "Batch",
      render: (v: string) => (
        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-orange-50 text-orange-700">
          {v || "-"}
        </span>
      ),
    },
    { key: "zone", label: "Zone" },
    { key: "docLabel", label: "Document" },
    {
      key: "expiryDate",
      label: "Expiry Date",
      render: (v: string | null) =>
        v ? new Date(v).toLocaleDateString() : "-",
    },
    {
      key: "daysLeft",
      label: "Days Left",
      render: (v: number | null, r: DriverDoc) => {
        if (v === null) return "-";
        if (v < 0) return <span className="text-red-600 font-semibold">{Math.abs(v)}d overdue</span>;
        return <span className={cn("font-semibold", v <= 7 ? "text-red-600" : v <= 30 ? "text-yellow-600" : "text-green-600")}>{v}d</span>;
      },
    },
    {
      key: "status",
      label: "Status",
      render: (v: string) => (
        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", STATUS_COLORS[v] || STATUS_COLORS.MISSING)}>
          {v}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/talabat/drivers")}
          className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="w-3 h-3 rounded-full bg-talabat" />
        <h1 className="text-xl font-semibold">Docs Expiring / Expired</h1>
        <span className="ml-2 px-2.5 py-0.5 bg-red-50 text-red-600 rounded-full text-xs font-medium">
          {rows.length} document{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-secondary mb-1">Expired</p>
          <p className="text-2xl font-semibold text-red-500">{rows.filter(r => r.status === "EXPIRED").length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-secondary mb-1">Expiring Soon</p>
          <p className="text-2xl font-semibold text-yellow-500">{rows.filter(r => r.status === "EXPIRING").length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-secondary mb-1">Drivers Affected</p>
          <p className="text-2xl font-semibold">{new Set(rows.map(r => r.driverId)).size}</p>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(row) => router.push(`/drivers/${row.driverId}?from=talabat`)}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8 text-secondary">
            <AlertTriangle size={32} className="text-gray-300" />
            <p className="text-sm">No expiring or expired documents found</p>
          </div>
        }
      />
    </div>
  );
}
