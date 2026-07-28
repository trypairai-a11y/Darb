"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import DataTable from "@/components/shared/DataTable";
import { Car, Smartphone, Package, Search, Boxes, CreditCard, Plus, Trash2, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/shared/Toast";
import AddVehicleModal from "@/components/shared/AddVehicleModal";
import AssignDriversModal from "@/components/shared/AssignDriversModal";
import AddSimModal from "@/components/shared/AddSimModal";
import AddDeviceModal from "@/components/shared/AddDeviceModal";
import AddPlatformEquipmentModal from "@/components/shared/AddPlatformEquipmentModal";
import BackToSetup from "@/components/shared/BackToSetup";
import { useI18n } from "@/i18n/I18nProvider";
import { itemDisplayName } from "@/lib/equipmentItems";

type Tab = "vehicles" | "sims" | "devices" | "platformEquipment";

/**
 * V1 scope (client revision #23): Darb is the mediator and owns no vehicles,
 * SIMs or devices, so only platform equipment is shown. The other tabs, their
 * modals and their API routes are deliberately left in place for the V2 asset
 * tracker the client asked us to keep on the backlog — flip this array back to
 * re-enable them.
 */
const TABS: { key: Tab; label: string; icon: typeof Car }[] = [
  { key: "platformEquipment", label: "Equipment", icon: Boxes },
];

const ADD_BUTTON_LABEL: Record<Tab, string> = {
  vehicles: "Add Vehicle",
  sims: "Add SIM",
  devices: "Add Device",
  platformEquipment: "Add Equipment",
};

type EquipmentRow = {
  id: string;
  platform: string;
  itemType: string;
  label?: string | null;
  total: number;
  issued: number;
  available: number;
  minStock: number;
};

/**
 * Revision 4 (#13): Darb is the only platform in scope, so the demo pools for
 * Keeta, Talabat, Deliveroo and Americana are gone. They were left over from
 * the multi-aggregator platform the PRD rebuild deleted, and every one of them
 * offered an ops manager a pool of kit that does not exist.
 */
const MOCK_PLATFORM_EQUIPMENT: EquipmentRow[] = [
  { id: "md-1",  platform: "DARB", itemType: "HELMET",       total: 48, issued: 39, available: 9,  minStock: 8 },
  { id: "md-2",  platform: "DARB", itemType: "TSHIRT",       total: 50, issued: 42, available: 8,  minStock: 8 },
  { id: "md-3",  platform: "DARB", itemType: "PANTS",        total: 46, issued: 38, available: 8,  minStock: 8 },
  { id: "md-4",  platform: "DARB", itemType: "COOLING_VEST", total: 44, issued: 36, available: 8,  minStock: 8 },
  { id: "md-5",  platform: "DARB", itemType: "SAFETY_VEST",  total: 49, issued: 40, available: 9,  minStock: 8 },
  { id: "md-6",  platform: "DARB", itemType: "WATER_BOTTLE", total: 47, issued: 38, available: 9,  minStock: 8 },
  { id: "md-7",  platform: "DARB", itemType: "GLOVES",       total: 43, issued: 37, available: 6,  minStock: 8 },
  { id: "md-8",  platform: "DARB", itemType: "SAFETY_KIT",   total: 45, issued: 36, available: 9,  minStock: 8 },
  { id: "md-9",  platform: "DARB", itemType: "BIG_BAG",      total: 48, issued: 39, available: 9,  minStock: 8 },
  { id: "md-10", platform: "DARB", itemType: "SMALL_BAG",    total: 46, issued: 38, available: 8,  minStock: 8 },
  { id: "md-11", platform: "DARB", itemType: "CAP",          total: 44, issued: 36, available: 8,  minStock: 8 },
  { id: "md-12", platform: "DARB", itemType: "MOBILE_PHONE", total: 42, issued: 35, available: 7,  minStock: 8 },
  { id: "md-13", platform: "DARB", itemType: "SIM_CARD",     total: 47, issued: 38, available: 9,  minStock: 8 },
  { id: "md-14", platform: "DARB", itemType: "PETROL_CARD",  total: 41, issued: 35, available: 6,  minStock: 8 },
];

function formatLicenseDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function licenseStatus(expiry?: string | null) {
  if (!expiry) return { label: "—", cls: "text-gray-400" };
  const d = new Date(expiry);
  if (isNaN(d.getTime())) return { label: "—", cls: "text-gray-400" };
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: "Expired", cls: "text-red-600" };
  if (diffDays <= 30) return { label: `${diffDays}d left`, cls: "text-amber-600" };
  return { label: "Valid", cls: "text-emerald-600" };
}

export default function GlobalAssetsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("platformEquipment");
  const [query, setQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);

  const toast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [assignVehicle, setAssignVehicle] = useState<any | null>(null);
  const [removeItem, setRemoveItem] = useState<any | null>(null);
  const [removing, setRemoving] = useState(false);

  const { data: vehiclesData, loading: vLoading, refetch: refetchVehicles } = useApiGet<any>(
    tab === "vehicles" ? "/api/vehicles?limit=500" : null
  );
  const { data: simsData, loading: sLoading, refetch: refetchSims } = useApiGet<any>(
    tab === "sims" ? "/api/sims?limit=500" : null
  );
  const { data: devicesData, loading: dLoading, refetch: refetchDevices } = useApiGet<any>(
    tab === "devices" ? "/api/devices?limit=500" : null
  );
  const { data: equipmentData, loading: eLoading, refetch: refetchEquipment } = useApiGet<any>(
    tab === "platformEquipment" ? "/api/platform-settings/inventory/all" : null
  );

  // Always-on counts for stat cards (lightweight summary endpoints)
  const { data: vehiclesCountData, refetch: refetchVehiclesCount } = useApiGet<any>("/api/vehicles?limit=1");
  const { data: simsCountData, refetch: refetchSimsCount } = useApiGet<any>("/api/sims?limit=1");
  const { data: devicesCountData, refetch: refetchDevicesCount } = useApiGet<any>("/api/devices?limit=1");
  const { data: equipmentCountData, refetch: refetchEquipmentCount } = useApiGet<any>("/api/platform-settings/inventory/all");

  async function handleStatusChange(id: string, status: string) {
    setPendingId(id);
    try {
      await api.put(`/api/vehicles/${id}`, { status });
      toast.success("Vehicle status updated");
      refetchVehicles();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to update status");
      refetchVehicles();
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemoveItem() {
    if (!removeItem) return;
    setRemoving(true);
    try {
      await api.delete(
        `/api/platform-settings/${removeItem.platform || "DARB"}/inventory/${removeItem.itemType}`
      );
      toast.success("Item removed");
      setRemoveItem(null);
      refetchEquipment();
      refetchEquipmentCount();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to remove item");
    } finally {
      setRemoving(false);
    }
  }

  function handleAddSuccess() {
    setAddModalOpen(false);
    if (tab === "vehicles") {
      toast.success("Vehicle added");
      refetchVehicles();
      refetchVehiclesCount();
    } else if (tab === "sims") {
      toast.success("SIM added");
      refetchSims();
      refetchSimsCount();
    } else if (tab === "devices") {
      toast.success("Device added");
      refetchDevices();
      refetchDevicesCount();
    } else if (tab === "platformEquipment") {
      toast.success("Equipment added");
      refetchEquipment();
      refetchEquipmentCount();
    }
  }

  const vehicles: any[] = (vehiclesData?.data || vehiclesData || []).filter((v: any) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (v.plateNumber || "").toLowerCase().includes(q) ||
      (v.make || "").toLowerCase().includes(q) ||
      (v.model || "").toLowerCase().includes(q) ||
      (v.assignedDriver?.name || "").toLowerCase().includes(q)
    );
  });

  const sims: any[] = (simsData?.data || simsData || []).filter((s: any) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (s.phoneNumber || "").toLowerCase().includes(q) ||
      (s.carrier || "").toLowerCase().includes(q) ||
      (s.driver?.name || "").toLowerCase().includes(q) ||
      (s.device?.imei || "").toLowerCase().includes(q)
    );
  });

  const devices: any[] = (devicesData?.data || devicesData || []).filter((d: any) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (d.imei || "").toLowerCase().includes(q) ||
      (d.model || "").toLowerCase().includes(q) ||
      (d.driver?.name || "").toLowerCase().includes(q)
    );
  });

  // Revision 4 (#13): historical rows for the deleted aggregator platforms are
  // still in the database (no destructive migrations), so filter rather than
  // trust the endpoint — otherwise a stale row puts Talabat back on screen.
  const apiEquipment: any[] = (equipmentData?.data || []).filter(
    (e: any) => (e.platform ?? "DARB") === "DARB"
  );
  const equipmentSource: any[] = apiEquipment.length > 0 ? apiEquipment : MOCK_PLATFORM_EQUIPMENT;
  const equipment: any[] = equipmentSource.filter((e: any) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return itemDisplayName(e.itemType, e.label).toLowerCase().includes(q);
  });

  const equipmentExisting: { platform: string; itemType: string }[] = equipmentSource.map((e: any) => ({
    platform: e.platform,
    itemType: e.itemType,
  }));

  // The fourteen defaults on screen are a placeholder until something is
  // actually saved. Persist them alongside the first real add, or the table
  // would collapse to the single row the API now returns.
  const equipmentBootstrap: any[] | undefined =
    apiEquipment.length === 0
      ? MOCK_PLATFORM_EQUIPMENT.map((e) => ({
          itemType: e.itemType,
          total: e.total,
          issued: e.issued,
          minStock: e.minStock,
        }))
      : undefined;

  const vehicleColumns = [
    {
      key: "plateNumber",
      label: "Plate",
      render: (v: string) => <span className="font-mono text-sm">{v || "—"}</span>,
    },
    {
      key: "make",
      label: "Make / Model",
      render: (_: any, r: any) => (
        <span className="text-sm">
          {r.make || "—"} {r.model ? `· ${r.model}` : ""}
        </span>
      ),
    },
    { key: "year", label: "Year", render: (v: any) => v || "—" },
    { key: "color", label: "Color", render: (v: any) => v || "—" },
    {
      key: "type",
      label: "Type",
      render: (v: string) => (
        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium">
          {v || "—"}
        </span>
      ),
    },
    {
      key: "registrationExpiry",
      label: "Licence",
      render: (_: any, r: any) => {
        const date = formatLicenseDate(r.registrationExpiry);
        const s = licenseStatus(r.registrationExpiry);
        return (
          <div className="flex flex-col leading-tight">
            <span className="text-sm">{date || "—"}</span>
            <span className={cn("text-[11px] font-medium", s.cls)}>{s.label}</span>
          </div>
        );
      },
    },
    {
      key: "assignedDriver",
      label: "Assigned to",
      sortable: false,
      render: (_: any, r: any) => {
        const drivers: any[] = r.drivers?.length
          ? r.drivers
          : r.assignedDriver
          ? [r.assignedDriver]
          : [];
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAssignVehicle(r);
            }}
            className="group flex items-center gap-1.5 text-left max-w-[220px]"
            title="Manage assigned drivers"
          >
            {drivers.length === 0 ? (
              <span className="text-xs text-secondary group-hover:text-primary">+ Assign drivers</span>
            ) : (
              <span className="flex flex-wrap items-center gap-1">
                {drivers.slice(0, 2).map((d: any) => (
                  <span
                    key={d.id}
                    className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium group-hover:bg-emerald-50 group-hover:text-emerald-700"
                  >
                    {d.name}
                  </span>
                ))}
                {drivers.length > 2 && (
                  <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-xs font-medium">
                    +{drivers.length - 2}
                  </span>
                )}
              </span>
            )}
          </button>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (v: string, r: any) => {
        const cls = cn(
          "px-2 py-1 rounded-md text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-400 disabled:opacity-50",
          {
            "bg-green-50 text-green-700": v === "ACTIVE",
            "bg-amber-50 text-amber-700": v === "MAINTENANCE",
            "bg-gray-100 text-gray-600": v === "RETIRED" || !v,
          }
        );
        return (
          <select
            value={v || "ACTIVE"}
            disabled={pendingId === r.id}
            onChange={(e) => handleStatusChange(r.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className={cls}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
            <option value="RETIRED">RETIRED</option>
          </select>
        );
      },
    },
  ];

  const simColumns = [
    {
      key: "phoneNumber",
      label: "Phone number",
      render: (v: string) => <span className="font-mono text-sm">{v || "—"}</span>,
    },
    {
      key: "carrier",
      label: "Carrier",
      render: (v: any) => v || "—",
    },
    {
      key: "device",
      label: "Linked device",
      render: (_: any, r: any) =>
        r.device ? (
          <span className="text-sm">
            {r.device.model}
            <span className="text-xs text-secondary"> · {r.device.imei}</span>
          </span>
        ) : (
          <span className="text-xs text-secondary">No device</span>
        ),
    },
    {
      key: "driver",
      label: "Assigned to",
      render: (_: any, r: any) =>
        r.driver?.name ? (
          <span className="text-sm">{r.driver.name}</span>
        ) : (
          <span className="text-xs text-secondary">Unassigned</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      render: (v: string) => (
        <span
          className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
            "bg-green-50 text-green-700": v === "ACTIVE",
            "bg-amber-50 text-amber-700": v === "SUSPENDED",
            "bg-gray-100 text-gray-600": !v || v === "INACTIVE",
          })}
        >
          {v || "—"}
        </span>
      ),
    },
  ];

  const deviceColumns = [
    {
      key: "imei",
      label: "IMEI",
      render: (v: string) => <span className="font-mono text-xs">{v || "—"}</span>,
    },
    {
      key: "model",
      label: "Device",
      render: (v: any) => v || "—",
    },
    {
      key: "osVersion",
      label: "OS",
      render: (v: any) => <span className="text-xs text-secondary">{v || "—"}</span>,
    },
    {
      key: "driver",
      label: "Assigned to",
      render: (_: any, r: any) =>
        r.driver?.name ? (
          <span className="text-sm">{r.driver.name}</span>
        ) : r.assignedDriver?.name ? (
          <span className="text-sm">{r.assignedDriver.name}</span>
        ) : (
          <span className="text-xs text-secondary">Unassigned</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      render: (v: string) => (
        <span
          className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
            "bg-green-50 text-green-700": v === "ACTIVE",
            "bg-red-50 text-red-700": v === "LOST",
            "bg-gray-100 text-gray-600": !v || v === "DECOMMISSIONED",
          })}
        >
          {v || "—"}
        </span>
      ),
    },
  ];

  // Revision 4 (#13): no Platform column. With one platform it said "DARB" on
  // every row, which is a column that answers a question nobody has.
  const equipmentColumns = [
    {
      key: "itemType",
      label: "Item",
      render: (v: string, r: any) => (
        <span className="text-sm">{itemDisplayName(v, r.label)}</span>
      ),
    },
    {
      key: "total",
      label: "Total",
      render: (v: any) => <span className="tabular-nums text-sm font-medium">{v ?? 0}</span>,
    },
    {
      key: "issued",
      label: "Issued",
      render: (v: any) => <span className="tabular-nums text-sm">{v ?? 0}</span>,
    },
    {
      key: "available",
      label: "Available",
      render: (_: any, r: any) => {
        const available = r.available ?? 0;
        const min = r.minStock ?? 0;
        const low = min > 0 && available <= min;
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 tabular-nums text-sm font-medium",
              low ? "text-red-600" : "text-emerald-700"
            )}
          >
            {available}
            {low && (
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-red-50 ring-1 ring-red-100">
                LOW
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "minStock",
      label: "Min stock",
      render: (v: any) => <span className="tabular-nums text-sm text-secondary">{v ?? 0}</span>,
    },
    {
      // Ops can create item types now, so a typo needs a way out. Only offered
      // for saved rows: the placeholder pools have nothing to delete.
      key: "actions",
      label: "",
      sortable: false,
      render: (_: any, r: any) =>
        apiEquipment.length === 0 ? (
          <span className="text-xs text-secondary">n/a</span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRemoveItem(r);
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
            title="Remove this item"
          >
            <Trash2 size={14} />
          </button>
        ),
    },
  ];

  const totals = {
    vehicles:
      vehiclesCountData?.pagination?.total ??
      (Array.isArray(vehiclesCountData?.data)
        ? vehiclesCountData.data.length
        : Array.isArray(vehiclesCountData)
        ? vehiclesCountData.length
        : 0),
    sims:
      simsCountData?.pagination?.total ??
      (Array.isArray(simsCountData?.data)
        ? simsCountData.data.length
        : Array.isArray(simsCountData)
        ? simsCountData.length
        : 0),
    devices:
      devicesCountData?.pagination?.total ??
      (Array.isArray(devicesCountData?.data)
        ? devicesCountData.data.length
        : Array.isArray(devicesCountData)
        ? devicesCountData.length
        : 0),
    equipment: (() => {
      const rows: any[] = (equipmentCountData?.data || []).filter(
        (r: any) => (r.platform ?? "DARB") === "DARB"
      );
      const source = rows.length > 0 ? rows : MOCK_PLATFORM_EQUIPMENT;
      return source.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0);
    })(),
  };

  return (
    <div className="space-y-6 w-full max-w-none">
      <BackToSetup />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Package size={20} />
          </div>
          <div>
            <h1 className="font-display text-display-sm text-sand-900">
              {t("simple.setupEquipment")}
            </h1>
            <p className="text-sm text-sand-600 mt-1">{t("simple.setupEquipmentDesc")}</p>
          </div>
        </div>
      </div>

      {/* Stat cards — "Total assets" went with the other tabs: a rollup over a
          single category is just that category. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs font-medium text-secondary mb-1">Platform equipment</p>
          <p className="text-2xl font-semibold">{totals.equipment}</p>
        </div>
      </div>

      {/* Tabs + search + add */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                tab === t.key ? "bg-white text-foreground shadow-sm" : "text-secondary hover:text-foreground"
              )}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "platformEquipment"
                  ? "Search platform or item…"
                  : tab === "sims"
                  ? "Search phone, carrier, driver…"
                  : tab === "devices"
                  ? "Search IMEI, model, driver…"
                  : "Search plate, make, driver…"
              }
              className="pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-xl w-72 focus:outline-none focus:border-primary/50"
            />
          </div>
          <button
            onClick={() => setAddModalOpen(true)}
            className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
          >
            <Plus size={14} />
            {ADD_BUTTON_LABEL[tab]}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {tab === "vehicles" && (
          <DataTable
            columns={vehicleColumns}
            data={vehicles}
            emptyMessage={
              <div className="py-8 text-center text-sm text-secondary">
                {vLoading ? "Loading vehicles…" : "No vehicles in the fleet."}
              </div>
            }
          />
        )}
        {tab === "sims" && (
          <DataTable
            columns={simColumns}
            data={sims}
            emptyMessage={
              <div className="py-8 text-center text-sm text-secondary">
                {sLoading ? "Loading SIMs…" : "No SIMs recorded."}
              </div>
            }
          />
        )}
        {tab === "devices" && (
          <DataTable
            columns={deviceColumns}
            data={devices}
            emptyMessage={
              <div className="py-8 text-center text-sm text-secondary">
                {dLoading ? "Loading devices…" : "No devices recorded."}
              </div>
            }
          />
        )}
        {tab === "platformEquipment" && (
          <DataTable
            columns={equipmentColumns}
            data={equipment}
            emptyMessage={
              <div className="py-8 text-center text-sm text-secondary">
                {eLoading ? "Loading platform equipment…" : "No platform equipment configured."}
              </div>
            }
          />
        )}
      </div>

      {/* Add modals */}
      {addModalOpen && tab === "vehicles" && (
        <AddVehicleModal onClose={() => setAddModalOpen(false)} onSuccess={handleAddSuccess} />
      )}
      {addModalOpen && tab === "sims" && (
        <AddSimModal onClose={() => setAddModalOpen(false)} onSuccess={handleAddSuccess} />
      )}
      {addModalOpen && tab === "devices" && (
        <AddDeviceModal onClose={() => setAddModalOpen(false)} onSuccess={handleAddSuccess} />
      )}
      {addModalOpen && tab === "platformEquipment" && (
        <AddPlatformEquipmentModal
          onClose={() => setAddModalOpen(false)}
          onSuccess={handleAddSuccess}
          existing={equipmentExisting}
          bootstrap={equipmentBootstrap}
        />
      )}

      {removeItem && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !removing && setRemoveItem(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              Remove {itemDisplayName(removeItem.itemType, removeItem.label)}?
            </h2>
            <p className="text-sm text-secondary mt-2">
              The stock pool is deleted. Kit already issued to drivers stays on their
              records.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setRemoveItem(null)}
                disabled={removing}
                className="px-4 py-2 text-sm font-medium text-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveItem}
                disabled={removing}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {removing && <Loader2 size={14} className="animate-spin" />}
                {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignVehicle && (
        <AssignDriversModal
          vehicle={assignVehicle}
          onClose={() => setAssignVehicle(null)}
          onSuccess={() => {
            setAssignVehicle(null);
            toast.success("Driver assignments updated");
            refetchVehicles();
          }}
        />
      )}
    </div>
  );
}
