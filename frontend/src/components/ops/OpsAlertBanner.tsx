"use client";
// Darb 2.0 — the alert banner across the top of the ops map (client revision
// #2). The Keeta reference runs a yellow strip warning that a rider has not
// uploaded a GPS location and cannot accept new orders; this is the same idea,
// driven by the gpsStale array the dispatch overview already returns.
import { useState } from "react";
import { AlertTriangle, Copy, X } from "lucide-react";
import type { DriverPosition } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";

interface OpsAlertBannerProps {
  gpsStale: DriverPosition[];
  onCopy: () => void;
}

export default function OpsAlertBanner({ gpsStale, onCopy }: OpsAlertBannerProps) {
  const { t } = useI18n();
  // Dismissal is per-driver-set: once the offending drivers change, the banner
  // comes back rather than staying hidden on a stale dismissal.
  const signature = gpsStale.map((d) => d.driverId).sort().join(",");
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (gpsStale.length === 0 || dismissed === signature) return null;

  const first = gpsStale[0];
  const others = gpsStale.length - 1;

  return (
    <div className="absolute inset-x-0 top-0 z-[1000] flex items-center gap-3 bg-amber-100/95 backdrop-blur-sm border-b border-amber-300 px-4 py-2.5 text-[13px] text-amber-900">
      <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1" dir="auto">
        {t("opsMap.gpsBannerLead")}{" "}
        <span className="font-medium">{first.name ?? first.driverId}</span>
        {first.driverCode && (
          <span dir="ltr" className="font-mono text-xs ms-1">
            ({first.driverCode})
          </span>
        )}{" "}
        {others > 0 && (
          <span>
            {t("opsMap.gpsBannerOthers").replace("{count}", String(others))}{" "}
          </span>
        )}
        {t("opsMap.gpsBannerTail")}
      </p>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1 px-2.5 h-7 rounded-pill bg-amber-200/70 hover:bg-amber-200 text-[11px] font-medium transition-colors shrink-0"
      >
        <Copy size={11} aria-hidden="true" />
        {t("opsMap.copyIrregular")}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(signature)}
        aria-label={t("common.close")}
        className="p-1 rounded-lg hover:bg-amber-200 transition-colors shrink-0"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
