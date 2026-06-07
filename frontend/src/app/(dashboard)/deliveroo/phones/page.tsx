"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import api from "@/lib/api";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import StatCard from "@/components/shared/StatCard";
import { cn } from "@/lib/cn";
import {
  Smartphone,
  Wifi,
  WifiOff,
  Plus,
  X,
  Shield,
  Clock,
  Hash,
  AlertTriangle,
  Loader2,
} from "lucide-react";

const ZONES = ["Al Hazm", "Madinat Al Hareer", "Abu Halifa", "Mangaf", "Fahaheel"];

const STATUS_STYLES: Record<string, string> = {
  ONLINE: "bg-green-50 text-green-700",
  OFFLINE: "bg-gray-100 text-gray-500",
  ASSIGNED: "bg-blue-50 text-blue-600",
  IN_REPAIR: "bg-orange-50 text-orange-600",
  LOST: "bg-red-50 text-red-600",
};

export default function DeliverooPhonesPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ imei: "", model: "", osVersion: "", driverId: "" });
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const params = new URLSearchParams({ platform: "DELIVEROO", limit: "100" });
  if (filters.status) params.set("status", filters.status);
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.search) params.set("search", filters.search);

  const { data, refetch } = useApiGet<any>(`/api/devices?${params}`);
  const { data: summary } = useApiGet<any>("/api/devices/summary?platform=DELIVEROO");
  const { data: driversData } = useApiGet<any>("/api/drivers?platform=DELIVEROO&limit=500");
  const devices: any[] = data?.data || [];

  const columns = [
    {
      key: "deviceName",
      label: "Device",
      render: (_: any, r: any) => (
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-teal-50 rounded-lg">
            <Smartphone size={14} className="text-teal-600" />
          </div>
          <div>
            <p className="text-sm font-medium">{r.deviceName || r.model || "-"}</p>
            <p className="text-[10px] text-secondary font-mono">{r.imei || r.serialNumber || "-"}</p>
          </div>
        </div>
      ),
    },
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
    {
      key: "mobileNumber",
      label: "Mobile Number",
      render: (_: any, r: any) => (
        <span className="font-mono text-xs text-secondary">{r.driver?.phone || "-"}</span>
      ),
    },
    { key: "zone", label: "Zone" },
    {
      key: "isOnline",
      label: "Connection",
      render: (v: boolean) => (
        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", v ? "text-green-600" : "text-secondary")}>
          {v ? <Wifi size={12} /> : <WifiOff size={12} />}
          {v ? "Online" : "Offline"}
        </span>
      ),
    },
    {
      key: "agentVersion",
      label: "Agent",
      render: (v: string) => (
        <span className="text-[10px] font-mono text-secondary">{v || "-"}</span>
      ),
    },
    {
      key: "lastSeenAt",
      label: "Last Seen",
      render: (v: string) => (
        <span className="text-xs text-secondary">
          {v ? new Date(v).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
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
          <h1 className="text-xl font-semibold">Deliveroo - Phones</h1>
          <span className="text-sm text-secondary">Al Hazm</span>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
        >
          <Plus size={16} /> Add Device
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Devices" value={summary?.total || devices.length} icon={Smartphone} />
        <StatCard
          title="Online Now"
          value={summary?.online || 0}
          icon={Wifi}
        />
        <StatCard
          title="Offline"
          value={summary?.offline || 0}
          icon={WifiOff}
        />
      </div>

      {/* Filters */}
      <FilterBar
        filters={[
          {
            key: "search",
            type: "search",
            label: "Search",
            placeholder: "Search device name, IMEI, or driver...",
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
              { value: "ONLINE", label: "Online" },
              { value: "OFFLINE", label: "Offline" },
              { value: "ASSIGNED", label: "Assigned" },
              { value: "IN_REPAIR", label: "In Repair" },
              { value: "LOST", label: "Lost" },
            ],
          },
        ]}
        values={filters}
        onChange={(k, v) => setFilters({ ...filters, [k]: v })}
      />

      <DataTable
        columns={columns}
        data={devices}
        onRowClick={setSelected}
        emptyMessage="No devices found"
      />

      {/* Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.deviceName || selected?.model || "Device"}
        subtitle="Deliveroo / Al Hazm"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-50 rounded-xl">
                <Smartphone size={20} className="text-teal-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{selected.deviceName || selected.model || "-"}</p>
                <p className="text-xs text-secondary">{selected.manufacturer || "-"}</p>
              </div>
              <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", STATUS_STYLES[selected.status] || "bg-gray-100 text-gray-500")}>
                {selected.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ["IMEI", selected.imei],
                ["Serial No.", selected.serialNumber],
                ["OS Version", selected.osVersion],
                ["Agent Version", selected.agentVersion],
                ["Assigned Driver", selected.assignedDriver?.name],
                ["Zone", selected.zone],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5 font-mono text-xs">{val || "-"}</p>
                </div>
              ))}
            </div>

            {/* Live status */}
            <div className="border-t border-gray-50 pt-4 space-y-2.5">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide">Live Status</p>

              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="text-xs text-secondary flex items-center gap-2">
                  <Wifi size={13} /> Connection
                </span>
                <span className={cn("text-xs font-medium", selected.isOnline ? "text-green-600" : "text-secondary")}>
                  {selected.isOnline ? "Online" : "Offline"}
                </span>
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="text-xs text-secondary flex items-center gap-2">
                  <Clock size={13} /> Last Seen
                </span>
                <span className="text-xs text-secondary">
                  {selected.lastSeenAt
                    ? new Date(selected.lastSeenAt).toLocaleString()
                    : "-"}
                </span>
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="text-xs text-secondary flex items-center gap-2">
                  <Shield size={13} /> Darb Agent
                </span>
                <span className={cn("text-xs font-medium", selected.agentVersion ? "text-teal-600" : "text-secondary")}>
                  {selected.agentVersion || "Not installed"}
                </span>
              </div>
            </div>

            {selected.notes && (
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-[10px] text-amber-600 uppercase font-medium mb-1">Notes</p>
                <p className="text-xs text-amber-800">{selected.notes}</p>
              </div>
            )}
          </div>
        )}
      </SlidePanel>

      {/* Add Device Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Add Deliveroo Device</h2>
              <button onClick={() => { setShowAdd(false); setAddError(""); }} className="p-1 hover:bg-gray-50 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setAddError("");
                setAdding(true);
                try {
                  await api.post("/api/devices", {
                    imei: addForm.imei,
                    model: addForm.model,
                    osVersion: addForm.osVersion,
                    driverId: addForm.driverId || undefined,
                  });
                  setShowAdd(false);
                  setAddForm({ imei: "", model: "", osVersion: "", driverId: "" });
                  refetch();
                } catch (err: any) {
                  setAddError(err.response?.data?.error || "Failed to add device");
                } finally {
                  setAdding(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">IMEI *</label>
                <input
                  type="text"
                  required
                  value={addForm.imei}
                  onChange={(e) => setAddForm({ ...addForm, imei: e.target.value })}
                  placeholder="e.g. 353456789012345"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Model *</label>
                <input
                  type="text"
                  required
                  value={addForm.model}
                  onChange={(e) => setAddForm({ ...addForm, model: e.target.value })}
                  placeholder="e.g. Samsung Galaxy A14"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">OS Version *</label>
                <input
                  type="text"
                  required
                  value={addForm.osVersion}
                  onChange={(e) => setAddForm({ ...addForm, osVersion: e.target.value })}
                  placeholder="e.g. Android 14"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Assign to Driver</label>
                <select
                  value={addForm.driverId}
                  onChange={(e) => setAddForm({ ...addForm, driverId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  <option value="">Unassigned</option>
                  {(driversData?.data || []).map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              {addError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{addError}</p>
              )}
              <button
                type="submit"
                disabled={adding}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {adding && <Loader2 size={14} className="animate-spin" />}
                {adding ? "Adding..." : "Add Device"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
