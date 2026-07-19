"use client";
// Darb 2.0 — /pricing: intra-zone flat fee + zones×zones surcharge matrix.
// Empty cell = unserviceable pair (no ZoneSurcharge row). Single Save pushes
// PUT /api/zones/surcharges + PUT /api/zones/settings.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { zonesApi, unwrapList } from "@/lib/darbApi";
import type { DeliveryZone, FulfillmentSettings, ZoneSurcharge } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

type MatrixValues = Record<string, string>; // "originId:destId" -> "0.250" | ""

const keyOf = (originId: string, destId: string) => `${originId}:${destId}`;

function toFixed3(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3) : "";
}

export default function PricingPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const zonesQuery = useQuery({ queryKey: ["darb", "zones"], queryFn: () => zonesApi.list() });
  const surchargesQuery = useQuery({
    queryKey: ["darb", "surcharges"],
    queryFn: () => zonesApi.getSurcharges(),
  });
  const settingsQuery = useQuery({
    queryKey: ["darb", "fulfillment-settings"],
    queryFn: () => zonesApi.getSettings(),
  });

  const zones = useMemo(
    () => unwrapList<DeliveryZone>(zonesQuery.data).filter((z) => z.isActive !== false),
    [zonesQuery.data]
  );

  const [baseline, setBaseline] = useState<MatrixValues>({});
  const [values, setValues] = useState<MatrixValues>({});
  const [intraFee, setIntraFee] = useState("");
  const [intraFeeBaseline, setIntraFeeBaseline] = useState("");
  const [saving, setSaving] = useState(false);

  // Seed local state once data arrives.
  useEffect(() => {
    const rows = unwrapList<ZoneSurcharge>(surchargesQuery.data);
    const next: MatrixValues = {};
    for (const row of rows) {
      next[keyOf(row.originZoneId, row.destZoneId)] = toFixed3(row.surchargeKwd);
    }
    setBaseline(next);
    setValues(next);
  }, [surchargesQuery.data]);

  useEffect(() => {
    const settings = settingsQuery.data as FulfillmentSettings | undefined;
    if (settings?.intraZoneFeeKwd != null) {
      const v = toFixed3(settings.intraZoneFeeKwd);
      setIntraFee(v);
      setIntraFeeBaseline(v);
    }
  }, [settingsQuery.data]);

  const dirtyCells = useMemo(() => {
    const dirty = new Set<string>();
    const keys = new Set([...Object.keys(baseline), ...Object.keys(values)]);
    keys.forEach((k) => {
      if ((baseline[k] ?? "") !== (values[k] ?? "")) dirty.add(k);
    });
    return dirty;
  }, [baseline, values]);

  const isDirty = dirtyCells.size > 0 || intraFee !== intraFeeBaseline;

  function setCell(originId: string, destId: string, raw: string) {
    setValues((prev) => ({ ...prev, [keyOf(originId, destId)]: raw }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const surcharges: ZoneSurcharge[] = [];
      for (const origin of zones) {
        for (const dest of zones) {
          if (origin.id === dest.id) continue;
          const raw = values[keyOf(origin.id, dest.id)];
          if (raw != null && raw !== "" && Number.isFinite(Number(raw))) {
            surcharges.push({
              originZoneId: origin.id,
              destZoneId: dest.id,
              surchargeKwd: Number(raw).toFixed(3),
            });
          }
        }
      }
      await zonesApi.putSurcharges(surcharges);
      if (intraFee !== "" && Number.isFinite(Number(intraFee))) {
        await zonesApi.putSettings({ intraZoneFeeKwd: Number(intraFee).toFixed(3) });
      }
      toast.success(t("pricingPage.saved"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["darb", "surcharges"] }),
        queryClient.invalidateQueries({ queryKey: ["darb", "fulfillment-settings"] }),
      ]);
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  const isLoading = zonesQuery.isLoading || surchargesQuery.isLoading || settingsQuery.isLoading;
  const queryError = zonesQuery.error || surchargesQuery.error || settingsQuery.error;

  if (isLoading) return <PageSkeleton statCards={0} tableRows={8} tableCols={8} />;
  if (queryError) {
    return (
      <ErrorState
        error={queryError instanceof Error ? queryError.message : t("errors.loadingData")}
        onRetry={() => {
          void zonesQuery.refetch();
          void surchargesQuery.refetch();
          void settingsQuery.refetch();
        }}
      />
    );
  }

  const zoneLabel = (z: DeliveryZone) => (locale === "ar" && z.nameAr ? z.nameAr : z.name);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">{t("pricingPage.title")}</h1>
          <p className="text-sm text-sand-600 mt-1">{t("pricingPage.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-pill">
              {t("pricingPage.unsavedChanges")}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isDirty || saving}
            className="btn-primary inline-flex items-center gap-2 px-4 h-10 disabled:opacity-50"
          >
            <Save size={15} aria-hidden="true" />
            {saving ? t("common.processing") : t("pricingPage.save")}
          </button>
        </div>
      </div>

      {/* Intra-zone flat fee */}
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5 max-w-md">
        <label className="block text-xs font-medium text-sand-700 uppercase tracking-wide mb-1.5">
          {t("pricingPage.intraZoneFee")}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-sand-600">KD</span>
          <input
            type="number"
            step="0.001"
            min="0"
            dir="ltr"
            value={intraFee}
            onChange={(e) => setIntraFee(e.target.value)}
            className={cn(
              "w-32 px-3 h-10 rounded-xl bg-white border text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20",
              intraFee !== intraFeeBaseline ? "border-amber-400 bg-amber-50/40" : "border-sand-300"
            )}
          />
        </div>
        <p className="text-xs text-sand-600 mt-2">{t("pricingPage.intraZoneFeeHint")}</p>
      </div>

      {/* Surcharge matrix */}
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
        <div className="px-5 pt-4">
          <h2 className="font-medium text-sand-900">{t("pricingPage.surchargeMatrix")}</h2>
          <p className="text-xs text-sand-600 mt-1 mb-3">{t("pricingPage.matrixHint")}</p>
        </div>
        <div className="overflow-auto max-h-[560px]" dir="ltr">
          <table className="border-collapse min-w-max">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-30 bg-sand-100 border-b border-e border-sand-200 px-3 py-2 text-xs font-medium text-sand-700 text-start">
                  {t("pricingPage.origin")} ↓ / {t("pricingPage.destination")} →
                </th>
                {zones.map((dest) => (
                  <th
                    key={dest.id}
                    className="sticky top-0 z-20 bg-sand-100 border-b border-sand-200 px-2 py-2 text-xs font-medium text-sand-700 whitespace-nowrap min-w-[92px]"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: dest.color ?? "#006838" }}
                        aria-hidden="true"
                      />
                      {zoneLabel(dest)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zones.map((origin) => (
                <tr key={origin.id}>
                  <th className="sticky left-0 z-10 bg-sand-100 border-e border-b border-sand-200 px-3 py-1.5 text-xs font-medium text-sand-700 whitespace-nowrap text-start">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: origin.color ?? "#006838" }}
                        aria-hidden="true"
                      />
                      {zoneLabel(origin)}
                    </span>
                  </th>
                  {zones.map((dest) => {
                    if (origin.id === dest.id) {
                      return (
                        <td
                          key={dest.id}
                          className="border-b border-sand-200 bg-sand-100/60 px-2 py-1.5 text-center text-xs text-sand-400 select-none"
                        >
                          {t("pricingPage.sameZone")}
                        </td>
                      );
                    }
                    const k = keyOf(origin.id, dest.id);
                    const dirty = dirtyCells.has(k);
                    return (
                      <td key={dest.id} className="border-b border-sand-200 px-1.5 py-1">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          dir="ltr"
                          value={values[k] ?? ""}
                          placeholder="—"
                          onChange={(e) => setCell(origin.id, dest.id, e.target.value)}
                          onBlur={(e) => {
                            const raw = e.target.value;
                            if (raw !== "" && Number.isFinite(Number(raw))) {
                              setCell(origin.id, dest.id, Number(raw).toFixed(3));
                            }
                          }}
                          aria-label={`${zoneLabel(origin)} → ${zoneLabel(dest)}`}
                          className={cn(
                            "w-[84px] px-2 h-8 rounded-lg border text-xs text-end tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-sand-400",
                            dirty ? "border-amber-400 bg-amber-50/60" : "border-sand-200 bg-white"
                          )}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
