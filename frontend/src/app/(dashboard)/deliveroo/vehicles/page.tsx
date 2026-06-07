"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import StatCard from "@/components/shared/StatCard";
import { cn } from "@/lib/cn";
import {
  Bike,
  Car,
  Wrench,
  AlertTriangle,
  Plus,
  X,
  CalendarDays,
  Hash,
  Gauge,
} from "lucide-react";

const ZONES = ["Al Hazm", "Madinat Al Hareer", "Abu Halifa", "Mangaf", "Fahaheel"];

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  MAINTENANCE: "bg-orange-50 text-orange-600",
  INACTIVE: "bg-gray-100 text-gray-500",
  OUT_OF_SERVICE: "bg-red-50 text-red-600",
};

function VehicleIcon({ type }: { type: string }) {
  const Icon = type === "MOTORCYCLE" ? Bike : Car;
  return (
    <div className={cn("p-1.5 rounded-lg", type === "MOTORCYCLE" ? "bg-orange-50" : "bg-blue-50")}>
      <Icon size={14} className={type === "MOTORCYCLE" ? "text-orange-500" : "text-blue-500"} />
    </div>
  );
}

export default function DeliverooVehiclesPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);

  const params = new URLSearchParams({ platform: "DELIVEROO", limit: "100" });
  if (filters.type) params.set("vehicleType", filters.type);
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);

  const { data } = useApiGet<any>(`/api/vehicles?${params}`);
  const { data: summary } = useApiGet<any>("/api/vehicles/summary?platform=DELIVEROO");
  const vehicles: any[] = data?.data || [];

  const columns = [
    {
      key: "plateNumber",
      label: "Plate",
      render: (v: string) => (
        <span className="font-mono text-xs bg-gray-50 px-2 py-0.5 rounded-md">{v || "-"}</span>
      ),
    },
    {
      key: "vehicleType",
      label: "Type",
      render: (v: string) => (
        <div className="flex items-center gap-2">
          <VehicleIcon type={v} />
          <span className="text-sm">{v === "MOTORCYCLE" ? "Motorcycle" : "Car"}</span>
        </div>
      ),
    },
    {
      key: "make",
      label: "Model",
      render: (_: any, r: any) => (
        <span className="text-sm">{[r.make, r.model].filter(Boolean).join(" ") || "-"}</span>
      ),
    },
    { key: "year", label: "Year" },
    {
      key: "assignedDriver",
      label: "Assigned Driver",
      render: (v: any) =>
        v?.name ? (
          <span className="text-sm">{v.name}</span>
        ) : (
          <span className="text-xs text-secondary">Unassigned</span>
        ),
    },
    { key: "zone", label: "Zone" },
    {
      key: "status",
      label: "Status",
      render: (v: string) => (
        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", STATUS_STYLES[v] || "bg-gray-100 text-gray-500")}>
          {v}
        </span>
      ),
    },
    {
      key: "insuranceExpiry",
      label: "Insurance",
      render: (v: string) => {
        if (!v) return <span className="text-xs text-secondary">-</span>;
        const days = Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
        const urgent = days < 30;
        return (
          <span className={cn("text-xs", urgent ? "text-red-500 font-medium" : "text-secondary")}>
            {urgent && <AlertTriangle size={10} className="inline mr-0.5" />}
            {new Date(v).toLocaleDateString()}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-teal-500" />
          <h1 className="text-xl font-semibold">Deliveroo - Vehicles</h1>
          <span className="text-sm text-secondary">Al Hazm</span>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
        >
          <Plus size={16} /> Add Vehicle
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Vehicles" value={summary?.total || vehicles.length} icon={Bike} />
        <StatCard title="Motorcycles" value={summary?.motorcycles || "-"} icon={Bike} />
        <StatCard title="Cars" value={summary?.cars || "-"} icon={Car} />
        <StatCard
          title="In Maintenance"
          value={summary?.maintenance || 0}
          icon={Wrench}
          highlight={(summary?.maintenance || 0) > 0}
        />
      </div>

      {/* Filters */}
      <FilterBar
        filters={[
          {
            key: "search",
            type: "search",
            label: "Search",
            placeholder: "Search plate or driver...",
          },
          {
            key: "type",
            type: "select",
            label: "All Types",
            options: [
              { value: "MOTORCYCLE", label: "Motorcycle" },
              { value: "CAR", label: "Car" },
            ],
          },
          {
            key: "zone",
            type: "select",
            label: "All Zones",
            options: ZONES.map((z) => ({ value: z, label: z })),
          },
          {
            key: "status",
            type: "select",
            label: "All Statuses",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "MAINTENANCE", label: "Maintenance" },
              { value: "OUT_OF_SERVICE", label: "Out of Service" },
            ],
          },
        ]}
        values={filters}
        onChange={(k, v) => setFilters({ ...filters, [k]: v })}
      />

      <DataTable
        columns={columns}
        data={vehicles}
        onRowClick={setSelected}
        emptyMessage="No vehicles found"
      />

      {/* Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.plateNumber || "Vehicle"}
        subtitle="Deliveroo / Al Hazm"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <VehicleIcon type={selected.vehicleType} />
              <div>
                <p className="text-sm font-semibold">
                  {[selected.make, selected.model].filter(Boolean).join(" ") || "-"}
                </p>
                <p className="text-xs text-secondary">{selected.year || "-"}</p>
              </div>
              <span className={cn("ml-auto px-2 py-0.5 rounded-md text-xs font-medium", STATUS_STYLES[selected.status] || "bg-gray-100 text-gray-500")}>
                {selected.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ["Plate", selected.plateNumber],
                ["Zone", selected.zone],
                ["Assigned Driver", selected.assignedDriver?.name],
                ["Color", selected.color],
                ["Chassis No.", selected.chassisNumber],
                ["Engine CC", selected.engineCC],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val || "-"}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-50 pt-4 space-y-3">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide">Documents</p>
              {[
                { label: "Insurance Expiry", value: selected.insuranceExpiry, icon: CalendarDays },
                { label: "Registration Expiry", value: selected.registrationExpiry, icon: Hash },
                { label: "Last Service", value: selected.lastServiceDate, icon: Wrench },
                {
                  label: "Mileage",
                  value: selected.mileage ? `${selected.mileage.toLocaleString()} km` : null,
                  icon: Gauge,
                },
              ].map(({ label, value, icon: Icon }) => {
                const isExpiry = value && (label.includes("Expiry") || label.includes("Service"));
                const daysLeft = isExpiry
                  ? Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
                  : null;
                const urgent = daysLeft !== null && daysLeft < 30;
                return (
                  <div
                    key={label}
                    className={cn(
                      "flex items-center justify-between rounded-xl px-3 py-2.5",
                      urgent ? "bg-red-50" : "bg-gray-50"
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs text-secondary">
                      <Icon size={13} />
                      {label}
                    </div>
                    <span className={cn("text-xs font-medium", urgent ? "text-red-600" : "text-foreground")}>
                      {isExpiry ? new Date(value).toLocaleDateString() : value || "-"}
                      {urgent && <span className="ml-1 text-red-400">({daysLeft}d)</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SlidePanel>

      {/* Add Vehicle Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Add Deliveroo Vehicle</h2>
              <button
                onClick={() => setShowAdd(false)}
                className="p-1 hover:bg-gray-50 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-secondary">
              Vehicle form - connects to POST /api/vehicles with platform=DELIVEROO
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
