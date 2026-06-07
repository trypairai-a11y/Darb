"use client";
import { useState, useMemo } from "react";
import api from "@/lib/api";
import { useApiGet } from "@/hooks/useApi";
import { X, Loader2, Search, Check } from "lucide-react";

interface AssignDriversModalProps {
  vehicle: any;
  onClose: () => void;
  onSuccess: () => void;
}

const PLATFORM_BADGE: Record<string, string> = {
  TALABAT: "bg-red-50 text-red-700",
  KEETA: "bg-amber-50 text-amber-700",
  DELIVEROO: "bg-emerald-50 text-emerald-700",
  AMERICANA: "bg-blue-50 text-blue-700",
};

export default function AssignDriversModal({ vehicle, onClose, onSuccess }: AssignDriversModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Currently assigned drivers come from the junction (vehicle.drivers),
  // falling back to the legacy single assignedDriver.
  const initialIds: string[] = useMemo(() => {
    const fromMany = (vehicle?.drivers || []).map((d: any) => d.id);
    if (fromMany.length > 0) return fromMany;
    return vehicle?.assignedDriver?.id ? [vehicle.assignedDriver.id] : [];
  }, [vehicle]);

  const [selected, setSelected] = useState<Set<string>>(new Set(initialIds));

  const { data: driversData } = useApiGet<any>("/api/drivers?limit=500");
  const drivers: any[] = driversData?.data || driversData || [];

  const filtered = useMemo(() => {
    if (!query) return drivers;
    const q = query.toLowerCase();
    return drivers.filter(
      (d) =>
        (d.name || "").toLowerCase().includes(q) ||
        (d.phone || "").toLowerCase().includes(q) ||
        (d.zone || "").toLowerCase().includes(q)
    );
  }, [drivers, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      // Replace the full set of drivers for this vehicle.
      await api.put(`/api/vehicles/${vehicle.id}/drivers`, {
        driverIds: Array.from(selected),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to update assignments");
    } finally {
      setSubmitting(false);
    }
  }

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
            <h2 className="text-lg font-semibold">Assign drivers</h2>
            <p className="text-xs text-secondary mt-0.5">
              {vehicle.plateNumber}
              {vehicle.make ? ` · ${vehicle.make}` : ""}
              {vehicle.model ? ` ${vehicle.model}` : ""} — this car can be shared by multiple drivers.
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        <div className="px-6 pt-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search driver, phone, zone…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <p className="text-xs text-secondary mt-2">
            {selected.size} driver{selected.size === 1 ? "" : "s"} selected
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-secondary">No drivers found.</p>
          )}
          {filtered.map((d) => {
            const isOn = selected.has(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggle(d.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                  isOn ? "bg-emerald-50" : "hover:bg-gray-50"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-md border ${
                    isOn ? "bg-primary border-primary text-white" : "border-gray-300"
                  }`}
                >
                  {isOn && <Check size={13} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{d.name}</span>
                  {d.phone && <span className="text-xs text-secondary"> · {d.phone}</span>}
                </span>
                {d.platform && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      PLATFORM_BADGE[d.platform] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {d.platform}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-secondary hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={submitting}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Saving…" : "Save assignments"}
          </button>
        </div>
      </div>
    </div>
  );
}
