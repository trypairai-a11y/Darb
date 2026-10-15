"use client";
// Revision 24b: the busy-driver cap (FulfillmentSettings.maxActiveOrdersPerDriver)
// on the Areas screen. Dispatch offers a working driver more orders until they
// hold this many at once; 1 means only free drivers are offered work.
// ADMIN and OPS_MANAGER only, through the narrow PUT /api/zones/settings/dispatch.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { zonesApi } from "@/lib/darbApi";
import type { FulfillmentSettings } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/cn";

/** What dispatch uses when the tenant has no FulfillmentSettings row yet. */
const DEFAULT_CAP = 3;
const MIN_CAP = 1;
const MAX_CAP = 10;

function isValidCap(raw: string): boolean {
  if (!/^\d+$/.test(raw.trim())) return false;
  const n = Number(raw);
  return n >= MIN_CAP && n <= MAX_CAP;
}

export default function DispatchCapCard() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Same cache key as /pricing. A tenant that has never saved settings gets a
  // 404 here; that is not an error for this card, it reads as the default.
  const settingsQuery = useQuery({
    queryKey: ["darb", "fulfillment-settings"],
    queryFn: async (): Promise<FulfillmentSettings | null> => {
      try {
        return await zonesApi.getSettings();
      } catch (err) {
        if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
        throw err;
      }
    },
  });

  const saved = String(settingsQuery.data?.maxActiveOrdersPerDriver ?? DEFAULT_CAP);
  const [value, setValue] = useState(saved);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(saved);
  }, [saved]);

  const valid = isValidCap(value);
  const dirty = value.trim() !== saved;

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    try {
      await zonesApi.putDispatchSettings({ maxActiveOrdersPerDriver: Number(value) });
      toast.success(t("zonesPage.dispatchSaved"));
      await queryClient.invalidateQueries({ queryKey: ["darb", "fulfillment-settings"] });
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5 max-w-xl">
      <h2 className="font-medium text-sand-900">{t("zonesPage.dispatchTitle")}</h2>
      <p className="text-xs text-sand-600 mt-1">{t("zonesPage.dispatchHint")}</p>

      <label
        htmlFor="max-active-orders"
        className="block text-xs font-medium text-sand-700 uppercase tracking-wide mt-4 mb-1.5"
      >
        {t("zonesPage.maxActiveOrders")}
      </label>
      <div className="flex items-center gap-3">
        <input
          id="max-active-orders"
          type="number"
          inputMode="numeric"
          step={1}
          min={MIN_CAP}
          max={MAX_CAP}
          dir="ltr"
          value={value}
          disabled={settingsQuery.isLoading}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!valid}
          aria-describedby="max-active-orders-hint"
          className={cn(
            "w-24 px-3 h-10 rounded-xl bg-white border text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20",
            !valid ? "border-red-400" : dirty ? "border-amber-400 bg-amber-50/40" : "border-sand-300"
          )}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!dirty || !valid || saving}
          className="btn-primary inline-flex items-center gap-2 px-4 h-10 disabled:opacity-50"
        >
          <Save size={15} aria-hidden="true" />
          {saving ? t("common.processing") : t("common.save")}
        </button>
      </div>
      {!valid && (
        <p className="text-xs text-red-600 mt-2" role="alert">
          {t("zonesPage.maxActiveOrdersRange")}
        </p>
      )}
      <p id="max-active-orders-hint" className="text-xs text-sand-600 mt-2">
        {t("zonesPage.maxActiveOrdersHint")}
      </p>
      {settingsQuery.isError && (
        <p className="text-xs text-red-600 mt-2">{t("errors.loadingData")}</p>
      )}
    </section>
  );
}
