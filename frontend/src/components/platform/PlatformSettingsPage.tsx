"use client";
import { useState, useEffect, useRef } from "react";
import { useApiGet } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import api from "@/lib/api";

const PRESET_COLORS = [
  "#22c55e", "#16a34a", "#15803d",
  "#3b82f6", "#2563eb", "#1d4ed8",
  "#f59e0b", "#d97706", "#b45309",
  "#f97316", "#ea580c", "#c2410c",
  "#ef4444", "#dc2626", "#b91c1c",
  "#8b5cf6", "#7c3aed", "#6d28d9",
  "#ec4899", "#db2777", "#be185d",
  "#6b7280", "#4b5563", "#374151",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-lg border-2 border-gray-200 cursor-pointer shadow-sm hover:scale-110 transition-transform"
        style={{ backgroundColor: value }}
      />
      {open && (
        <div className="absolute right-0 top-10 z-50 bg-white rounded-xl shadow-lg border border-gray-200 p-3 w-[200px]">
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={cn(
                  "w-7 h-7 rounded-lg cursor-pointer hover:scale-110 transition-transform border-2",
                  value.toLowerCase() === c.toLowerCase() ? "border-gray-800 ring-2 ring-gray-300" : "border-transparent"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <div className="w-6 h-6 rounded-md border border-gray-200" style={{ backgroundColor: value }} />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 text-xs font-mono px-2 py-1 rounded-md border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase"
              maxLength={7}
            />
          </div>
        </div>
      )}
    </div>
  );
}
import {
  Save,
  Plus,
  X,
  Loader2,
  Target,
  Package,
  BarChart3,
  MapPin,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Timer,
  Hash,
  TrendingUp,
  ShieldAlert,
  Banknote,
  CalendarClock,
  FileText,
  Bell,
  Users,
  Calendar,
  Bike,
  Car,
} from "lucide-react";

type Tab = "targets" | "inventory" | "kpis" | "zones" | "violations" | "cash" | "booking" | "documents" | "notifications";

interface Props {
  platform: string;
  platformLabel: string;
  platformColor: string;
}

const INVENTORY_ITEMS = [
  "HELMET", "TSHIRT", "PANTS", "COOLING_VEST", "SAFETY_VEST", "WATER_BOTTLE",
  "GLOVES", "SAFETY_KIT", "BIG_BAG", "SMALL_BAG", "CAP", "MOBILE_PHONE", "SIM_CARD", "PETROL_CARD",
];

const ITEM_LABELS: Record<string, string> = {
  HELMET: "Helmet", TSHIRT: "T-Shirt", PANTS: "Pants", COOLING_VEST: "Cooling Vest",
  SAFETY_VEST: "Safety Vest", WATER_BOTTLE: "Water Bottle", GLOVES: "Gloves",
  SAFETY_KIT: "Safety Kit", BIG_BAG: "Big Bag", SMALL_BAG: "Small Bag", CAP: "Cap",
  MOBILE_PHONE: "Mobile Phone", SIM_CARD: "SIM Card", PETROL_CARD: "Petrol Card",
};

export default function PlatformSettingsPage({ platform, platformLabel, platformColor }: Props) {
  const [tab, setTab] = useState<Tab>("targets");
  const [vehicleType, setVehicleType] = useState<"MOTORCYCLE" | "CAR">("MOTORCYCLE");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: settings, loading: settingsLoading, refetch } = useApiGet<any>(`/api/platform-settings/${platform}`);
  const { data: inventoryData, loading: inventoryLoading, refetch: refetchInventory } = useApiGet<any>(`/api/platform-settings/${platform}/inventory`);

  const [targets, setTargets] = useState<any>(null);
  const [kpis, setKpis] = useState<any>(null);
  const [shiftRules, setShiftRules] = useState<any>(null);
  const [zones, setZones] = useState<string[]>([]);
  const [newZone, setNewZone] = useState("");
  const [violationRules, setViolationRules] = useState<any>(null);
  const [cashRules, setCashRules] = useState<any>(null);
  const [bookingRules, setBookingRules] = useState<any>(null);
  const [documentRules, setDocumentRules] = useState<any>(null);
  const [notificationConfig, setNotificationConfig] = useState<any>(null);

  // Inventory state
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [showAddInventory, setShowAddInventory] = useState(false);
  const [addItem, setAddItem] = useState({ itemType: "HELMET", total: 0, minStock: 0 });

  useEffect(() => {
    if (settings) {
      // Migrate targets to per-vehicle-type format
      let t = settings.targets;
      if (t && !t.MOTORCYCLE) {
        t = { MOTORCYCLE: t, CAR: JSON.parse(JSON.stringify(t)) };
      }
      setTargets(t);

      // Migrate shiftRules to per-vehicle-type format with new field names
      const migrateVT = (vt: any) => ({
        defaultHoursPerDay: vt?.defaultHoursPerShift ?? vt?.defaultHoursPerDay ?? 12,
        maxLateMinutes: vt?.maxLateMinutes ?? 1,
        earlyLogOutMinutes: vt?.earlyClockOutMinutes ?? vt?.earlyLogOutMinutes ?? 15,
        maxCashHoldKD: vt?.maxCashHoldKD ?? 50,
      });
      let sr = settings.shiftRules;
      if (sr) {
        if (!sr.MOTORCYCLE) {
          sr = { MOTORCYCLE: migrateVT(sr), CAR: migrateVT(sr) };
        } else {
          sr = { MOTORCYCLE: migrateVT(sr.MOTORCYCLE), CAR: migrateVT(sr.CAR) };
        }
      }
      setShiftRules(sr);

      setKpis(settings.kpis);
      setZones(settings.zones || []);
      setViolationRules(settings.violationRules);
      setCashRules(settings.cashRules);
      setBookingRules(settings.bookingRules);
      setDocumentRules(settings.documentRules);
      setNotificationConfig(settings.notificationConfig);
    }
  }, [settings]);

  useEffect(() => {
    if (inventoryData?.data) {
      setInventoryItems(inventoryData.data);
    }
  }, [inventoryData]);

  function showSaveStatus(status: "success" | "error", msg?: string) {
    setSaveStatus(status);
    if (msg) setErrorMsg(msg);
    setTimeout(() => { setSaveStatus("idle"); setErrorMsg(""); }, 3000);
  }

  async function handleSaveSettings() {
    setSaving(true);
    try {
      await api.put(`/api/platform-settings/${platform}`, { targets, kpis, shiftRules, zones, violationRules, cashRules, bookingRules, documentRules, notificationConfig });
      showSaveStatus("success");
      refetch();
    } catch (err: any) {
      showSaveStatus("error", err?.response?.data?.error || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInventory() {
    setSaving(true);
    try {
      const items = inventoryItems.map((item: any) => ({
        itemType: item.itemType,
        total: item.total,
        issued: item.issued,
        minStock: item.minStock,
      }));
      await api.put(`/api/platform-settings/${platform}/inventory`, { items });
      showSaveStatus("success");
      refetchInventory();
    } catch (err: any) {
      showSaveStatus("error", err?.response?.data?.error || "Failed to save inventory");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddInventoryItem() {
    setSaving(true);
    try {
      await api.put(`/api/platform-settings/${platform}/inventory`, {
        items: [{ itemType: addItem.itemType, total: addItem.total, issued: 0, minStock: addItem.minStock }],
      });
      setShowAddInventory(false);
      setAddItem({ itemType: "HELMET", total: 0, minStock: 0 });
      showSaveStatus("success");
      refetchInventory();
    } catch (err: any) {
      showSaveStatus("error", err?.response?.data?.error || "Failed to add item");
    } finally {
      setSaving(false);
    }
  }

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "targets", label: "Targets", icon: Target },
    { key: "kpis", label: "KPIs", icon: BarChart3 },
    { key: "violations", label: "Violations", icon: ShieldAlert },
    { key: "cash", label: "Cash", icon: Banknote },
    { key: "booking", label: "Booking", icon: CalendarClock },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "zones", label: "Zones", icon: MapPin },
    { key: "inventory", label: "Inventory", icon: Package },
  ];

  const isLoading = tab === "inventory" ? inventoryLoading : settingsLoading;

  function SaveButton({ onClick }: { onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        disabled={saving}
        className={cn(
          "flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl transition-all duration-200",
          saveStatus === "success"
            ? "bg-green-500 text-white"
            : saveStatus === "error"
            ? "bg-red-500 text-white"
            : "bg-primary text-white hover:bg-primary-hover shadow-sm hover:shadow"
        )}
      >
        {saving ? (
          <Loader2 size={16} className="animate-spin" />
        ) : saveStatus === "success" ? (
          <CheckCircle2 size={16} />
        ) : saveStatus === "error" ? (
          <AlertCircle size={16} />
        ) : (
          <Save size={16} />
        )}
        {saving ? "Saving..." : saveStatus === "success" ? "Saved!" : saveStatus === "error" ? "Error" : "Save Changes"}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{platformLabel} Settings</h1>
          <p className="text-sm text-secondary mt-1">Configure targets, rules, and operational settings</p>
        </div>
        <div className="flex items-center gap-3">
          {tab === "inventory" && (
            <button onClick={() => setShowAddInventory(true)}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
              <Plus size={16} /> Add Item
            </button>
          )}
          {tab !== "inventory" && (
            <SaveButton onClick={handleSaveSettings} />
          )}
          {tab === "inventory" && (
            <SaveButton onClick={handleSaveInventory} />
          )}
        </div>
      </div>

      {/* Error banner */}
      {saveStatus === "error" && errorMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
              tab === t.key ? "bg-white text-foreground shadow-sm" : "text-secondary hover:text-foreground"
            )}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm p-6 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-40 mb-4" />
              <div className="grid grid-cols-3 gap-4">
                <div className="h-10 bg-gray-100 rounded-xl" />
                <div className="h-10 bg-gray-100 rounded-xl" />
                <div className="h-10 bg-gray-100 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Targets Tab ── */}
      {tab === "targets" && targets && !isLoading && (
        <div className="space-y-6">
          {/* Vehicle Type Toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {(["MOTORCYCLE", "CAR"] as const).map((vt) => (
              <button key={vt} onClick={() => setVehicleType(vt)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                  vehicleType === vt ? "bg-white text-foreground shadow-sm" : "text-secondary hover:text-foreground"
                )}>
                {vt === "MOTORCYCLE" ? <Bike size={14} /> : <Car size={14} />}
                {vt === "MOTORCYCLE" ? "Motorcycle" : "Car"}
              </button>
            ))}
          </div>

          {/* Main Target */}
          {targets[vehicleType]?.mainTarget && (
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className={cn("p-2 rounded-xl bg-orange-50", platformColor)}>
                  <Target size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Main Target</h2>
                  <p className="text-xs text-secondary">Primary performance metric for this platform</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">{targets[vehicleType].mainTarget.name}</label>
                  <input
                    type="number"
                    min={0}
                    value={targets[vehicleType].mainTarget.value}
                    onChange={(e) => setTargets({ ...targets, [vehicleType]: { ...targets[vehicleType], mainTarget: { ...targets[vehicleType].mainTarget, value: Number(e.target.value) } } })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">Unit</label>
                  <input value={targets[vehicleType].mainTarget.unit} disabled
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-100 text-sm bg-gray-50 text-secondary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">Description</label>
                  <input value={targets[vehicleType].mainTarget.description || ""} disabled
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-100 text-sm bg-gray-50 text-secondary" />
                </div>
              </div>
            </div>
          )}

          {/* Sub Targets */}
          {targets[vehicleType]?.subTargets?.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Sub Targets</h2>
                  <p className="text-xs text-secondary">Secondary metrics tracked alongside the main target</p>
                </div>
              </div>
              <div className="space-y-0 divide-y divide-gray-100">
                {targets[vehicleType].subTargets.map((sub: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-4 gap-4 py-4 first:pt-0 last:pb-0">
                    <div>
                      <label className="block text-xs font-medium text-secondary mb-1.5">Name</label>
                      <input value={sub.name} disabled
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-100 text-sm bg-gray-50 text-secondary font-medium" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-secondary mb-1.5">Target Value</label>
                      <input
                        type="number"
                        min={0}
                        value={sub.value}
                        onChange={(e) => {
                          const updated = [...targets[vehicleType].subTargets];
                          updated[idx] = { ...sub, value: Number(e.target.value) };
                          setTargets({ ...targets, [vehicleType]: { ...targets[vehicleType], subTargets: updated } });
                        }}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-shadow"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-secondary mb-1.5">Unit</label>
                      <input value={sub.unit} disabled
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-100 text-sm bg-gray-50 text-secondary" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-secondary mb-1.5">Description</label>
                      <input value={sub.description || ""} disabled
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-100 text-sm bg-gray-50 text-secondary" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shift Rules */}
          {shiftRules && shiftRules[vehicleType] && (
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-xl bg-violet-50 text-violet-600">
                  <Clock size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Shift Rules</h2>
                  <p className="text-xs text-secondary">Configure shift duration, attendance, and cash handling rules</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-1.5">
                    <Timer size={12} />
                    Default Hours per Day
                  </label>
                  <div className="relative">
                    <input type="number" min={1} max={24} value={shiftRules[vehicleType].defaultHoursPerDay}
                      onChange={(e) => setShiftRules({ ...shiftRules, [vehicleType]: { ...shiftRules[vehicleType], defaultHoursPerDay: Number(e.target.value) } })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-shadow pr-14" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">hours</span>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-1.5">
                    <AlertCircle size={12} />
                    Max Late Minutes (grace period)
                  </label>
                  <div className="relative">
                    <input type="number" min={0} max={60} value={shiftRules[vehicleType].maxLateMinutes}
                      onChange={(e) => setShiftRules({ ...shiftRules, [vehicleType]: { ...shiftRules[vehicleType], maxLateMinutes: Number(e.target.value) } })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-shadow pr-12" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">min</span>
                  </div>
                  <p className="text-[11px] text-secondary mt-1">After this, driver is marked LATE</p>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-1.5">
                    <Clock size={12} />
                    Early Log-Out Threshold
                  </label>
                  <div className="relative">
                    <input type="number" min={0} max={120} value={shiftRules[vehicleType].earlyLogOutMinutes}
                      onChange={(e) => setShiftRules({ ...shiftRules, [vehicleType]: { ...shiftRules[vehicleType], earlyLogOutMinutes: Number(e.target.value) } })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-shadow pr-12" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">min</span>
                  </div>
                  <p className="text-[11px] text-secondary mt-1">Log-out this early flags as early departure</p>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-1.5">
                    <span className="text-xs font-bold text-secondary">KD</span>
                    Max Cash Hold
                  </label>
                  <div className="relative">
                    <input type="number" min={0} value={shiftRules[vehicleType].maxCashHoldKD ?? ""}
                      onChange={(e) => setShiftRules({ ...shiftRules, [vehicleType]: { ...shiftRules[vehicleType], maxCashHoldKD: e.target.value === "" ? 0 : Number(e.target.value) } })}
                      placeholder="0"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-shadow pr-10" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">KD</span>
                  </div>
                  <p className="text-[11px] text-secondary mt-1">Maximum cash a driver can hold before deposit</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Inventory Tab ── */}
      {tab === "inventory" && !isLoading && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {inventoryItems.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left text-xs font-medium text-secondary px-5 py-3">Item</th>
                  <th className="text-left text-xs font-medium text-secondary px-5 py-3">Total</th>
                  <th className="text-left text-xs font-medium text-secondary px-5 py-3">Issued</th>
                  <th className="text-left text-xs font-medium text-secondary px-5 py-3">Available</th>
                </tr>
              </thead>
              <tbody>
                {inventoryItems.map((item: any) => {
                  const available = item.total - item.issued;
                  return (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-sm font-medium">{ITEM_LABELS[item.itemType] || item.itemType}</td>
                      <td className="px-5 py-3.5">
                        <input type="number" min={0} value={item.total}
                          onChange={(e) => {
                            const updated = inventoryItems.map((i: any) =>
                              i.id === item.id ? { ...i, total: Number(e.target.value), available: Number(e.target.value) - i.issued } : i
                            );
                            setInventoryItems(updated);
                          }}
                          className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
                      </td>
                      <td className="px-5 py-3.5 text-sm text-secondary">{item.issued}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-medium">{available}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-5 py-16 text-center">
              <Package size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm font-medium text-secondary">No inventory items configured</p>
              <p className="text-xs text-secondary mt-1">Click &quot;Add Item&quot; to get started</p>
            </div>
          )}
        </div>
      )}

      {/* ── KPIs Tab ── */}
      {tab === "kpis" && kpis && !isLoading && (
        <div className="space-y-6">
          {/* Grading Scale */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <BarChart3 size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold">Grading Scale</h2>
                <p className="text-xs text-secondary">Define grade labels, percentage ranges, and colors</p>
              </div>
            </div>
            <div className="space-y-2">
              {/* Header row */}
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-1 mb-1">
                <div className="w-3" />
                <div className="text-xs font-medium text-secondary">Label</div>
                <div className="text-xs font-medium text-secondary w-[140px] text-center">Range (%)</div>
                <div className="text-xs font-medium text-secondary w-8 text-center">Color</div>
              </div>
              {kpis.gradingScale?.map((grade: any, idx: number) => (
                <div key={idx} className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center bg-gray-50/50 rounded-xl px-3 py-2.5">
                  <div className="w-3 h-3 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: grade.color }} />
                  <input value={grade.label}
                    onChange={(e) => {
                      const updated = [...kpis.gradingScale];
                      updated[idx] = { ...grade, label: e.target.value };
                      setKpis({ ...kpis, gradingScale: updated });
                    }}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
                  <div className="flex items-center gap-2 w-[140px]">
                    <input type="number" min={0} max={100} value={grade.minPercent}
                      onChange={(e) => {
                        const updated = [...kpis.gradingScale];
                        updated[idx] = { ...grade, minPercent: Number(e.target.value) };
                        setKpis({ ...kpis, gradingScale: updated });
                      }}
                      className="w-14 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
                    <span className="text-secondary text-sm">–</span>
                    <input type="number" min={0} max={100} value={grade.maxPercent}
                      onChange={(e) => {
                        const updated = [...kpis.gradingScale];
                        updated[idx] = { ...grade, maxPercent: Number(e.target.value) };
                        setKpis({ ...kpis, gradingScale: updated });
                      }}
                      className="w-14 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
                  </div>
                  <ColorPicker value={grade.color} onChange={(c) => {
                      const updated = [...kpis.gradingScale];
                      updated[idx] = { ...grade, color: c };
                      setKpis({ ...kpis, gradingScale: updated });
                    }} />
                </div>
              ))}
            </div>
          </div>

          {/* KPI Weights */}
          {kpis.weights && (
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Hash size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold">KPI Weights</h2>
                  <p className="text-xs text-secondary">How much each factor contributes to the Darb grade</p>
                </div>
              </div>
              {(() => {
                const total = Object.values(kpis.weights).reduce((a: number, b: any) => a + Number(b), 0);
                const isValid = total === 100;
                return (
                  <>
                    <div className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mb-4 mt-3",
                      isValid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                    )}>
                      {isValid ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                      Total: {total}% {!isValid && "— Must equal 100%"}
                    </div>
                    <div className="space-y-3">
                      {Object.entries(kpis.weights).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-4">
                          <label className="text-sm font-medium w-[140px] shrink-0">
                            {key === "utr" ? "UTR" : key.replace(/([A-Z])/g, " $1").trim().replace(/^\w/, c => c.toUpperCase())}
                          </label>
                          <div className="relative w-[90px] shrink-0">
                            <input type="number" min={0} max={100} value={value as number}
                              onChange={(e) => setKpis({ ...kpis, weights: { ...kpis.weights, [key]: Number(e.target.value) } })}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-7" />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-secondary">%</span>
                          </div>
                          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/60 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(Number(value), 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-secondary w-[30px] text-right shrink-0">{value as number}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Thresholds */}
          {kpis.thresholds && (
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <Target size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Performance Thresholds</h2>
                  <p className="text-xs text-secondary">Boundary values for performance grading calculations</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                {Object.entries(kpis.thresholds).map(([key, value]) => (
                  <div key={key} className="bg-gray-50/50 rounded-xl p-3">
                    <label className="block text-xs font-medium text-secondary mb-1.5">
                      {key.replace(/([A-Z])/g, " $1").trim().replace(/\butr\b/gi, "UTR").replace(/^\w/, c => c.toUpperCase())}
                    </label>
                    <input type="number" value={value as number}
                      onChange={(e) => setKpis({ ...kpis, thresholds: { ...kpis.thresholds, [key]: Number(e.target.value) } })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-shadow" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Zones Tab ── */}
      {tab === "zones" && !isLoading && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600">
              <MapPin size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold">Zones</h2>
              <p className="text-xs text-secondary">Define delivery zones for this platform ({zones.length} zones)</p>
            </div>
          </div>
          {zones.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-5">
              {zones.map((zone, idx) => (
                <div key={idx} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-sm group hover:border-gray-200 transition-colors">
                  <span>{zone}</span>
                  <button
                    onClick={() => setZones(zones.filter((_, i) => i !== idx))}
                    className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 mb-5">
              <MapPin size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-secondary">No zones configured yet</p>
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={newZone}
              onChange={(e) => setNewZone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newZone.trim()) {
                  setZones([...zones, newZone.trim()]);
                  setNewZone("");
                }
              }}
              placeholder="Add zone name..."
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-shadow"
            />
            <button
              onClick={() => { if (newZone.trim()) { setZones([...zones, newZone.trim()]); setNewZone(""); } }}
              disabled={!newZone.trim()}
              className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-40"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Violations Tab ── */}
      {tab === "violations" && violationRules && !isLoading && (
        <div className="space-y-6">
          {/* Violation Rules */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-red-50 text-red-600">
                <ShieldAlert size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold">Violation Rules</h2>
                <p className="text-xs text-secondary">Configure penalty points and auto-detection for each violation type</p>
              </div>
            </div>
            <div className="space-y-0 divide-y divide-gray-100">
              {violationRules.rules?.map((rule: any, idx: number) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_80px_auto] gap-4 items-center py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{rule.label}</p>
                    <p className="text-xs text-secondary mt-0.5">{rule.description}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-secondary mb-1">Penalty Pts</label>
                    <input type="number" min={0} max={20} value={rule.penaltyPoints}
                      onChange={(e) => {
                        const updated = [...violationRules.rules];
                        updated[idx] = { ...rule, penaltyPoints: Number(e.target.value) };
                        setViolationRules({ ...violationRules, rules: updated });
                      }}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
                  </div>
                  <div className="text-center">
                    <label className="block text-[10px] font-medium text-secondary mb-1">Auto</label>
                    <button
                      onClick={() => {
                        const updated = [...violationRules.rules];
                        updated[idx] = { ...rule, autoDetect: !rule.autoDetect };
                        setViolationRules({ ...violationRules, rules: updated });
                      }}
                      className={cn("px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                        rule.autoDetect ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
                      )}>
                      {rule.autoDetect ? "ON" : "OFF"}
                    </button>
                  </div>
                  <div className="w-3">
                    <div className={cn("w-2.5 h-2.5 rounded-full",
                      rule.penaltyPoints >= 4 ? "bg-red-500" : rule.penaltyPoints >= 2 ? "bg-amber-500" : "bg-green-500"
                    )} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Penalty Thresholds */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <AlertCircle size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold">Penalty Thresholds</h2>
                <p className="text-xs text-secondary">When accumulated points reach these levels, actions are triggered</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Warning Threshold</label>
                <div className="relative">
                  <input type="number" min={1} value={violationRules.maxPointsBeforeWarning}
                    onChange={(e) => setViolationRules({ ...violationRules, maxPointsBeforeWarning: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">pts</span>
                </div>
                <p className="text-[11px] text-secondary mt-1">Driver receives a warning at this point count</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Suspension Threshold</label>
                <div className="relative">
                  <input type="number" min={1} value={violationRules.maxPointsBeforeSuspension}
                    onChange={(e) => setViolationRules({ ...violationRules, maxPointsBeforeSuspension: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">pts</span>
                </div>
                <p className="text-[11px] text-secondary mt-1">Driver is suspended at this point count</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Points Reset Period</label>
                <div className="relative">
                  <input type="number" min={1} value={violationRules.pointsResetDays}
                    onChange={(e) => setViolationRules({ ...violationRules, pointsResetDays: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-14" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">days</span>
                </div>
                <p className="text-[11px] text-secondary mt-1">Points reset to 0 after this many days</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Cash Rules Tab ── */}
      {tab === "cash" && cashRules && !isLoading && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <Banknote size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold">Cash Management Rules</h2>
                <p className="text-xs text-secondary">Configure deposit limits, deadlines, and collection policies</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-1.5">
                  <span className="text-xs font-bold text-secondary">KD</span>
                  Maximum Cash Hold
                </label>
                <div className="relative">
                  <input type="number" min={0} value={cashRules.maxCashHoldKD}
                    onChange={(e) => setCashRules({ ...cashRules, maxCashHoldKD: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">KD</span>
                </div>
                <p className="text-[11px] text-secondary mt-1">Max cash a driver can hold before mandatory deposit</p>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-1.5">
                  <Clock size={12} />
                  Overdue After
                </label>
                <div className="relative">
                  <input type="number" min={1} value={cashRules.overdueDays}
                    onChange={(e) => setCashRules({ ...cashRules, overdueDays: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-14" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">days</span>
                </div>
                <p className="text-[11px] text-secondary mt-1">Days without deposit before flagging as overdue</p>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-1.5">
                  <Bell size={12} />
                  Deposit Reminder
                </label>
                <div className="relative">
                  <input type="number" min={1} value={cashRules.depositReminderHours}
                    onChange={(e) => setCashRules({ ...cashRules, depositReminderHours: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-14" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">hours</span>
                </div>
                <p className="text-[11px] text-secondary mt-1">Send reminder this many hours before deposit deadline</p>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-1.5">
                  <span className="text-xs font-bold text-secondary">KD</span>
                  Penalty Per Overdue Day
                </label>
                <div className="relative">
                  <input type="number" min={0} step={0.5} value={cashRules.penaltyPerOverdueDay}
                    onChange={(e) => setCashRules({ ...cashRules, penaltyPerOverdueDay: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">KD</span>
                </div>
                <p className="text-[11px] text-secondary mt-1">Deducted per day after overdue (0 = no penalty)</p>
              </div>
            </div>
          </div>

          {/* Toggles & Collection Days */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Calendar size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold">Collection Policies</h2>
                <p className="text-xs text-secondary">When and how cash should be collected</p>
              </div>
            </div>
            <div className="space-y-4">
              {/* Toggles */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { key: "autoAlertOnOverdue", label: "Auto Alert on Overdue" },
                  { key: "dailyCollectionRequired", label: "Daily Collection Required" },
                  { key: "receiptRequired", label: "Receipt Required" },
                ].map((toggle) => (
                  <button key={toggle.key}
                    onClick={() => setCashRules({ ...cashRules, [toggle.key]: !cashRules[toggle.key] })}
                    className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors",
                      cashRules[toggle.key] ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-500"
                    )}>
                    <div className={cn("w-8 h-5 rounded-full relative transition-colors", cashRules[toggle.key] ? "bg-green-500" : "bg-gray-300")}>
                      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", cashRules[toggle.key] ? "left-3.5" : "left-0.5")} />
                    </div>
                    {toggle.label}
                  </button>
                ))}
              </div>

              {/* Collection Days */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-2">Collection Days</label>
                <div className="flex gap-2">
                  {["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((day) => (
                    <button key={day}
                      onClick={() => {
                        const days = cashRules.collectionDays || [];
                        setCashRules({
                          ...cashRules,
                          collectionDays: days.includes(day) ? days.filter((d: string) => d !== day) : [...days, day],
                        });
                      }}
                      className={cn("px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                        (cashRules.collectionDays || []).includes(day)
                          ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      )}>
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Allowed Deposit Methods */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-2">Allowed Deposit Methods</label>
                <div className="flex gap-2">
                  {[
                    { key: "CASH", label: "Cash" },
                    { key: "BANK_TRANSFER", label: "Bank Transfer" },
                    { key: "AL_MUZAINI", label: "Al Muzaini" },
                  ].map((method) => (
                    <button key={method.key}
                      onClick={() => {
                        const methods = cashRules.allowedDepositMethods || [];
                        setCashRules({
                          ...cashRules,
                          allowedDepositMethods: methods.includes(method.key) ? methods.filter((m: string) => m !== method.key) : [...methods, method.key],
                        });
                      }}
                      className={cn("px-4 py-2 rounded-lg text-xs font-medium transition-colors",
                        (cashRules.allowedDepositMethods || []).includes(method.key)
                          ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      )}>
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Booking Rules Tab ── */}
      {tab === "booking" && bookingRules && !isLoading && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <CalendarClock size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold">Shift Booking Rules</h2>
                <p className="text-xs text-secondary">Configure booking windows, limits, and scheduling rules</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Booking Window Day</label>
                <select value={bookingRules.bookingWindowDay || ""}
                  onChange={(e) => setBookingRules({ ...bookingRules, bookingWindowDay: e.target.value || null })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow">
                  <option value="">No specific day</option>
                  {["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((d) => (
                    <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
                  ))}
                </select>
                <p className="text-[11px] text-secondary mt-1">Day when shift booking opens each week</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">Window Start</label>
                  <div className="relative">
                    <input type="number" min={0} max={23} value={bookingRules.bookingWindowStartHour ?? ""}
                      onChange={(e) => setBookingRules({ ...bookingRules, bookingWindowStartHour: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-14" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-secondary">:00</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">Window End</label>
                  <div className="relative">
                    <input type="number" min={0} max={23} value={bookingRules.bookingWindowEndHour ?? ""}
                      onChange={(e) => setBookingRules({ ...bookingRules, bookingWindowEndHour: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-14" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-secondary">:00</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Min Hours per Week</label>
                <input type="number" min={0} max={7} value={bookingRules.minShiftsPerWeek}
                  onChange={(e) => setBookingRules({ ...bookingRules, minShiftsPerWeek: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
                <p className="text-[11px] text-secondary mt-1">Minimum hours a driver must work per week</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Max Hours per Week</label>
                <input type="number" min={1} max={7} value={bookingRules.maxShiftsPerWeek}
                  onChange={(e) => setBookingRules({ ...bookingRules, maxShiftsPerWeek: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
                <p className="text-[11px] text-secondary mt-1">Maximum hours allowed per week</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Break Duration</label>
                <div className="relative">
                  <input type="number" min={0} max={120} value={bookingRules.breakDurationMinutes}
                    onChange={(e) => setBookingRules({ ...bookingRules, breakDurationMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-12" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">min</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Max Consecutive Days</label>
                <input type="number" min={1} max={14} value={bookingRules.maxConsecutiveDays}
                  onChange={(e) => setBookingRules({ ...bookingRules, maxConsecutiveDays: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
                <p className="text-[11px] text-secondary mt-1">Max days a driver can work without a break</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Reminder Before Booking</label>
                <div className="relative">
                  <input type="number" min={1} max={72} value={bookingRules.reminderBeforeHours}
                    onChange={(e) => setBookingRules({ ...bookingRules, reminderBeforeHours: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow pr-14" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">hours</span>
                </div>
              </div>
            </div>
          </div>

          {/* Booking Toggles */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="text-sm font-semibold mb-4">Booking Options</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "reminderEnabled", label: "Send Booking Reminders", desc: "Notify drivers before booking window opens" },
                { key: "allowSameDay", label: "Allow Same-Day Booking", desc: "Drivers can book shifts for today" },
              ].map((toggle) => (
                <button key={toggle.key}
                  onClick={() => setBookingRules({ ...bookingRules, [toggle.key]: !bookingRules[toggle.key] })}
                  className={cn("flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors",
                    bookingRules[toggle.key] ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"
                  )}>
                  <div className={cn("mt-0.5 w-8 h-5 rounded-full relative transition-colors flex-shrink-0", bookingRules[toggle.key] ? "bg-green-500" : "bg-gray-300")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", bookingRules[toggle.key] ? "left-3.5" : "left-0.5")} />
                  </div>
                  <div>
                    <p className={cn("text-sm font-medium", bookingRules[toggle.key] ? "text-green-700" : "text-gray-500")}>{toggle.label}</p>
                    <p className="text-[11px] text-secondary mt-0.5">{toggle.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* ── Notifications Tab ── */}
      {tab === "notifications" && notificationConfig && !isLoading && (
        <div className="space-y-6">
          {/* Channels */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-violet-50 text-violet-600">
                <Bell size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold">Notification Channels</h2>
                <p className="text-xs text-secondary">Enable or disable notification delivery channels</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { key: "inApp", label: "In-App" },
                { key: "email", label: "Email" },
              ].map((ch) => (
                <button key={ch.key}
                  onClick={() => setNotificationConfig({
                    ...notificationConfig,
                    channels: { ...notificationConfig.channels, [ch.key]: !notificationConfig.channels[ch.key] },
                  })}
                  className={cn("flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors",
                    notificationConfig.channels[ch.key]
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-gray-200 bg-gray-50 text-gray-400"
                  )}>
                  <div className={cn("w-2 h-2 rounded-full", notificationConfig.channels[ch.key] ? "bg-green-500" : "bg-gray-300")} />
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Event Notifications */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <Users size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold">Event Notifications</h2>
                <p className="text-xs text-secondary">Choose which events trigger notifications and who receives them</p>
              </div>
            </div>
            <div className="space-y-0 divide-y divide-gray-100">
              {notificationConfig.events?.map((event: any, idx: number) => (
                <div key={idx} className="grid grid-cols-[auto_1fr_auto] gap-4 items-center py-3.5 first:pt-0 last:pb-0">
                  <button
                    onClick={() => {
                      const updated = [...notificationConfig.events];
                      updated[idx] = { ...event, enabled: !event.enabled };
                      setNotificationConfig({ ...notificationConfig, events: updated });
                    }}
                    className={cn("w-8 h-5 rounded-full relative transition-colors flex-shrink-0",
                      event.enabled ? "bg-green-500" : "bg-gray-300"
                    )}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                      event.enabled ? "left-3.5" : "left-0.5"
                    )} />
                  </button>
                  <div>
                    <p className={cn("text-sm font-medium", event.enabled ? "text-foreground" : "text-gray-400")}>{event.label}</p>
                  </div>
                  <div className="flex gap-1">
                    {["ADMIN", "OPS_MANAGER", "SUPERVISOR", "ACCOUNTANT"].map((role) => (
                      <button key={role}
                        onClick={() => {
                          const updated = [...notificationConfig.events];
                          const roles = event.roles || [];
                          updated[idx] = {
                            ...event,
                            roles: roles.includes(role) ? roles.filter((r: string) => r !== role) : [...roles, role],
                          };
                          setNotificationConfig({ ...notificationConfig, events: updated });
                        }}
                        className={cn("px-2 py-1 rounded text-[10px] font-medium transition-colors",
                          (event.roles || []).includes(role)
                            ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-400"
                        )}>
                        {role === "OPS_MANAGER" ? "OPS" : role.slice(0, 5)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">Quiet Hours</h3>
                <p className="text-xs text-secondary mt-0.5">Suppress non-critical notifications during these hours</p>
              </div>
              <button
                onClick={() => setNotificationConfig({ ...notificationConfig, quietHoursEnabled: !notificationConfig.quietHoursEnabled })}
                className={cn("w-10 h-6 rounded-full relative transition-colors",
                  notificationConfig.quietHoursEnabled ? "bg-green-500" : "bg-gray-300"
                )}>
                <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all",
                  notificationConfig.quietHoursEnabled ? "left-5" : "left-1"
                )} />
              </button>
            </div>
            {notificationConfig.quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">Start</label>
                  <input type="time" value={notificationConfig.quietHoursStart}
                    onChange={(e) => setNotificationConfig({ ...notificationConfig, quietHoursStart: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">End</label>
                  <input type="time" value={notificationConfig.quietHoursEnd}
                    onChange={(e) => setNotificationConfig({ ...notificationConfig, quietHoursEnd: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Add Inventory Modal */}
      {showAddInventory && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddInventory(false)}>
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Add Inventory Item</h2>
              <button onClick={() => setShowAddInventory(false)} className="p-1.5 hover:bg-gray-50 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Item Type</label>
                <select value={addItem.itemType} onChange={(e) => setAddItem({ ...addItem, itemType: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow">
                  {INVENTORY_ITEMS.map((item) => <option key={item} value={item}>{ITEM_LABELS[item]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Total Quantity</label>
                <input type="number" min={0} value={addItem.total}
                  onChange={(e) => setAddItem({ ...addItem, total: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow" />
              </div>
              <button onClick={handleAddInventoryItem} disabled={saving}
                className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-40">
                {saving ? "Adding..." : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
