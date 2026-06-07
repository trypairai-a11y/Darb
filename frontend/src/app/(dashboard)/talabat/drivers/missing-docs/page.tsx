"use client";
import { useRouter } from "next/navigation";
import { useApiGet } from "@/hooks/useApi";
import DataTable from "@/components/shared/DataTable";
import { cn } from "@/lib/cn";
import { cleanDriverName } from "@/lib/formatters";
import { ArrowLeft, FileText } from "lucide-react";

const DOC_FIELDS = [
  { label: "Health Certificate", expiryKey: "healthCertExpiry", statusKey: "healthCertStatus" },
  { label: "Food Handling Cert", expiryKey: "foodHandlingCertExpiry", statusKey: "foodHandlingCertStatus" },
  { label: "Vehicle Registration", expiryKey: "vehicleRegExpiry", statusKey: "vehicleRegStatus" },
  { label: "Vehicle Insurance", expiryKey: "vehicleInsuranceExpiry", statusKey: "vehicleInsuranceStatus" },
  { label: "Driving License", expiryKey: "drivingLicenseExpiry", statusKey: "drivingLicenseStatus" },
];

interface DriverMissingDoc {
  driverId: string;
  driverName: string;
  platformDriverId: string;
  zone: string;
  batchNumber: string;
  status: string;
  missingDocs: string[];
  missingCount: number;
}

export default function MissingDocsPage() {
  const router = useRouter();
  const { data } = useApiGet<any>("/api/drivers?platform=TALABAT&limit=500");
  const drivers = data?.data || [];

  // Build rows: one row per driver that has missing docs
  const rows: DriverMissingDoc[] = [];

  for (const d of drivers) {
    const missing: string[] = [];
    for (const doc of DOC_FIELDS) {
      const status = d[doc.statusKey];
      if (!status || status === "MISSING") {
        missing.push(doc.label);
      }
    }
    if (missing.length > 0) {
      rows.push({
        driverId: d.id,
        driverName: d.talabatDisplayName || d.name || "",
        platformDriverId: d.platformDriverId || "",
        zone: d.zone || "",
        batchNumber: d.batchNumber || "",
        status: d.status || "",
        missingDocs: missing,
        missingCount: missing.length,
      });
    }
  }

  // Sort by most missing docs first
  rows.sort((a, b) => b.missingCount - a.missingCount);

  const totalMissing = rows.reduce((sum, r) => sum + r.missingCount, 0);

  const columns = [
    {
      key: "driverName",
      label: "Driver",
      render: (_: any, r: DriverMissingDoc) => {
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
    {
      key: "status",
      label: "Driver Status",
      render: (v: string) => (
        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
          "bg-green-50 text-green-600": v === "ACTIVE",
          "bg-gray-100 text-gray-500": v === "INACTIVE",
          "bg-red-50 text-red-600": v === "SUSPENDED" || v === "TERMINATED",
        })}>
          {v}
        </span>
      ),
    },
    {
      key: "missingCount",
      label: "Missing",
      render: (v: number) => (
        <span className={cn(
          "px-2 py-0.5 rounded-md text-xs font-semibold",
          v >= 4 ? "bg-red-50 text-red-600" : v >= 2 ? "bg-yellow-50 text-yellow-600" : "bg-gray-100 text-gray-500"
        )}>
          {v} / {DOC_FIELDS.length}
        </span>
      ),
    },
    {
      key: "missingDocs",
      label: "Missing Documents",
      render: (docs: string[]) => (
        <div className="flex flex-wrap gap-1">
          {docs.map((doc) => (
            <span key={doc} className="px-2 py-0.5 rounded-md text-xs bg-gray-100 text-gray-600">
              {doc}
            </span>
          ))}
        </div>
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
        <h1 className="text-xl font-semibold">Missing Documents</h1>
        <span className="ml-2 px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
          {rows.length} driver{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-secondary mb-1">Drivers with Missing Docs</p>
          <p className="text-2xl font-semibold">{rows.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-secondary mb-1">Total Missing Documents</p>
          <p className="text-2xl font-semibold text-red-500">{totalMissing}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-secondary mb-1">All Docs Missing</p>
          <p className="text-2xl font-semibold text-red-500">
            {rows.filter(r => r.missingCount === DOC_FIELDS.length).length}
          </p>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(row) => router.push(`/drivers/${row.driverId}?from=talabat`)}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8 text-secondary">
            <FileText size={32} className="text-gray-300" />
            <p className="text-sm">All drivers have their documents uploaded</p>
          </div>
        }
      />
    </div>
  );
}
