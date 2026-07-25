"use client";
// The "Areas" segment of the Live screen: where the pressure is right now.
//
// The old /ops/zones page rendered a choropleth map and a table underneath it.
// The Live screen already has the map, so this is just the list; selecting the
// segment is what turns the map into the choropleth. Rows are compact rather
// than a DataTable because the rail is 360px wide.
import type { ZoneLoadRow } from "./areaLoad";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

/** mm:ss of SLA runway, negative when the average order is already breached. */
function slaLabel(ms: number | null): { text: string; tone: string } {
  if (ms == null) return { text: "n/a", tone: "text-sand-400" };
  const breached = ms <= 0;
  const totalMin = Math.floor(Math.abs(ms) / 60_000);
  const sec = Math.floor((Math.abs(ms) % 60_000) / 1000);
  return {
    text: `${breached ? "-" : ""}${String(totalMin).padStart(2, "0")}:${String(sec).padStart(2, "0")}`,
    tone: breached ? "text-red-600" : totalMin < 10 ? "text-amber-600" : "text-green-700",
  };
}

export default function AreasPanel({ rows }: { rows: ZoneLoadRow[] }) {
  const { t } = useI18n();

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-sand-200 bg-white px-4 py-6 text-center">
        <p className="text-xs text-sand-600">{t("zonesPage.noZones")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-sand-600">{t("opsPages.zonesSubtitle")}</p>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const sla = slaLabel(row.avgSlaRemainingMs);
          return (
            <li
              key={row.id}
              className="px-3 py-2.5 rounded-xl border border-sand-200 bg-white space-y-1.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-sand-900 truncate" dir="auto">
                  {row.name}
                </span>
                <span dir="ltr" className={cn("text-xs font-medium tabular-nums", sla.tone)}>
                  {sla.text}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-sand-600">
                <span className="tabular-nums">
                  {row.activeOrders} {t("opsPages.activeOrders")}
                </span>
                <span className="tabular-nums">
                  {row.onlineDrivers ?? "n/a"} {t("opsPages.onlineDrivers")}
                </span>
                <span
                  dir="ltr"
                  className={cn(
                    "ms-auto tabular-nums font-medium",
                    row.loadRatio == null ? "text-red-600" : "text-sand-700"
                  )}
                  title={t("opsPages.loadRatio")}
                >
                  {row.loadRatio == null ? "∞" : row.loadRatio.toFixed(1)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
