"use client";
import { useState } from "react";
import api from "@/lib/api";
import { useApiGet } from "@/hooks/useApi";
import { X, Loader2 } from "lucide-react";

interface AddDeviceModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddDeviceModal({ onClose, onSuccess }: AddDeviceModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    imei: "",
    model: "",
    osVersion: "",
    driverId: "",
  });

  const { data: driversData } = useApiGet<any>("/api/drivers?limit=500");
  const drivers = driversData?.data || driversData || [];

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit =
    form.imei.trim().length > 0 && form.model.trim().length > 0 && form.osVersion.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/devices", {
        imei: form.imei.trim(),
        model: form.model.trim(),
        osVersion: form.osVersion.trim(),
        driverId: form.driverId || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to create device");
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
            <h2 className="text-lg font-semibold">Add Device</h2>
            <p className="text-xs text-secondary mt-0.5">
              Register a phone or tablet. SIM linkage is managed from the SIMs tab.
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
          <div>
            <label className={labelClass}>IMEI *</label>
            <input
              value={form.imei}
              onChange={(e) => update("imei", e.target.value)}
              className={inputClass}
              placeholder="15-digit IMEI"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Model *</label>
              <input
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                className={inputClass}
                placeholder="e.g. Samsung Galaxy A14"
              />
            </div>
            <div>
              <label className={labelClass}>OS version *</label>
              <input
                value={form.osVersion}
                onChange={(e) => update("osVersion", e.target.value)}
                className={inputClass}
                placeholder="e.g. Android 13"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Assign to driver (optional)</label>
            <select
              value={form.driverId}
              onChange={(e) => update("driverId", e.target.value)}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {drivers.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.phone ? `· ${d.phone}` : ""}
                </option>
              ))}
            </select>
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
            {submitting ? "Saving…" : "Add Device"}
          </button>
        </div>
      </div>
    </div>
  );
}
