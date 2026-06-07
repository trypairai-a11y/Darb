"use client";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import { useApiGet } from "@/hooks/useApi";
import { X, Loader2 } from "lucide-react";

interface AddVehicleModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddVehicleModal({ onClose, onSuccess }: AddVehicleModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    plateNumber: "",
    vehicleType: "MOTORCYCLE",
    companyId: "",
    make: "",
    model: "",
    year: "",
    color: "",
    registrationExpiry: "",
    assignedDriverId: "",
  });

  const { data: companiesData } = useApiGet<any>("/api/companies?limit=200");
  const companies = companiesData?.data || companiesData || [];

  const { data: driversData } = useApiGet<any>("/api/drivers?limit=500");
  const drivers = driversData?.data || driversData || [];

  useEffect(() => {
    if (companies.length > 0 && !form.companyId) {
      setForm((prev) => ({ ...prev, companyId: companies[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = form.plateNumber.trim() && form.vehicleType && form.companyId;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/vehicles", {
        plateNumber: form.plateNumber.trim(),
        vehicleType: form.vehicleType,
        companyId: form.companyId,
        make: form.make || undefined,
        model: form.model || undefined,
        year: form.year ? Number(form.year) : undefined,
        color: form.color || undefined,
        registrationExpiry: form.registrationExpiry || undefined,
        assignedDriverId: form.assignedDriverId || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to create vehicle");
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
            <h2 className="text-lg font-semibold">Add Vehicle</h2>
            <p className="text-xs text-secondary mt-0.5">Add a new vehicle to the fleet.</p>
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
              <label className={labelClass}>Plate number *</label>
              <input
                value={form.plateNumber}
                onChange={(e) => update("plateNumber", e.target.value)}
                className={inputClass}
                placeholder="e.g. 12345 / KW"
              />
            </div>
            <div>
              <label className={labelClass}>Vehicle type *</label>
              <select
                value={form.vehicleType}
                onChange={(e) => update("vehicleType", e.target.value)}
                className={inputClass}
              >
                <option value="MOTORCYCLE">Motorcycle</option>
                <option value="CAR">Car</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Company *</label>
            <select
              value={form.companyId}
              onChange={(e) => update("companyId", e.target.value)}
              className={inputClass}
            >
              <option value="">Select a company…</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.platform ? `(${c.platform})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Make</label>
              <input
                value={form.make}
                onChange={(e) => update("make", e.target.value)}
                className={inputClass}
                placeholder="e.g. Honda"
              />
            </div>
            <div>
              <label className={labelClass}>Model</label>
              <input
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                className={inputClass}
                placeholder="e.g. CB125"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Year</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => update("year", e.target.value)}
                className={inputClass}
                placeholder="2024"
              />
            </div>
            <div>
              <label className={labelClass}>Color</label>
              <input
                value={form.color}
                onChange={(e) => update("color", e.target.value)}
                className={inputClass}
                placeholder="Red"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Registration expiry</label>
            <input
              type="date"
              value={form.registrationExpiry}
              onChange={(e) => update("registrationExpiry", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Assign to driver (optional)</label>
            <select
              value={form.assignedDriverId}
              onChange={(e) => update("assignedDriverId", e.target.value)}
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
            {submitting ? "Saving…" : "Add Vehicle"}
          </button>
        </div>
      </div>
    </div>
  );
}
