"use client";
import { useMemo, useState } from "react";
import api from "@/lib/api";
import { X, Loader2 } from "lucide-react";
import { ITEM_TYPES, toItemSlug } from "@/lib/equipmentItems";

/**
 * Revision 4 (#13): Darb is the only platform in scope. The dropdown is gone
 * rather than reduced to a single option — a select with one choice is a
 * question with one answer, which is not a question.
 */
const DARB_PLATFORM = "DARB";

interface ExistingItem {
  platform: string;
  itemType: string;
}

interface BootstrapItem {
  itemType: string;
  total: number;
  issued?: number;
  minStock?: number;
}

interface AddPlatformEquipmentModalProps {
  onClose: () => void;
  onSuccess: () => void;
  existing?: ExistingItem[];
  /**
   * Pools shown on screen that were never saved. Sent with the first real add
   * so the table does not collapse to the one row that now exists in the API.
   */
  bootstrap?: BootstrapItem[];
}

type Mode = "existing" | "new";

export default function AddPlatformEquipmentModal({
  onClose,
  onSuccess,
  existing = [],
  bootstrap,
}: AddPlatformEquipmentModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every one of the fourteen built-in types already has a pool on a mature
  // tenant, which is what made the old modal feel like it could do nothing.
  // Open on "new item" once there is nothing left to pick.
  const takenSlugs = useMemo(
    () => new Set(existing.map((e) => e.itemType)),
    [existing]
  );
  const unusedBuiltIns = ITEM_TYPES.filter((i) => !takenSlugs.has(i.value));
  const [mode, setMode] = useState<Mode>(unusedBuiltIns.length > 0 ? "existing" : "new");

  const [form, setForm] = useState({
    platform: DARB_PLATFORM,
    itemType: unusedBuiltIns[0]?.value || ITEM_TYPES[0].value,
    newName: "",
    total: "",
    minStock: "",
  });

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const newSlug = toItemSlug(form.newName);
  const effectiveSlug = mode === "new" ? newSlug : form.itemType;

  const totalNum = Number(form.total);
  const minStockNum = Number(form.minStock || "0");
  const isDuplicate =
    !!effectiveSlug &&
    existing.some((e) => e.platform === form.platform && e.itemType === effectiveSlug);
  const canSubmit =
    !!form.platform &&
    !!effectiveSlug &&
    form.total !== "" &&
    !isNaN(totalNum) &&
    totalNum >= 0 &&
    !isDuplicate;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const carriedOver = (bootstrap || []).filter((b) => b.itemType !== effectiveSlug);
      await api.put(`/api/platform-settings/${form.platform}/inventory`, {
        items: [
          ...carriedOver,
          {
            itemType: effectiveSlug,
            ...(mode === "new" ? { label: form.newName.trim() } : {}),
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
            <h2 className="text-lg font-semibold">Add equipment</h2>
            <p className="text-xs text-secondary mt-0.5">
              Stock one of the standard items, or create an item of your own.
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
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(
              [
                { key: "existing", label: "Standard item" },
                { key: "new", label: "New item" },
              ] as { key: Mode; label: string }[]
            ).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={
                  "flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors " +
                  (mode === m.key
                    ? "bg-white text-foreground shadow-sm"
                    : "text-secondary hover:text-foreground")
                }
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
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
                    {takenSlugs.has(i.value) ? " (already stocked)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className={labelClass}>Item name *</label>
              <input
                value={form.newName}
                onChange={(e) => update("newName", e.target.value)}
                className={inputClass}
                placeholder="Rain jacket"
                autoFocus
              />
              <p className="text-[11px] text-secondary mt-1">
                {newSlug
                  ? `Saved as ${newSlug}`
                  : "Letters and numbers only. Spaces become underscores."}
              </p>
            </div>
          )}

          {isDuplicate && (
            <div className="px-3 py-2 bg-amber-50 text-amber-700 text-xs rounded-lg">
              An inventory pool already exists for this item. Edit it directly from the
              table to adjust counts.
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
            {submitting ? "Saving…" : mode === "new" ? "Create Item" : "Add Equipment"}
          </button>
        </div>
      </div>
    </div>
  );
}
