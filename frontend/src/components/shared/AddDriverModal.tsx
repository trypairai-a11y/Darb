"use client";
import { useState, useEffect, useMemo } from "react";
import api from "@/lib/api";
import { useApiGet } from "@/hooks/useApi";
import { X, Loader2, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { itemDisplayName } from "@/lib/equipmentItems";

// Defaults. Item types ops created themselves are appended from the platform
// inventory below, so a new kind of kit is issuable the moment it exists.
const INVENTORY_ITEMS = [
  { key: "HELMET", label: "Helmet", hasQuantity: false },
  { key: "TSHIRT", label: "T-Shirts", hasQuantity: true },
  { key: "PANTS", label: "Pants", hasQuantity: true },
  { key: "COOLING_VEST", label: "Cooling Vests", hasQuantity: true },
  { key: "SAFETY_VEST", label: "Safety Vests", hasQuantity: true },
  { key: "WATER_BOTTLE", label: "Water Bottle", hasQuantity: true },
  { key: "GLOVES", label: "Gloves", hasQuantity: true },
  { key: "SAFETY_KIT", label: "Safety Kit", hasQuantity: true },
  { key: "BIG_BAG", label: "Big Bag", hasQuantity: false },
  { key: "SMALL_BAG", label: "Small Bag", hasQuantity: false },
  { key: "CAP", label: "Cap", hasQuantity: false },
  { key: "MOBILE_PHONE", label: "Mobile Phone", hasQuantity: false },
  { key: "SIM_CARD", label: "SIM Card", hasQuantity: false },
  { key: "PETROL_CARD", label: "Petrol Card", hasQuantity: false },
] as const;

const PLATFORMS = [
  { value: "TALABAT", label: "Talabat" },
  { value: "KEETA", label: "Keeta" },
  { value: "AMERICANA", label: "Americana" },
] as const;

type InventoryState = Record<string, { issued: boolean; quantity: number }>;

interface AddDriverModalProps {
  platform?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddDriverModal({ platform, onClose, onSuccess }: AddDriverModalProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    personalPhone: "",
    platform: platform || "",
    platformDriverId: "",
    vehicleType: "MOTORCYCLE",
    companyId: "",
  });

  const [inventory, setInventory] = useState<InventoryState>(() => {
    const init: InventoryState = {};
    INVENTORY_ITEMS.forEach((item) => {
      init[item.key] = { issued: false, quantity: 0 };
    });
    return init;
  });

  const { data: platformInventoryData } = useApiGet<any>(
    "/api/platform-settings/inventory/all"
  );

  const inventoryItems = useMemo(() => {
    const known = new Set(INVENTORY_ITEMS.map((i) => i.key));
    const extras = ((platformInventoryData?.data || []) as any[])
      .filter((row) => (row.platform ?? "DARB") === "DARB" && !known.has(row.itemType))
      .map((row) => ({
        key: row.itemType as string,
        label: itemDisplayName(row.itemType, row.label),
        hasQuantity: true,
      }));
    return [...INVENTORY_ITEMS, ...extras];
  }, [platformInventoryData]);

  // Fetch companies filtered by selected platform
  const selectedPlatform = form.platform;
  const companiesUrl = selectedPlatform
    ? `/api/companies?platform=${selectedPlatform}&limit=100`
    : null;
  const { data: companiesData } = useApiGet<any>(companiesUrl || "/api/companies?limit=100");
  const companies = companiesData?.data || [];

  // Auto-select first company when companies load
  useEffect(() => {
    if (companies.length > 0 && !form.companyId) {
      setForm((prev) => ({ ...prev, companyId: companies[0].id }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  function updateForm(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Reset companyId when platform changes
    if (key === "platform") {
      setForm((prev) => ({ ...prev, [key]: value, companyId: "" }));
    }
  }

  // Items ops created themselves have no seeded row, so read through a default.
  function toggleInventory(key: string) {
    setInventory((prev) => {
      const current = prev[key] || { issued: false, quantity: 0 };
      return {
        ...prev,
        [key]: { issued: !current.issued, quantity: !current.issued ? 1 : 0 },
      };
    });
  }

  function updateQuantity(key: string, qty: number) {
    setInventory((prev) => {
      const current = prev[key] || { issued: false, quantity: 0 };
      return { ...prev, [key]: { ...current, quantity: Math.max(0, qty) } };
    });
  }

  const canGoStep2 = form.name && form.phone && form.platform && form.companyId;
  const canSubmit = canGoStep2;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const issuedItems = Object.entries(inventory)
        .filter(([, v]) => v.issued)
        .map(([itemType, v]) => ({
          itemType,
          issued: true,
          quantity: v.quantity,
        }));

      await api.post("/api/drivers", {
        name: form.name,
        phone: form.phone,
        personalPhone: form.personalPhone || undefined,
        platform: form.platform,
        platformDriverId: form.platformDriverId || undefined,
        vehicleType: form.vehicleType,
        companyId: form.companyId,
        hireDate: new Date().toISOString(),
        inventory: issuedItems.length > 0 ? issuedItems : undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to create driver");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200";
  const labelClass = "block text-xs font-medium text-secondary mb-1";

  return (
    <div
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold">Add New Driver</h2>
            <p className="text-xs text-secondary mt-0.5">
              Step {step} of 2 &mdash; {step === 1 ? "Basic Information" : "Inventory"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pt-4 flex gap-2">
          <div className={cn("h-1 flex-1 rounded-full", step >= 1 ? "bg-primary" : "bg-gray-200")} />
          <div className={cn("h-1 flex-1 rounded-full", step >= 2 ? "bg-primary" : "bg-gray-200")} />
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 1 && (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className={labelClass}>Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  className={inputClass}
                  placeholder="Full name"
                />
              </div>

              {/* Company Phone */}
              <div>
                <label className={labelClass}>Company Phone Number *</label>
                <input
                  type="text"
                  required
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                  className={inputClass}
                  placeholder="+965 xxxx xxxx"
                />
              </div>

              {/* Personal Phone */}
              <div>
                <label className={labelClass}>Personal Phone Number</label>
                <input
                  type="text"
                  value={form.personalPhone}
                  onChange={(e) => updateForm("personalPhone", e.target.value)}
                  className={inputClass}
                  placeholder="+965 xxxx xxxx"
                />
              </div>

              {/* Platform */}
              {!platform && (
                <div>
                  <label className={labelClass}>Platform *</label>
                  <select
                    required
                    value={form.platform}
                    onChange={(e) => updateForm("platform", e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select platform</option>
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Driver ID */}
              <div>
                <label className={labelClass}>Driver ID</label>
                <input
                  type="text"
                  value={form.platformDriverId}
                  onChange={(e) => updateForm("platformDriverId", e.target.value)}
                  className={inputClass}
                  placeholder="Platform driver ID"
                />
              </div>

              {/* Vehicle Type */}
              <div>
                <label className={labelClass}>Vehicle Type *</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "MOTORCYCLE", label: "Motorcycle" },
                    { value: "CAR", label: "Car" },
                  ].map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => updateForm("vehicleType", v.value)}
                      className={cn(
                        "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors",
                        form.vehicleType === v.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      {form.vehicleType === v.value && <Check size={14} />}
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Company */}
              <div>
                <label className={labelClass}>Driver Company *</label>
                <select
                  required
                  value={form.companyId}
                  onChange={(e) => updateForm("companyId", e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select company</option>
                  {companies.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <p className="text-xs text-secondary mb-3">
                Toggle items issued to this driver. Set quantity where applicable.
              </p>
              {inventoryItems.map((item) => {
                const state = inventory[item.key] || { issued: false, quantity: 0 };
                return (
                  <div
                    key={item.key}
                    className={cn(
                      "flex items-center justify-between py-2.5 px-3 rounded-xl border transition-colors",
                      state.issued
                        ? "border-primary/30 bg-primary/5"
                        : "border-gray-100 bg-gray-50"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleInventory(item.key)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md border flex items-center justify-center transition-colors",
                          state.issued
                            ? "bg-primary border-primary text-white"
                            : "border-gray-300"
                        )}
                      >
                        {state.issued && <Check size={12} />}
                      </div>
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>

                    {item.hasQuantity && state.issued && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-secondary">Qty:</span>
                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.key, state.quantity - 1)}
                            className="px-2 py-1 text-sm hover:bg-gray-100 transition-colors"
                          >
                            -
                          </button>
                          <span className="px-2 py-1 text-sm font-medium tabular-nums min-w-[28px] text-center border-x border-gray-200">
                            {state.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.key, state.quantity + 1)}
                            className="px-2 py-1 text-sm hover:bg-gray-100 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}

                    {!item.hasQuantity && state.issued && (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-md">
                        Yes
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft size={14} /> Back
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              disabled={!canGoStep2}
              onClick={() => setStep(2)}
              className="flex-1 flex items-center justify-center gap-1 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !canSubmit}
              onClick={handleSubmit}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Creating..." : "Add Driver"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
