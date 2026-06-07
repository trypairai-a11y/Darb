"use client";
import { useState } from "react";
import api from "@/lib/api";
import { X, Loader2 } from "lucide-react";

const PLATFORMS = [
  { value: "TALABAT", label: "Talabat" },
  { value: "KEETA", label: "Keeta" },
  { value: "DELIVEROO", label: "Deliveroo" },
  { value: "AMERICANA", label: "Americana" },
];

const ITEM_TYPES: { value: string; label: string }[] = [
  { value: "HELMET", label: "Helmet" },
  { value: "TSHIRT", label: "T-Shirt" },
  { value: "PANTS", label: "Pants" },
  { value: "COOLING_VEST", label: "Cooling Vest" },
  { value: "SAFETY_VEST", label: "Safety Vest" },
  { value: "WATER_BOTTLE", label: "Water Bottle" },
  { value: "GLOVES", label: "Gloves" },
  { value: "SAFETY_KIT", label: "Safety Kit" },
  { value: "BIG_BAG", label: "Big Bag" },
  { value: "SMALL_BAG", label: "Small Bag" },
  { value: "CAP", label: "Cap" },
  { value: "MOBILE_PHONE", label: "Mobile Phone" },
  { value: "SIM_CARD", label: "SIM Card" },
  { value: "PETROL_CARD", label: "Petrol Card" },
];

interface ExistingItem {
  platform: string;
  itemType: string;
}

interface AddPlatformEquipmentModalProps {
  onClose: () => void;
  onSuccess: () => void;
  existing?: ExistingItem[];
}

export default function AddPlatformEquipmentModal({
  onClose,
  onSuccess,
  existing = [],
}: AddPlatformEquipmentModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    platform: "TALABAT",
    itemType: "HELMET",
    total: "",
    minStock: "",
  });

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const totalNum = Number(form.total);
  const minStockNum = Number(form.minStock || "0");
  const isDuplicate = existing.some(
    (e) => e.platform === form.platform && e.itemType === form.itemType
  );
  const canSubmit =
    form.platform &&
    form.itemType &&
    form.total !== "" &&
    !isNaN(totalNum) &&
    totalNum >= 0 &&
    !isDuplicate;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.put(`/api/platform-settings/${form.platform}/inventory`, {
        items: [
          {
            itemType: form.itemType,
            total: totalNum,
            minStock: minStockNum,
          },
        ],
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to add equipment");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200";
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
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold">Add Platform Equipment</h2>
            <p className="text-xs text-secondary mt-0.5">
              Create a new inventory pool for a platform and item type.
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Platform *</label>
              <select
                value={form.platform}
                onChange={(e) => update("platform", e.target.value)}
                className={inputClass}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Item type *</label>
              <select
                value={form.itemType}
                onChange={(e) => update("itemType", e.target.value)}
                className={inputClass}
              >
                {ITEM_TYPES.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isDuplicate && (
            <div className="px-3 py-2 bg-amber-50 text-amber-700 text-xs rounded-lg">
              An inventory pool already exists for this platform and item type. Edit it directly from
              the table to adjust counts.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Total stock *</label>
              <input
                type="number"
                min={0}
                value={form.total}
                onChange={(e) => update("total", e.target.value)}
                className={inputClass}
                placeholder="50"
              />
            </div>
            <div>
              <label className={labelClass}>Min stock alert</label>
              <input
                type="number"
                min={0}
                value={form.minStock}
                onChange={(e) => update("minStock", e.target.value)}
                className={inputClass}
                placeholder="5"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-secondary hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Saving…" : "Add Equipment"}
          </button>
        </div>
      </div>
    </div>
  );
}
