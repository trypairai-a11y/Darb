// Darb 2.0 — assigned-driver card: name, phone (always LTR), ETA and a small
// live map with the driver's position.
"use client";
import { Phone, Timer, Truck } from "lucide-react";
import LiveMap from "@/components/map/LiveMap";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";

interface DriverCardProps {
  name: string;
  phone?: string | null;
  vehicleType?: string | null;
  etaMinutes?: number | null;
  position?: { lat: number; lng: number } | null;
  className?: string;
}

export default function DriverCard({
  name,
  phone,
  vehicleType,
  etaMinutes,
  position,
  className,
}: DriverCardProps) {
  const { t } = useI18n();
  return (
    <div className={cn("bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden", className)}>
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sand-900 truncate" dir="auto">
            {name}
          </p>
          {phone && (
            <a
              href={`tel:${phone}`}
              dir="ltr"
              className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Phone size={13} aria-hidden="true" />
              {phone}
            </a>
          )}
          {vehicleType && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-sand-600">
              <Truck size={12} aria-hidden="true" />
              {vehicleType}
            </p>
          )}
        </div>
        {etaMinutes != null && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-primary/10 text-primary text-xs font-medium whitespace-nowrap">
            <Timer size={12} aria-hidden="true" />
            {t("dispatch.eta")} <span dir="ltr">{etaMinutes} min</span>
          </span>
        )}
      </div>
      {position && (
        <LiveMap
          height="200px"
          center={[position.lat, position.lng]}
          zoom={14}
          marker={{ lat: position.lat, lng: position.lng, label: name }}
        />
      )}
    </div>
  );
}
