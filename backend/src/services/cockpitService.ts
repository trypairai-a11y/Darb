// Darb 2.0 PRD §14 — the founder cockpit. Live orders + on-time % by zone,
// revenue and margin today (fees in, fleet cost out, net), fleet utilisation,
// live cash position (collected in the field vs deposited), and threshold
// alerts. Every number is derived from committed rows on read; no caches.

import { prisma } from "../config";

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
  }>;
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

export async function getCockpitSummary(tenantId: string): Promise<CockpitSummary> {
  const today = startOfToday();

  const [
    activeByStatus,
    deliveredRows,
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
      where: { tenantId, status: "DELIVERED", deliveredAt: { gte: today } },
      select: {
        deliveredAt: true,
        slaDeadline: true,
        pickupZoneId: true,
        deliveryFeeKwd: true,
        driver: { select: { fleetPartnerId: true } },
      },
    }),
    prisma.deliveryOrder.count({
      where: { tenantId, status: "CANCELLED", cancelledAt: { gte: today } },
    }),
    prisma.deliveryOrder.count({ where: { tenantId, status: "NO_DRIVER" } }),
    prisma.deliveryZone.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true },
    }),
    prisma.deliveryOrder.aggregate({
      where: { tenantId, status: "DELIVERED", deliveredAt: { gte: today } },
      _sum: { deliveryFeeKwd: true },
    }),
    prisma.deliveryOrder.aggregate({
      where: { tenantId, status: "DELIVERED", deliveredAt: { gte: today }, tipKwd: { not: null } },
      _sum: { tipKwd: true },
    }),
    prisma.courierOnlineSession.findMany({
      where: { tenantId, isOnline: true, availability: { in: ["ONLINE", "BUSY"] } },
      select: { availability: true, driver: { select: { fleetPartnerId: true } } },
    }),
    prisma.fleetPartner.findMany({
      where: { tenantId },
      select: { id: true, name: true, disciplineStatus: true, minDriversOnline: true, flatFeePerOrderKwd: true },
    }),
    prisma.walletAccount.aggregate({
      where: { tenantId, ownerType: "DRIVER_CASH" },
      _sum: { balanceKwd: true },
    }),
    prisma.remittance.aggregate({
      where: { tenantId, createdAt: { gte: today } },
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

  // Fleet cost today: delivered-by-fleet counts x each fleet's flat fee.
  const deliveredByFleet = new Map<string, number>();
  for (const r of deliveredRows) {
    const f = r.driver?.fleetPartnerId;
    if (f) deliveredByFleet.set(f, (deliveredByFleet.get(f) ?? 0) + 1);
  }
  let fleetCost = 0;
  for (const fleet of fleets) {
    fleetCost += (deliveredByFleet.get(fleet.id) ?? 0) * Number(fleet.flatFeePerOrderKwd);
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
      message: `${noDriverNow} order(s) stuck in NO_DRIVER — assign manually or add fleet supply.`,
    });
  }
  const onTimeRate = withSla.length > 0 ? onTimeCount / withSla.length : null;
  if (onTimeRate != null && onTimeRate < 0.9 && withSla.length >= 10) {
    alerts.push({
      kind: "ON_TIME_BELOW_TARGET",
      severity: "HIGH",
      message: `On-time today is ${(onTimeRate * 100).toFixed(0)}% — below the ~90% expansion gate.`,
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
        message: `${highCash} driver(s) at 80%+ of the cash ceiling — hub deposits due.`,
      });
    }
  }
  if (lastRecon && lastRecon.status === "MISMATCH") {
    alerts.push({
      kind: "RECONCILIATION_MISMATCH",
      severity: "HIGH",
      message: `Nightly ledger self-check found a mismatch on ${lastRecon.runDate?.toISOString().slice(0, 10) ?? "the last run"} — finance must investigate.`,
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
        };
      })
      .sort((a, b) => b.deliveredToday - a.deliveredToday),
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
