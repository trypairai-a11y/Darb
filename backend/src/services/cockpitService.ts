// Darb 2.0 PRD §14 — the founder cockpit. Live orders + on-time % by zone,
// revenue and margin today (fees in, fleet cost out, net), fleet utilisation,
// live cash position (collected in the field vs deposited), and threshold
// alerts. Every number is derived from committed rows on read; no caches.

import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { fleetRateOf, sumFleetPayout } from "./fleetService";

const ACTIVE_STATUSES = ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED", "PICKED_UP"] as const;

export interface CockpitSummary {
  generatedAt: string;
  orders: {
    activeNow: number;
    byStatus: Record<string, number>;
    deliveredToday: number;
    cancelledToday: number;
    noDriverToday: number;
    onTimeRateToday: number | null;
  };
  zones: Array<{
    zoneId: string;
    code: string;
    name: string;
    deliveredToday: number;
    onTimeRate: number | null;
    /**
     * Edit #9 (2026-08-22) — the client reads this table asking two more
     * questions than it answered: how many drivers are on the zone right now,
     * and how many orders the zone is carrying beyond the delivered ones.
     */
    activeOrders: number;
    driversAssigned: number;
  }>;
  /**
   * Edit #9 (2026-08-22) — the zone-to-driver assignment sheet, per booked
   * shift window, with each driver's order count inside that window. This is
   * what the client asked to see "here" on Today: who is on which zone, in
   * which three-hour window, and how much that window actually moved.
   */
  shifts: {
    /** Distinct booked windows today, e.g. ["10:00-13:00", "16:00-19:00"]. */
    windows: string[];
    zoneDrivers: Array<{
      zoneId: string | null;
      zoneName: string;
      driverId: string;
      driverName: string;
      /** "16:00-19:00", exactly as the driver booked it. */
      window: string;
      /** Orders that driver delivered inside that window. */
      ordersInWindow: number;
    }>;
  };
  money: {
    feesTodayKwd: string;
    fleetCostTodayKwd: string;
    netMarginTodayKwd: string;
    tipsTodayKwd: string;
  };
  fleet: {
    driversOnlineNow: number;
    driversBusyNow: number;
    fleets: Array<{
      fleetPartnerId: string;
      name: string;
      disciplineStatus: string;
      driversOnline: number;
      minDriversOnline: number | null;
      deliveredToday: number;
      // Revision #28 — commonly-owned fleets carry their owner entity so the
      // table can roll them up instead of showing three unrelated-looking rows.
      ownerGroupId: string | null;
      ownerGroupName: string | null;
    }>;
  };
  cash: {
    driverCashInFieldKwd: string; // Σ DRIVER_CASH balances (collected, unremitted)
    depositedTodayKwd: string; // Σ remittances today
    clearingBalanceKwd: string; // hub cash awaiting banking
  };
  alerts: Array<{ kind: string; severity: "HIGH" | "MEDIUM"; message: string }>;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Kuwait midnight of the current Kuwait day, as an instant. */
function kuwaitTodayStart(): Date {
  const shifted = new Date(Date.now() + 3 * 3_600_000);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
      3 * 3_600_000,
  );
}

/**
 * The reporting window for the period-scoped tiles (client revision #26).
 * Defaults to "today onwards", which is exactly the behaviour this service had
 * before the date picker existed.
 */
export interface CockpitRange {
  from?: Date;
  to?: Date;
}

export async function getCockpitSummary(
  tenantId: string,
  range: CockpitRange = {},
): Promise<CockpitSummary> {
  const today = range.from ?? startOfToday();
  // A period filter is `>= from` when open-ended, `>= from AND <= to` when the
  // user picked a closed range. Live tiles (active orders, drivers online,
  // cash in the field) deliberately ignore it: they are a snapshot of now.
  const period = range.to ? { gte: today, lte: range.to } : { gte: today };

  const [
    activeByStatus,
    deliveredRows,
    shiftRequests,
    activeByZone,
    cancelledToday,
    noDriverNow,
    zones,
    feeAgg,
    tipAgg,
    sessions,
    fleets,
    driverAccounts,
    remittanceAgg,
    clearingAccount,
    lastRecon,
    settings,
  ] = await Promise.all([
    prisma.deliveryOrder.groupBy({
      by: ["status"],
      where: { tenantId, status: { in: [...ACTIVE_STATUSES] } },
      _count: { _all: true },
    }),
    prisma.deliveryOrder.findMany({
      where: { tenantId, status: "DELIVERED", deliveredAt: period },
      select: {
        deliveredAt: true,
        slaDeadline: true,
        pickupZoneId: true,
        deliveryFeeKwd: true,
        // Revision 14 (#3): fleet cost is per kilometre now, not per order.
        distanceKm: true,
        driverId: true, // Edit #9 — orders-per-driver on the zone sheet.
        driver: { select: { fleetPartnerId: true } },
      },
    }),
    // Edit #9 (2026-08-22) — who booked which zone window today. APPROVED is
    // the only status that writes a Shift, so it is the only status that means
    // "this driver is assigned here".
    prisma.shiftRequest.findMany({
      where: {
        tenantId,
        // ShiftRequest.date is stored as KUWAIT midnight (routes/agent.ts
        // kuwaitMidnight), which on a UTC host is 21:00Z the previous day —
        // filtering from server-local midnight silently dropped every booking
        // for most of the day. Same +03:00 frame as the window bounds below.
        date: { gte: kuwaitTodayStart(), lt: new Date(kuwaitTodayStart().getTime() + 86_400_000) },
        status: "APPROVED",
      },
      select: {
        driverId: true,
        zoneId: true,
        zoneName: true,
        startTime: true,
        endTime: true,
        driver: { select: { name: true } },
      },
    }),
    // Edit #9 — orders currently moving through each zone, for the zone table.
    prisma.deliveryOrder.groupBy({
      by: ["pickupZoneId"],
      where: { tenantId, status: { in: [...ACTIVE_STATUSES] }, pickupZoneId: { not: null } },
      _count: { _all: true },
    }),
    prisma.deliveryOrder.count({
      where: { tenantId, status: "CANCELLED", cancelledAt: period },
    }),
    prisma.deliveryOrder.count({ where: { tenantId, status: "NO_DRIVER" } }),
    prisma.deliveryZone.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true },
    }),
    prisma.deliveryOrder.aggregate({
      where: { tenantId, status: "DELIVERED", deliveredAt: period },
      _sum: { deliveryFeeKwd: true },
    }),
    prisma.deliveryOrder.aggregate({
      where: { tenantId, status: "DELIVERED", deliveredAt: period, tipKwd: { not: null } },
      _sum: { tipKwd: true },
    }),
    prisma.courierOnlineSession.findMany({
      where: { tenantId, isOnline: true, availability: { in: ["ONLINE", "BUSY"] } },
      select: { availability: true, driver: { select: { fleetPartnerId: true } } },
    }),
    prisma.fleetPartner.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        disciplineStatus: true,
        minDriversOnline: true,
        flatFeePerOrderKwd: true,
        perKmFeeKwd: true,
        ownerGroup: { select: { id: true, name: true } },
      },
    }),
    prisma.walletAccount.aggregate({
      where: { tenantId, ownerType: "DRIVER_CASH" },
      _sum: { balanceKwd: true },
    }),
    prisma.remittance.aggregate({
      where: { tenantId, createdAt: period },
      _sum: { amountKwd: true },
    }),
    prisma.walletAccount.findFirst({
      where: { tenantId, ownerType: "PLATFORM_CLEARING" },
      select: { balanceKwd: true },
    }),
    prisma.walletReconciliationRun.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { status: true, runDate: true },
    }),
    prisma.fulfillmentSettings.findUnique({
      where: { tenantId },
      select: { driverCashCeilingKwd: true },
    }),
  ]);

  // On-time + per-zone rollups from the delivered rows (Prisma cannot compare
  // two columns, so this stays a row pass — bounded by one day's volume).
  const withSla = deliveredRows.filter((r) => r.slaDeadline && r.deliveredAt);
  const onTimeCount = withSla.filter(
    (r) => (r.deliveredAt as Date).getTime() <= (r.slaDeadline as Date).getTime(),
  ).length;

  const byZone = new Map<string, { delivered: number; withSla: number; onTime: number }>();
  for (const r of deliveredRows) {
    if (!r.pickupZoneId) continue;
    const z = byZone.get(r.pickupZoneId) ?? { delivered: 0, withSla: 0, onTime: 0 };
    z.delivered += 1;
    if (r.slaDeadline && r.deliveredAt) {
      z.withSla += 1;
      if (r.deliveredAt.getTime() <= r.slaDeadline.getTime()) z.onTime += 1;
    }
    byZone.set(r.pickupZoneId, z);
  }

  // Edit #9 (2026-08-22) — who is assigned where, per booked window, and what
  // each driver actually moved inside their own window. Window text is Kuwait
  // wall clock, so the bounds are built against an explicit +03:00 day frame
  // (the same convention resolveDriverDateRange uses), not server-local time.
  const ordersByDriver = new Map<string, number>();
  for (const r of deliveredRows) {
    if (!r.driverId) continue;
    ordersByDriver.set(r.driverId, (ordersByDriver.get(r.driverId) ?? 0) + 1);
  }
  const activeOrdersByZone = new Map<string, number>();
  for (const r of activeByZone) {
    if (r.pickupZoneId) activeOrdersByZone.set(r.pickupZoneId, r._count._all);
  }
  const kuwaitDay = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const hm = (v: string, fallback: string) =>
    /^\d{2}:\d{2}$/.test(v) ? v : fallback;
  const windowBounds = (startText: string, endText: string) => ({
    start: new Date(`${kuwaitDay}T${hm(startText, "00:00")}:00.000+03:00`),
    end: new Date(`${kuwaitDay}T${hm(endText, "23:59")}:59.999+03:00`),
  });
  const zoneDriverRows = shiftRequests
    .map((sr) => {
      const { start, end } = windowBounds(sr.startTime, sr.endTime);
      const ordersInWindow = deliveredRows.filter(
        (r) =>
          r.driverId === sr.driverId &&
          r.deliveredAt &&
          r.deliveredAt >= start &&
          r.deliveredAt <= end,
      ).length;
      return {
        zoneId: sr.zoneId,
        zoneName: sr.zoneName,
        driverId: sr.driverId,
        driverName: sr.driver?.name ?? "n/a",
        window: `${hm(sr.startTime, "--:--")}-${hm(sr.endTime, "--:--")}`,
        ordersInWindow,
      };
    })
    .sort(
      (a, b) =>
        a.zoneName.localeCompare(b.zoneName) ||
        a.window.localeCompare(b.window) ||
        a.driverName.localeCompare(b.driverName),
    );
  const shiftWindows = Array.from(new Set(zoneDriverRows.map((r) => r.window))).sort();

  // Fleet cost today: each company's base fee per delivery plus its rate for
  // the kilometres those deliveries covered (revision 14 #3). Summed through
  // the same helper the statements are cut with, so the cockpit's cost line
  // and the month's payout cannot drift apart.
  const kmByFleet = new Map<string, Array<Prisma.Decimal | null>>();
  const deliveredByFleet = new Map<string, number>();
  for (const r of deliveredRows) {
    const f = r.driver?.fleetPartnerId;
    if (!f) continue;
    deliveredByFleet.set(f, (deliveredByFleet.get(f) ?? 0) + 1);
    const list = kmByFleet.get(f) ?? [];
    list.push(r.distanceKm);
    kmByFleet.set(f, list);
  }
  let fleetCost = 0;
  for (const fleet of fleets) {
    fleetCost += Number(
      sumFleetPayout(fleetRateOf(fleet), kmByFleet.get(fleet.id) ?? []).totalKwd,
    );
  }

  const onlineByFleet = new Map<string, number>();
  let driversOnline = 0;
  let driversBusy = 0;
  for (const s of sessions) {
    if (s.availability === "ONLINE") driversOnline += 1;
    if (s.availability === "BUSY") driversBusy += 1;
    const f = s.driver?.fleetPartnerId;
    if (f) onlineByFleet.set(f, (onlineByFleet.get(f) ?? 0) + 1);
  }

  const fees = Number(feeAgg._sum.deliveryFeeKwd ?? 0);
  const tips = Number(tipAgg._sum.tipKwd ?? 0);
  const cashInField = Number(driverAccounts._sum.balanceKwd ?? 0);
  const ceiling = Number(settings?.driverCashCeilingKwd ?? 0);

  // Threshold alerts (PRD §14): SLA, utilisation commitments, cash.
  const alerts: CockpitSummary["alerts"] = [];
  if (noDriverNow > 0) {
    alerts.push({
      kind: "NO_DRIVER_BACKLOG",
      severity: "HIGH",
      message: `${noDriverNow} order(s) have no driver. Assign one by hand or add fleet supply.`,
    });
  }
  const onTimeRate = withSla.length > 0 ? onTimeCount / withSla.length : null;
  if (onTimeRate != null && onTimeRate < 0.9 && withSla.length >= 10) {
    alerts.push({
      kind: "ON_TIME_BELOW_TARGET",
      severity: "HIGH",
      message: `On-time today is ${(onTimeRate * 100).toFixed(0)}%, below the 90% target.`,
    });
  }
  for (const fleet of fleets) {
    const commitments = (fleet.minDriversOnline ?? null) as Record<string, number> | null;
    if (!commitments) continue;
    const committed = Object.values(commitments).reduce((s, n) => s + n, 0);
    const online = onlineByFleet.get(fleet.id) ?? 0;
    if (committed > 0 && online < committed) {
      alerts.push({
        kind: "FLEET_UNDER_COMMITMENT",
        severity: "MEDIUM",
        message: `${fleet.name}: ${online}/${committed} contracted drivers online.`,
      });
    }
  }
  if (ceiling > 0 && cashInField > 0) {
    const highCash = await prisma.walletAccount.count({
      where: {
        tenantId,
        ownerType: "DRIVER_CASH",
        balanceKwd: { gte: String(ceiling * 0.8) },
      },
    });
    if (highCash > 0) {
      alerts.push({
        kind: "DRIVERS_NEAR_CASH_CEILING",
        severity: "MEDIUM",
        message: `${highCash} driver(s) are at 80% or more of the cash limit. Hub deposits are due.`,
      });
    }
  }
  if (lastRecon && lastRecon.status === "MISMATCH") {
    alerts.push({
      kind: "RECONCILIATION_MISMATCH",
      severity: "HIGH",
      message: `The nightly ledger check found a mismatch on ${lastRecon.runDate?.toISOString().slice(0, 10) ?? "the last run"}. Finance needs to look into it.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    orders: {
      activeNow: activeByStatus.reduce((s, r) => s + r._count._all, 0),
      byStatus: Object.fromEntries(activeByStatus.map((r) => [r.status, r._count._all])),
      deliveredToday: deliveredRows.length,
      cancelledToday,
      noDriverToday: noDriverNow,
      onTimeRateToday: onTimeRate != null ? Number(onTimeRate.toFixed(3)) : null,
    },
    zones: zones
      .map((z) => {
        const agg = byZone.get(z.id);
        return {
          zoneId: z.id,
          code: z.code,
          name: z.name,
          deliveredToday: agg?.delivered ?? 0,
          onTimeRate:
            agg && agg.withSla > 0 ? Number((agg.onTime / agg.withSla).toFixed(3)) : null,
          // Edit #9 — what the zone is carrying now, and who is on it.
          activeOrders: activeOrdersByZone.get(z.id) ?? 0,
          driversAssigned: new Set(
            shiftRequests
              .filter((sr) => sr.zoneId === z.id || (!sr.zoneId && sr.zoneName === z.name))
              .map((sr) => sr.driverId),
          ).size,
        };
      })
      .sort((a, b) => b.deliveredToday - a.deliveredToday),
    // Edit #9 (2026-08-22) — the assignment sheet behind the zone table.
    shifts: {
      windows: shiftWindows,
      zoneDrivers: zoneDriverRows,
    },
    money: {
      feesTodayKwd: fees.toFixed(3),
      fleetCostTodayKwd: fleetCost.toFixed(3),
      netMarginTodayKwd: (fees - fleetCost).toFixed(3),
      tipsTodayKwd: tips.toFixed(3),
    },
    fleet: {
      driversOnlineNow: driversOnline,
      driversBusyNow: driversBusy,
      fleets: fleets.map((f) => {
        const commitments = (f.minDriversOnline ?? null) as Record<string, number> | null;
        return {
          fleetPartnerId: f.id,
          name: f.name,
          disciplineStatus: f.disciplineStatus,
          driversOnline: onlineByFleet.get(f.id) ?? 0,
          minDriversOnline: commitments
            ? Object.values(commitments).reduce((s, n) => s + n, 0)
            : null,
          deliveredToday: deliveredByFleet.get(f.id) ?? 0,
          ownerGroupId: f.ownerGroup?.id ?? null,
          ownerGroupName: f.ownerGroup?.name ?? null,
        };
      }),
    },
    cash: {
      driverCashInFieldKwd: cashInField.toFixed(3),
      depositedTodayKwd: Number(remittanceAgg._sum.amountKwd ?? 0).toFixed(3),
      clearingBalanceKwd: Number(clearingAccount?.balanceKwd ?? 0).toFixed(3),
    },
    alerts,
  };
}
