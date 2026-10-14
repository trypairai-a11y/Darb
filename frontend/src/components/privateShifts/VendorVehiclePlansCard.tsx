"use client";
// Revision 24 (#8) — on the shop's profile: which vehicles suit it, and each
// vehicle's two plans.
//
// Client note: "in the vendor profile, we must specify what type of vehicle is
// suitable for them in a checkbox, and each vehicle has its own delivery plan
// ... each vendor will be assigned two plans: per order and per hour rate."
//
// The per-order plan is one of the existing delivery plans (blank = the shop's
// own plan); the per-hour rate is what a private shift on that vehicle costs
// the shop. Ticking cars alone also makes the shop car-only for every order,
// which is what the old car-only switch meant.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Car } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { deliveryPlansApi, unwrapList } from "@/lib/darbApi";
import { privateShiftsApi } from "@/lib/privateShiftsApi";
import type { VehicleType } from "@/types/privateShifts";
import { VEHICLE_TYPES } from "@/types/privateShifts";
import { useI18n } from "@/i18n/I18nProvider";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

type Row = { vehicleType: VehicleType; deliveryPlanId: string | null; perHourKwd: string };

export default function VendorVehiclePlansCard({ vendorId, onSaved }: { vendorId: string; onSaved?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  const canEdit = hasRole("ADMIN");

  const plansQuery = useQuery({
    queryKey: ["darb", "vendor-vehicle-plans", vendorId],
    queryFn: () => privateShiftsApi.vendorPlans(vendorId),
  });
  const deliveryPlansQuery = useQuery({
    queryKey: ["darb", "delivery-plans", "picker"],
    queryFn: () => deliveryPlansApi.list({ limit: 100 }),
  });
  const deliveryPlans = unwrapList(deliveryPlansQuery.data).filter((p) => p.isActive !== false);

  const [suitable, setSuitable] = useState<VehicleType[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!plansQuery.data) return;
    setSuitable(plansQuery.data.suitableVehicleTypes);
    setRows(plansQuery.data.plans.map((p) => ({ ...p, perHourKwd: p.perHourKwd ?? "" })));
  }, [plansQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      privateShiftsApi.saveVendorPlans(vendorId, {
        suitableVehicleTypes: suitable,
        plans: rows.map((r) => ({
          vehicleType: r.vehicleType,
          deliveryPlanId: r.deliveryPlanId,
          perHourKwd: r.perHourKwd.trim() === "" ? null : r.perHourKwd.trim(),
        })),
      }),
    onSuccess: () => {
      toast.success(t("privateShifts.plansSaved"));
      void queryClient.invalidateQueries({ queryKey: ["darb", "vendor-vehicle-plans", vendorId] });
      // The car-only switch on the profile follows the vehicle ticks.
      onSaved?.();
    },
    onError: (err) =>
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t("errors.savingData")),
  });

  if (!plansQuery.data) return null;
  const update = (type: VehicleType, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.vehicleType === type ? { ...r, ...patch } : r)));

  return (
    <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5" data-testid="vendor-vehicle-plans">
      <h2 className="font-display text-lg text-sand-900">{t("privateShifts.vehiclePlansTitle")}</h2>
      <p className="text-sm text-sand-600 mt-1">{t("privateShifts.vehiclePlansHint")}</p>

      <div className="mt-4 space-y-3">
        {VEHICLE_TYPES.map((type) => {
          const row = rows.find((r) => r.vehicleType === type);
          const on = suitable.includes(type);
          const Icon = type === "CAR" ? Car : Bike;
          return (
            <div key={type} className={cn("rounded-2xl border px-4 py-3", on ? "border-primary/40" : "border-sand-200")}>
              <label className="flex items-center gap-2 text-sm font-medium text-sand-900">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setSuitable((prev) => (e.target.checked ? [...prev, type] : prev.filter((v) => v !== type)))
                  }
                  data-testid={`vehicle-suitable-${type}`}
                />
                <Icon size={15} aria-hidden="true" className="text-sand-500" />
                {t(`privateShifts.vehicle_${type}`)}
              </label>
              {on && row && (
                <div className="grid gap-3 sm:grid-cols-2 mt-3">
                  <div>
                    <label className="block text-xs text-sand-600 mb-1">{t("privateShifts.perOrderPlan")}</label>
                    <select
                      disabled={!canEdit}
                      value={row.deliveryPlanId ?? ""}
                      onChange={(e) => update(type, { deliveryPlanId: e.target.value || null })}
                      className="w-full h-10 px-3 rounded-xl bg-white border border-sand-300 text-sm"
                    >
                      <option value="">{t("privateShifts.shopOwnPlan")}</option>
                      {deliveryPlans.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-sand-600 mb-1">{t("privateShifts.perHourRate")}</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      dir="ltr"
                      disabled={!canEdit}
                      value={row.perHourKwd}
                      placeholder="0.000"
                      onChange={(e) => update(type, { perHourKwd: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-white border border-sand-300 text-sm tabular-nums"
                      data-testid={`vehicle-hourly-${type}`}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {suitable.length === 1 && (
        <p className="text-xs text-sand-500 mt-3">{t("privateShifts.singleVehicleNote")}</p>
      )}
      {canEdit && (
        <button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="mt-4 h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          data-testid="vendor-vehicle-plans-save"
        >
          {t("common.save")}
        </button>
      )}
    </section>
  );
}
