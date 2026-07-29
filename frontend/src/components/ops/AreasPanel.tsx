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

const ONE_HOUR = 60 * 60_000;
const ONE_DAY = 24 * ONE_HOUR;

/** mm:ss of SLA runway, negative when the average order is already breached.
 *  Past an hour overdue it switches units for the same reason SlaCountdown
 *  does: an area reading "-8454:31" tells a supervisor nothing. */
function slaLabel(
  ms: number | null,
  lateHours: string,
  lateDays: string
): { text: string; tone: string } {
  if (ms == null) return { text: "n/a", tone: "text-sand-400" };
  const breached = ms <= 0;
  const abs = Math.abs(ms);
  const totalMin = Math.floor(abs / 60_000);
  const tone = breached ? "text-red-600" : totalMin < 10 ? "text-amber-600" : "text-green-700";

  if (breached && abs >= ONE_DAY) return { text: `${Math.floor(abs / ONE_DAY)}${lateDays}`, tone };
  if (breached && abs >= ONE_HOUR) return { text: `${Math.floor(abs / ONE_HOUR)}${lateHours}`, tone };

  const sec = Math.floor((abs % 60_000) / 1000);
  return {
    text: `${breached ? "-" : ""}${String(totalMin).padStart(2, "0")}:${String(sec).padStart(2, "0")}`,
    tone,
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

  // This panel answers "where is the pressure", and a zone with no orders and
  // nobody in it is not an answer to that. Kuwait has thirty-odd zones and on
  // a normal shift a handful carry all the load, so the rest were pure scroll
  // between the supervisor and the rows that mattered. Zones are still sorted
  // busiest-first by buildZoneLoadRows.
  const active = rows.filter((r) => r.activeOrders > 0 || (r.onlineDrivers ?? 0) > 0);

  if (active.length === 0) {
    return (
      <div className="rounded-xl border border-sand-200 bg-white px-4 py-6 text-center">
        <p className="text-xs text-sand-600">{t("opsPages.allClear")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-sand-600">{t("opsPages.zonesSubtitle")}</p>
      <ul className="space-y-1.5">
        {active.map((row) => {
          const sla = slaLabel(row.avgSlaRemainingMs, t("opsMap.lateHours"), t("opsMap.lateDays"));
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
