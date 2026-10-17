// Revision 24 (#10): one line describing a per-vehicle rate proposal, for the
// approval desk (/requests and the company's own page). Returns null when the
// request is an ordinary base-price proposal, so the caller keeps its line.
import { formatKwd } from "@/i18n/format";
import type { Locale } from "@/i18n/messages";

type Rate = { vehicleType?: string; perOrderKwd?: string | null; perKmKwd?: string | null; perHourKwd?: string | null };

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
    // Client note, 2026-10-15: the base fee and the per km rate per vehicle.
    // A proposal sent before per km existed does not carry it, and approving
    // it leaves the stored rate alone, so the line does not claim a change.
    const perKm =
      "perKmKwd" in r
        ? `, ${t("privateShifts.perKmRate")} ${money(was?.perKmKwd)} → ${money(r.perKmKwd)}`
        : "";
    return `${t(`privateShifts.vehicle_${r.vehicleType}`)}: ${t("privateShifts.baseFee")} ${money(was?.perOrderKwd)} → ${money(
      r.perOrderKwd,
    )}${perKm}, ${t("privateShifts.perHourRate")} ${money(was?.perHourKwd)} → ${money(r.perHourKwd)}`;
  });
  const reason = typeof payload.reason === "string" && payload.reason ? ` · ${payload.reason}` : "";
  return `${parts.join(" · ")}${reason}`;
}
