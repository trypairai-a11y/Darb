// Darb 2.0 — sticky red SOS banner shown at the top of ops surfaces until
// the incident is acknowledged.
"use client";
import { Siren, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { formatTime } from "@/i18n/format";
import type { Incident } from "@/types/darb";

const TYPE_I18N: Record<string, string> = {
  SOS: "incidents.sos",
  ACCIDENT: "incidents.accident",
  VEHICLE_BREAKDOWN: "incidents.vehicleBreakdown",
  CUSTOMER_ISSUE: "incidents.customerIssue",
  OTHER: "incidents.other",
};

interface IncidentAlertBannerProps {
  incident: Incident | null | undefined;
  onAcknowledge: (incidentId: string) => void;
  acknowledging?: boolean;
  className?: string;
}

export default function IncidentAlertBanner({
  incident,
  onAcknowledge,
  acknowledging,
  className,
}: IncidentAlertBannerProps) {
  const { t, locale } = useI18n();
  if (!incident) return null;

  return (
    <div
      role="alert"
      className={cn(
        "sticky top-0 z-40 flex items-center gap-3 px-4 py-3 rounded-xl border border-red-300 bg-red-600 text-white shadow-lift",
        className
      )}
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
        <span className="absolute inline-flex h-full w-full rounded-full bg-white/25 animate-ping" aria-hidden="true" />
        <Siren size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">
          {t("incidents.sosAlert")} — {t(TYPE_I18N[incident.type] ?? "incidents.other")}
        </p>
        <p className="text-xs text-white/85 truncate" dir="auto">
          {incident.driver?.name && <span>{incident.driver.name} · </span>}
          {incident.description && <span>{incident.description} · </span>}
          <span dir="ltr">{formatTime(incident.createdAt, locale)}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => onAcknowledge(incident.id)}
        disabled={acknowledging}
        className="inline-flex shrink-0 items-center gap-1.5 px-3.5 h-9 rounded-pill bg-white text-red-700 text-xs font-semibold hover:bg-red-50 transition-colors duration-250 ease-sierra-out disabled:opacity-60"
      >
        <Check size={13} aria-hidden="true" />
        {acknowledging ? t("common.processing") : t("incidents.acknowledge")}
      </button>
    </div>
  );
}
