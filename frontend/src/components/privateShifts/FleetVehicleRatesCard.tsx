"use client";
// Revision 24 (#10) — what Darb pays a delivery company per vehicle type: per
// order, and per hour for private shifts.
//
// Client note: "For the delivery company, they will also have two plans, per
// order and per hour, for each type of vehicle they offer."
//
// Two modes. Staff edit the numbers directly on the company's page (ADMIN,
// like every price). The company's own portal never writes a rate live
// (revision 12): it proposes, with a supporting document, and Darb approves,
// through the same RATE_CHANGE desk the base price already uses.
//
// Revision 23's commercial model decides what "per order" means here: on
// MARGIN a blank per-order rate is the company's base fee; on SUBSCRIPTION the
// company is paid the shop's fee per order, so only the hourly rate applies.
//
// Client note, 2026-10-15 (Osama): "for the delivery company motorcycle and
// car please make it as base fee and per kilometer for the per order". On
// MARGIN each order pays the vehicle's base fee plus its per km rate times
// the distance; a blank per km falls back to the company-wide rate.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DocumentFileField from "@/components/fleet/DocumentFileField";
import { useToast } from "@/components/shared/Toast";
import { uploadFleetDocument } from "@/lib/darbApi";
import { fleetPrivateShiftsApi, privateShiftsApi } from "@/lib/privateShiftsApi";
import type { FleetVehicleRates, VehicleType } from "@/types/privateShifts";
import { VEHICLE_TYPES } from "@/types/privateShifts";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";

type Row = { vehicleType: VehicleType; perOrderKwd: string; perKmKwd: string; perHourKwd: string };

function errorText(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

export default function FleetVehicleRatesCard({ mode, fleetId }: { mode: "staff" | "portal"; fleetId?: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  const key = ["darb", "fleet-vehicle-rates", mode, fleetId ?? "own"];

  const ratesQuery = useQuery({
    queryKey: key,
    queryFn: (): Promise<FleetVehicleRates> =>
      mode === "staff" ? privateShiftsApi.fleetRates(fleetId!) : fleetPrivateShiftsApi.vehicleRates(),
    enabled: mode === "portal" || !!fleetId,
  });
  const data = ratesQuery.data;

  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    if (!data) return;
    setRows(
      VEHICLE_TYPES.map((v) => {
        const r = data.rates.find((x) => x.vehicleType === v);
        return {
          vehicleType: v,
          perOrderKwd: r?.perOrderKwd ?? "",
          perKmKwd: r?.perKmKwd ?? "",
          perHourKwd: r?.perHourKwd ?? "",
        };
      }),
    );
  }, [data]);

  const payload = () =>
    rows.map((r) => ({
      vehicleType: r.vehicleType,
      perOrderKwd: r.perOrderKwd.trim() || null,
      perKmKwd: r.perKmKwd.trim() || null,
      perHourKwd: r.perHourKwd.trim() || null,
    }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === "staff") return privateShiftsApi.saveFleetRates(fleetId!, payload());
      if (!file) throw new Error(t("revision19.supportRequired"));
      return fleetPrivateShiftsApi.proposeVehicleRates({
        rates: payload(),
        reason: reason.trim() || undefined,
        documents: [await uploadFleetDocument("SUPPORTING_DOCUMENT", file)],
      });
    },
    onSuccess: () => {
      toast.success(t(mode === "staff" ? "privateShifts.ratesSaved" : "privateShifts.ratesProposed"));
      setEditing(false);
      setFile(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["darb", "fleet-vehicle-rates"] });
      void queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "rate"] });
    },
    onError: (err) => toast.error(errorText(err, (err as Error)?.message || t("errors.savingData"))),
  });

  if (!data) return null;
  const subscription = data.commercialModel === "SUBSCRIPTION";
  const canEdit = mode === "staff" ? hasRole("ADMIN") : !!data.canPropose && !data.pending;
  const inputsOn = mode === "staff" ? canEdit : editing;
  const money = (v: string | null | undefined) => (v ? formatKwd(v, locale) : "n/a");
  const companyPerKm = data.perKmFeeKwd ? formatKwd(data.perKmFeeKwd, locale) : t("privateShifts.perKmNone");
  const setField = (vehicleType: VehicleType, field: "perOrderKwd" | "perKmKwd" | "perHourKwd", value: string) =>
    setRows((prev) => prev.map((x) => (x.vehicleType === vehicleType ? { ...x, [field]: value } : x)));

  return (
    <section className="bg-card border border-sand-200 rounded-2xl shadow-soft px-5 py-4" data-testid="fleet-vehicle-rates">
      <h2 className="text-sm font-medium text-sand-900">{t("privateShifts.fleetRatesTitle")}</h2>
      {!subscription && (
        <p className="text-xs text-sand-700 mt-1" data-testid="fleet-rates-formula">
          {t("privateShifts.fleetRatesFormula")}
        </p>
      )}
      <p className="text-xs text-sand-600 mt-1">
        {subscription
          ? t("privateShifts.fleetRatesSubscription")
          : t("privateShifts.fleetRatesMargin")
              .replace("{base}", money(data.baseFeePerOrderKwd))
              .replace("{perKm}", companyPerKm)}
      </p>

      <div className="overflow-x-auto mt-3">
        <table className="w-full text-sm">
          <thead className="text-sand-600">
            <tr>
              <th className="text-start font-medium py-2">{t("privateShifts.vehicle")}</th>
              <th className="text-start font-medium py-2">{t("privateShifts.baseFee")}</th>
              <th className="text-start font-medium py-2">{t("privateShifts.perKmRate")}</th>
              <th className="text-start font-medium py-2">{t("privateShifts.perHourShifts")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-100">
            {rows.map((r) => (
              <tr key={r.vehicleType}>
                <td className="py-2 text-sand-900">{t(`privateShifts.vehicle_${r.vehicleType}`)}</td>
                <td className="py-2">
                  {subscription ? (
                    <span className="text-sand-500">{t("privateShifts.shopFee")}</span>
                  ) : inputsOn ? (
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      dir="ltr"
                      value={r.perOrderKwd}
                      placeholder={data.baseFeePerOrderKwd ?? "0.000"}
                      onChange={(e) => setField(r.vehicleType, "perOrderKwd", e.target.value)}
                      className="w-28 h-9 px-3 rounded-xl bg-white border border-sand-300 text-sm tabular-nums"
                      aria-label={`${t("privateShifts.baseFee")} ${t(`privateShifts.vehicle_${r.vehicleType}`)}`}
                      data-testid={`fleet-base-${r.vehicleType}`}
                    />
                  ) : (
                    <span className="tabular-nums" dir="ltr">{money(r.perOrderKwd || data.baseFeePerOrderKwd)}</span>
                  )}
                </td>
                <td className="py-2">
                  {subscription ? (
                    <span className="text-sand-500">{t("privateShifts.shopFee")}</span>
                  ) : inputsOn ? (
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      dir="ltr"
                      value={r.perKmKwd}
                      placeholder={data.perKmFeeKwd ?? "0.000"}
                      onChange={(e) => setField(r.vehicleType, "perKmKwd", e.target.value)}
                      className="w-28 h-9 px-3 rounded-xl bg-white border border-sand-300 text-sm tabular-nums"
                      aria-label={`${t("privateShifts.perKmRate")} ${t(`privateShifts.vehicle_${r.vehicleType}`)}`}
                      data-testid={`fleet-per-km-${r.vehicleType}`}
                    />
                  ) : (
                    <span className="tabular-nums" dir="ltr">
                      {r.perKmKwd || data.perKmFeeKwd ? money(r.perKmKwd || data.perKmFeeKwd) : t("privateShifts.perKmNone")}
                    </span>
                  )}
                </td>
                <td className="py-2">
                  {inputsOn ? (
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      dir="ltr"
                      value={r.perHourKwd}
                      placeholder="0.000"
                      onChange={(e) => setField(r.vehicleType, "perHourKwd", e.target.value)}
                      className="w-28 h-9 px-3 rounded-xl bg-white border border-sand-300 text-sm tabular-nums"
                      aria-label={`${t("privateShifts.perHourShifts")} ${t(`privateShifts.vehicle_${r.vehicleType}`)}`}
                      data-testid={`fleet-hourly-${r.vehicleType}`}
                    />
                  ) : (
                    <span className="tabular-nums" dir="ltr">{money(r.perHourKwd)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode === "portal" && data.pending && (
        <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {data.pending.kind === "VEHICLE_RATES" ? t("privateShifts.ratesAwaiting") : t("privateShifts.otherRateAwaiting")}
        </p>
      )}

      {mode === "portal" && canEdit && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 inline-flex items-center px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200"
        >
          {t("privateShifts.proposeRates")}
        </button>
      )}

      {mode === "portal" && editing && (
        <div className="mt-3 space-y-3 border-t border-sand-200 pt-3">
          <input
            type="text"
            dir="auto"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("fleetPortal.rateReason")}
            className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm"
          />
          <p className="text-xs text-sand-600">{t("fleetPortal.rateApprovalHint")}</p>
          <p className="text-xs text-sand-600">{t("revision19.supportRequired")}</p>
          <DocumentFileField file={file} onChange={setFile} storageConfigured={true} />
        </div>
      )}

      {((mode === "staff" && canEdit) || (mode === "portal" && editing)) && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={saveMutation.isPending || (mode === "portal" && !file)}
            onClick={() => saveMutation.mutate()}
            className="h-9 px-4 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
            data-testid="fleet-vehicle-rates-save"
          >
            {mode === "staff" ? t("common.save") : t("fleetPortal.rateSend")}
          </button>
          {mode === "portal" && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-9 px-4 rounded-pill bg-sand-100 text-sand-800 text-sm"
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
