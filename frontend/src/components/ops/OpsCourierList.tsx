"use client";
// Darb 2.0 — the "By courier" list in the ops control room (client revision
// #3): every driver on shift with their live status, filterable by status and
// searchable by name or Darb driver code, colour-matched to the map markers.
import { Copy, Phone } from "lucide-react";
import { DRIVER_STATUS_COLORS } from "@/components/map/driverStatus";
import { driverMapStatus, type DriverMapStatus, type DriverPosition } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatRelativeTime } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { countDriverStatus, DRIVER_STATUS_FILTERS } from "./opsFilters";

interface OpsCourierListProps {
  drivers: DriverPosition[];
  allDrivers: DriverPosition[];
  activeStatuses: DriverMapStatus[];
  search: string;
  selectedDriverId: string | null;
  onToggleStatus: (status: DriverMapStatus) => void;
  onSearch: (value: string) => void;
  onSelect: (driverId: string) => void;
  onCopy: (driver: DriverPosition) => void;
}

export default function OpsCourierList({
  drivers,
  allDrivers,
  activeStatuses,
  search,
  selectedDriverId,
  onToggleStatus,
  onSearch,
  onSelect,
  onCopy,
}: OpsCourierListProps) {
  const { t, locale } = useI18n();

  const statusLabels: Record<DriverMapStatus, string> = {
    busy: t("opsMap.driverBusy"),
    idle: t("opsMap.driverIdle"),
    online: t("opsMap.driverOnline"),
    offline: t("opsMap.driverOffline"),
    stale: t("opsMap.driverStale"),
  };

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={t("opsMap.searchCouriers")}
        className="w-full px-3 h-9 rounded-pill bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      {/* Status legend, doubling as the filter — the colours are the same ones
          the map markers use, so the legend never drifts from the map. */}
      <div className="flex flex-wrap gap-1.5">
        {DRIVER_STATUS_FILTERS.map((status) => {
          const isActive = activeStatuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={isActive}
              onClick={() => onToggleStatus(status)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-pill border text-[11px] font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-sand-200 bg-white text-sand-700 hover:border-sand-300"
              )}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ background: DRIVER_STATUS_COLORS[status] }}
              />
              {statusLabels[status]}
              <span className="tabular-nums opacity-70">
                ({countDriverStatus(allDrivers, status)})
              </span>
            </button>
          );
        })}
      </div>

      {drivers.length === 0 ? (
        <p className="px-1 py-6 text-sm text-sand-600">{t("opsMap.noCouriers")}</p>
      ) : (
        <ul className="space-y-1.5">
          {drivers.map((driver) => {
            const status = driverMapStatus(driver);
            const selected = driver.driverId === selectedDriverId;
            return (
              <li key={driver.driverId}>
                <div
                  className={cn(
                    "group rounded-xl border px-3 py-2.5 transition-colors",
                    selected
                      ? "border-primary/50 bg-primary/5"
                      : "border-sand-200 bg-white hover:border-primary/30 hover:bg-sand-50"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(driver.driverId)}
                    className="w-full text-start"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: DRIVER_STATUS_COLORS[status] }}
                        />
                        <span className="text-sm font-medium text-sand-900 truncate" dir="auto">
                          {driver.name ?? driver.driverId}
                        </span>
                      </span>
                      <span className="text-[11px] font-medium text-sand-600 shrink-0">
                        {statusLabels[status]}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-sand-600">
                      <span dir="ltr" className="font-mono truncate">
                        {driver.driverCode ?? "n/a"}
                      </span>
                      <span className="shrink-0">
                        {driver.at ? formatRelativeTime(driver.at, locale) : "n/a"}
                      </span>
                    </div>
                  </button>

                  {/* Fifty-odd idle drivers meant a hundred-odd buttons on
                      screen at rest. Opacity keeps them tabbable and keeps the
                      list from reflowing as the cursor crosses it. */}
                  <div className="mt-1.5 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {driver.phone && (
                      <a
                        href={`tel:${driver.phone}`}
                        className="inline-flex items-center gap-1 px-2 h-6 rounded-pill text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Phone size={10} aria-hidden="true" />
                        {t("opsPages.call")}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onCopy(driver)}
                      className="inline-flex items-center gap-1 px-2 h-6 rounded-pill text-[10px] font-medium text-sand-600 hover:bg-sand-100 hover:text-sand-900 transition-colors"
                    >
                      <Copy size={10} aria-hidden="true" />
                      {t("opsMap.copyCourier")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
