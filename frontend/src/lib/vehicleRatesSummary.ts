// Revision 24 (#10): one line describing a per-vehicle rate proposal, for the
// approval desk (/requests and the company's own page). Returns null when the
// request is an ordinary base-price proposal, so the caller keeps its line.
import { formatKwd } from "@/i18n/format";
import type { Locale } from "@/i18n/messages";

type Rate = { vehicleType?: string; perOrderKwd?: string | null; perHourKwd?: string | null };

export function vehicleRatesSummary(
  payload: Record<string, unknown>,
  t: (key: string) => string,
  locale: Locale,
): string | null {
  if (!Array.isArray(payload.vehicleRates)) return null;
  const current = (Array.isArray(payload.currentVehicleRates) ? payload.currentVehicleRates : []) as Rate[];
  const money = (v: string | null | undefined) => (v ? formatKwd(v, locale) : "n/a");
  const parts = (payload.vehicleRates as Rate[]).map((r) => {
    const was = current.find((c) => c.vehicleType === r.vehicleType);
    return `${t(`privateShifts.vehicle_${r.vehicleType}`)}: ${t("privateShifts.perOrder")} ${money(was?.perOrderKwd)} → ${money(
      r.perOrderKwd,
    )}, ${t("privateShifts.perHourRate")} ${money(was?.perHourKwd)} → ${money(r.perHourKwd)}`;
  });
  const reason = typeof payload.reason === "string" && payload.reason ? ` · ${payload.reason}` : "";
  return `${parts.join(" · ")}${reason}`;
}
