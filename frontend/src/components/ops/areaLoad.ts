// Zone-load maths, lifted out of the old /ops/zones page so the Live screen can
// feed both the rail list and the map choropleth from one computation.
//
// Uses the richer zoneLoads fields when the dispatch overview provides them;
// otherwise derives drivers-per-zone from the position store and SLA averages
// from the active order list.
import { pointInZone } from "@/lib/geo";
import type { DeliveryOrder, DeliveryZone, DriverPosition } from "@/types/darb";

const MIN_FILL = 0.06;
const MAX_FILL = 0.55;

export interface ZoneLoadRow {
  id: string;
  name: string;
  activeOrders: number;
  onlineDrivers: number | null;
  loadRatio: number | null;
  avgSlaRemainingMs: number | null;
}

interface ZoneLoad {
  zoneId: string;
  activeOrders?: number;
  onlineDrivers?: number;
  loadRatio?: number | null;
  avgSlaRemainingSec?: number | null;
}

export function buildZoneLoadRows(params: {
  zones: DeliveryZone[];
  zoneLoads: ZoneLoad[] | undefined;
  activeOrders: DeliveryOrder[];
  positions: DriverPosition[];
  now: number;
  locale: string;
}): ZoneLoadRow[] {
  const { zones, zoneLoads, activeOrders, positions, now, locale } = params;
  const loadByZone = new Map((zoneLoads ?? []).map((l) => [l.zoneId, l]));
  const onlineDrivers = positions.filter((p) => p.availability !== "OFFLINE" && !p.stale);

  return zones
    .filter((z) => z.isActive !== false)
    .map((zone) => {
      const load = loadByZone.get(zone.id);
      const zoneOrders = activeOrders.filter((o) => o.dropoffZoneId === zone.id);
      const activeCount = load?.activeOrders ?? zoneOrders.length;

      const driversHere =
        load?.onlineDrivers ?? onlineDrivers.filter((p) => pointInZone(p.lat, p.lng, zone)).length;

      const ratio =
        load?.loadRatio ?? (driversHere > 0 ? activeCount / driversHere : activeCount > 0 ? null : 0);

      let avgMs: number | null =
        load?.avgSlaRemainingSec != null ? load.avgSlaRemainingSec * 1000 : null;
      if (avgMs == null) {
        const withSla = zoneOrders.filter((o) => o.slaDeadline);
        if (withSla.length > 0) {
          avgMs =
            withSla.reduce((sum, o) => sum + (new Date(o.slaDeadline as string).getTime() - now), 0) /
            withSla.length;
        }
      }

      return {
        id: zone.id,
        name: locale === "ar" && zone.nameAr ? zone.nameAr : zone.name,
        activeOrders: activeCount,
        onlineDrivers: driversHere,
        loadRatio: ratio,
        avgSlaRemainingMs: avgMs,
      };
    })
    .sort((a, b) => b.activeOrders - a.activeOrders);
}

/** Choropleth: fill opacity scales with each zone's share of the busiest zone. */
export function zoneFillOpacity(rows: ZoneLoadRow[]): Record<string, number> {
  const max = Math.max(1, ...rows.map((r) => r.activeOrders));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.id] = MIN_FILL + (r.activeOrders / max) * (MAX_FILL - MIN_FILL);
  return out;
}
