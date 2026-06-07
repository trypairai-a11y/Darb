"use client";
import { useState } from "react";
import api from "@/lib/api";
import { useApiGet } from "@/hooks/useApi";
import { X, Loader2 } from "lucide-react";

interface AddSimModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddSimModal({ onClose, onSuccess }: AddSimModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    phoneNumber: "",
    carrier: "",
    status: "ACTIVE",
    driverId: "",
    deviceId: "",
    notes: "",
  });

  const { data: driversData } = useApiGet<any>("/api/drivers?limit=500");
  const drivers = driversData?.data || driversData || [];

  const { data: devicesData } = useApiGet<any>("/api/devices?limit=500");
  const devices = devicesData?.data || devicesData || [];

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = form.phoneNumber.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/sims", {
        phoneNumber: form.phoneNumber.trim(),
        carrier: form.carrier || undefined,
        status: form.status,
        driverId: form.driverId || undefined,
        deviceId: form.deviceId || undefined,
        notes: form.notes || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to create SIM");
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
            <h2 className="text-lg font-semibold">Add SIM</h2>
            <p className="text-xs text-secondary mt-0.5">
              Register a SIM card. Driver and device assignments are optional.
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
            <label className={labelClass}>Phone number *</label>
            <input
              value={form.phoneNumber}
              onChange={(e) => update("phoneNumber", e.target.value)}
              className={inputClass}
              placeholder="+96512345678"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Carrier</label>
              <select
                value={form.carrier}
                onChange={(e) => update("carrier", e.target.value)}
                className={inputClass}
              >
                <option value="">Select…</option>
                <option value="Zain">Zain</option>
                <option value="Ooredoo">Ooredoo</option>
                <option value="STC">STC</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                className={inputClass}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
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

          <div>
            <label className={labelClass}>Link to device (optional)</label>
            <select
              value={form.deviceId}
              onChange={(e) => update("deviceId", e.target.value)}
              className={inputClass}
            >
              <option value="">No linked device</option>
              {devices.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.model} · IMEI {d.imei}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              className={inputClass}
              rows={2}
              placeholder="Optional notes…"
            />
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
            {submitting ? "Saving…" : "Add SIM"}
          </button>
        </div>
      </div>
    </div>
  );
}
