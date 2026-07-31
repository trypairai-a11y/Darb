// Darb 2.0 PRD §9/§11 — fleet-partner governance reads + payout.
//
// Scorecard math (all from committed rows, no caches):
//   on-time %    = DELIVERED with deliveredAt <= slaDeadline / all DELIVERED
//   acceptance % = ACCEPTED offers / all responded offers (accepted+declined+expired)
//   utilisation  = Σ CourierOnlineSession hours vs contracted hours (when set)
//
// Payout: delivered-order count × the fleet's flat fee (PRD: 1.100 KWD/order,
// no bonuses) — computed from counts, NOT per-order accrual legs, so the
// wallet settlement flow and reconciliation invariants stay untouched. The
// statement snapshots feePerOrderKwd; payment posts one FLEET_PAYOUT
// transaction (DEBIT PLATFORM_REVENUE = fleet cost against fee income,
// CREDIT PLATFORM_CLEARING = cash out).

import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { logger } from "../config/logger";
import {
  PostResult,
  WalletError,
  ensureAccount,
  postLedgerTransaction,
} from "./wallet/walletService";

export interface FleetScorecard {
  fleetPartnerId: string;
  /** The window every number below was measured over, echoed back so the
   *  screen and the workbook can name the period instead of implying "all
   *  time". ISO strings; `to` is the inclusive end the caller asked for. */
  periodFrom: string;
  periodTo: string;
  driverCount: number;
  deliveredOrders: number;
  onTimeRate: number | null; // 0..1
  acceptanceRate: number | null; // 0..1
  onlineHours: number;
  contractedHours: number | null;
  utilisation: number | null; // 0..1 vs contract
  avgRating: number | null;
  ratingCount: number;

  // ── Revision 13b (client note: "add more KPIs here") ───────────────────
  //
  // Five numbers a supervisor asks for next, each derived from rows that
  // already exist. Nothing here needed a new write path or a cache.

  /** Drivers who delivered at least one order. The roster count above says how
   *  many are on the books; this says how many actually worked. */
  activeDrivers: number;
  /** Delivered orders per driver who worked. Productivity per head. */
  ordersPerDriver: number | null;
  /** Delivered orders per online hour. Productivity per hour, which is the
   *  one that moves when a company floods the zone with idle drivers. */
  ordersPerOnlineHour: number | null;
  /** Median minutes from dispatch to delivery, so one 4-hour outlier does not
   *  redraw the number the way a mean does. */
  medianDeliveryMinutes: number | null;
  /** Orders that never arrived (FAILED or RETURNED) as a share of everything
   *  assigned to this fleet in the window. */
  failedOrders: number;
  failureRate: number | null;
  /** Delivered orders the driver was late on. The complement of on-time, in
   *  the unit a conversation with a driver actually uses. */
  slaBreaches: number;
  /** What the period is worth to the company at its flat fee, so the
   *  scorecard and the payout tab stop being two different conversations. */
  earningsKwd: string;
  /** Offers this fleet declined or let expire. Acceptance rate as a count. */
  offersDeclined: number;
  offersExpired: number;
}

/** One driver's slice of the same window. */
export interface FleetDriverScore {
  driverId: string;
  name: string;
  driverCode: string | null;
  vehicleType: string;
  deliveredOrders: number;
  onTimeRate: number | null;
  acceptanceRate: number | null;
  avgRating: number | null;
  ratingCount: number;
  onlineHours: number;
  /** 0..100. On-time 40, acceptance 30, rating 30, and null where a driver has
   *  not done enough for the component to mean anything. */
  score: number | null;
}

export interface FleetDriverComparison {
  /** Ranked best first. At most three. */
  top: FleetDriverScore[];
  /** Ranked worst first, so the row that needs a phone call is at the top. */
  bottom: FleetDriverScore[];
  /** Drivers with too little activity in the window to rank at all, kept as a
   *  count so "why is my driver in neither list" has an answer. */
  unranked: number;
  /** The minimum delivered orders a driver needed to be ranked. */
  minOrders: number;
}

export async function getFleetScorecard(
  tenantId: string,
  fleetPartnerId: string,
  range: { from: Date; to: Date },
): Promise<FleetScorecard> {
  const fleet = await prisma.fleetPartner.findFirst({
    where: { id: fleetPartnerId, tenantId },
    select: { id: true, minOnlineHoursPerDay: true, flatFeePerOrderKwd: true },
  });
  if (!fleet) throw new Error("Fleet partner not found");

  const drivers = await prisma.driver.findMany({
    where: { tenantId, fleetPartnerId },
    select: { id: true },
  });
  const driverIds = drivers.map((d) => d.id);
  const period = { periodFrom: range.from.toISOString(), periodTo: range.to.toISOString() };

  if (driverIds.length === 0) {
    return {
      fleetPartnerId,
      ...period,
      driverCount: 0,
      deliveredOrders: 0,
      onTimeRate: null,
      acceptanceRate: null,
      onlineHours: 0,
      contractedHours: null,
      utilisation: null,
      avgRating: null,
      ratingCount: 0,
      activeDrivers: 0,
      ordersPerDriver: null,
      ordersPerOnlineHour: null,
      medianDeliveryMinutes: null,
      failedOrders: 0,
      failureRate: null,
      slaBreaches: 0,
      earningsKwd: "0.000",
      offersDeclined: 0,
      offersExpired: 0,
    };
  }

  const [delivered, onTime, offers, sessions, ratingAgg] = await Promise.all([
    prisma.deliveryOrder.count({
      where: {
        tenantId,
        driverId: { in: driverIds },
        status: "DELIVERED",
        deliveredAt: { gte: range.from, lt: range.to },
      },
    }),
    prisma.deliveryOrder.count({
      where: {
        tenantId,
        driverId: { in: driverIds },
        status: "DELIVERED",
        deliveredAt: { gte: range.from, lt: range.to },
        AND: [
          { slaDeadline: { not: null } },
          // deliveredAt <= slaDeadline expressed as a column comparison is not
          // supported by Prisma filters; fetch-side approximation below.
        ],
      },
    }),
    prisma.dispatchOffer.groupBy({
      by: ["status"],
      where: {
        tenantId,
        driverId: { in: driverIds },
        offeredAt: { gte: range.from, lt: range.to },
        status: { in: ["ACCEPTED", "DECLINED", "EXPIRED"] },
      },
      _count: { _all: true },
    }),
    prisma.courierOnlineSession.findMany({
      where: {
        tenantId,
        driverId: { in: driverIds },
        startTime: { gte: range.from, lt: range.to },
      },
      select: { driverId: true, startTime: true, endTime: true },
    }),
    prisma.orderRating.aggregate({
      where: {
        tenantId,
        driverId: { in: driverIds },
        createdAt: { gte: range.from, lt: range.to },
      },
      _avg: { stars: true },
      _count: { _all: true },
    }),
  ]);

  // On-time: Prisma can't compare two columns, so count the SLA breaches with
  // a raw-free second pass over the delivered rows in the window.
  const deliveredRows = await prisma.deliveryOrder.findMany({
    where: {
      tenantId,
      driverId: { in: driverIds },
      status: "DELIVERED",
      deliveredAt: { gte: range.from, lt: range.to },
    },
    // driverId and assignedAt ride along for the per-driver comparison and the
    // median delivery time; both were already in this row.
    select: { driverId: true, deliveredAt: true, slaDeadline: true, assignedAt: true },
  });

  // Orders assigned to this fleet that never arrived. Counted over the same
  // window by when they were assigned, because a FAILED order has no
  // deliveredAt to measure from.
  const failedOrders = await prisma.deliveryOrder.count({
    where: {
      tenantId,
      driverId: { in: driverIds },
      status: { in: ["FAILED", "RETURNED"] },
      assignedAt: { gte: range.from, lt: range.to },
    },
  });
  void onTime; // superseded by the row pass above
  const withSla = deliveredRows.filter((r) => r.slaDeadline && r.deliveredAt);
  const onTimeCount = withSla.filter(
    (r) => (r.deliveredAt as Date).getTime() <= (r.slaDeadline as Date).getTime(),
  ).length;

  const counts = Object.fromEntries(offers.map((o) => [o.status, o._count._all]));
  const responded =
    (counts.ACCEPTED ?? 0) + (counts.DECLINED ?? 0) + (counts.EXPIRED ?? 0);

  let onlineMs = 0;
  const rangeEnd = range.to.getTime();
  for (const s of sessions) {
    const end = s.endTime ? s.endTime.getTime() : Math.min(Date.now(), rangeEnd);
    onlineMs += Math.max(0, end - s.startTime.getTime());
  }
  const onlineHours = Math.round((onlineMs / 3_600_000) * 10) / 10;

  const days = Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000));
  const contractedHours =
    fleet.minOnlineHoursPerDay != null
      ? Math.round(fleet.minOnlineHoursPerDay * days * driverIds.length * 10) / 10
      : null;

  // Revision 13b — the five the client asked for, from rows already in hand.
  const activeDrivers = new Set(
    deliveredRows.map((r) => r.driverId).filter(Boolean) as string[],
  ).size;

  // Median, not mean: one driver who forgot to close an order at midnight
  // would otherwise redraw the whole number.
  const durations = deliveredRows
    .filter((r) => r.assignedAt && r.deliveredAt)
    .map((r) => ((r.deliveredAt as Date).getTime() - (r.assignedAt as Date).getTime()) / 60_000)
    .filter((m) => m > 0 && m < 24 * 60)
    .sort((a, b) => a - b);
  const medianDeliveryMinutes =
    durations.length > 0
      ? Math.round(durations[Math.floor(durations.length / 2)] * 10) / 10
      : null;

  const feePerOrder = Number(fleet.flatFeePerOrderKwd ?? 1.1);
  const assignedTotal = delivered + failedOrders;

  return {
    fleetPartnerId,
    ...period,
    driverCount: driverIds.length,
    deliveredOrders: delivered,
    onTimeRate: withSla.length > 0 ? Number((onTimeCount / withSla.length).toFixed(3)) : null,
    acceptanceRate: responded > 0 ? Number(((counts.ACCEPTED ?? 0) / responded).toFixed(3)) : null,
    onlineHours,
    contractedHours,
    utilisation:
      contractedHours && contractedHours > 0
        ? Number((onlineHours / contractedHours).toFixed(3))
        : null,
    avgRating: ratingAgg._avg.stars != null ? Number(ratingAgg._avg.stars.toFixed(2)) : null,
    ratingCount: ratingAgg._count._all,

    activeDrivers,
    ordersPerDriver:
      activeDrivers > 0 ? Number((delivered / activeDrivers).toFixed(1)) : null,
    ordersPerOnlineHour:
      onlineHours > 0 ? Number((delivered / onlineHours).toFixed(2)) : null,
    medianDeliveryMinutes,
    failedOrders,
    failureRate:
      assignedTotal > 0 ? Number((failedOrders / assignedTotal).toFixed(3)) : null,
    slaBreaches: withSla.length - onTimeCount,
    earningsKwd: (delivered * feePerOrder).toFixed(3),
    offersDeclined: counts.DECLINED ?? 0,
    offersExpired: counts.EXPIRED ?? 0,
  };
}

/**
 * Generate monthly fleet payout statements. Idempotent on
 * [tenantId, fleetPartnerId, periodStart]; the fee rate is snapshotted so a
 * later rate change never rewrites a closed month.
 */
export async function generateFleetStatements(
  tenantId: string,
  period: { start: Date; end: Date },
): Promise<number> {
  const fleets = await prisma.fleetPartner.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, flatFeePerOrderKwd: true },
  });

  let created = 0;
  for (const fleet of fleets) {
    try {
      const existing = await prisma.fleetPayoutStatement.findFirst({
        where: { tenantId, fleetPartnerId: fleet.id, periodStart: period.start },
        select: { id: true },
      });
      if (existing) continue;

      const deliveredOrders = await prisma.deliveryOrder.count({
        where: {
          tenantId,
          status: "DELIVERED",
          deliveredAt: { gte: period.start, lt: period.end },
          driver: { fleetPartnerId: fleet.id },
        },
      });

      const fee = new Prisma.Decimal(fleet.flatFeePerOrderKwd);
      await prisma.fleetPayoutStatement.create({
        data: {
          tenantId,
          fleetPartnerId: fleet.id,
          periodStart: period.start,
          periodEnd: period.end,
          deliveredOrders,
          feePerOrderKwd: fee,
          totalKwd: fee.times(deliveredOrders),
        },
      });
      created += 1;
    } catch (err) {
      logger.error({ err, tenantId, fleetPartnerId: fleet.id }, "generateFleetStatements: fleet failed");
    }
  }
  return created;
}

/**
 * Pay a CONFIRMED statement: post FLEET_PAYOUT (idempotent per statement) and
 * mark PAID atomically.
 *
 * Revision 13 (#8) — the delivery company confirms the figure before Darb
 * processes it. The gate lives here rather than in the route so the staff
 * button, a cron and a script are all bound by the same rule: paying a month a
 * subcontractor never agreed to is an argument after the transfer instead of
 * before it.
 *
 * Zero-total statements are the one exception and still flip to PAID with no
 * posting and no confirmation. There is nothing to disagree with about KD
 * 0.000, and holding a payroll run open for it would be theatre.
 */
export async function postFleetPayout(args: {
  tenantId: string;
  statementId: string;
  actorId: string;
}): Promise<PostResult | null> {
  const { tenantId, statementId, actorId } = args;

  return prisma.$transaction(async (tx) => {
    const statement = await tx.fleetPayoutStatement.findFirst({
      where: { id: statementId, tenantId },
    });
    if (!statement) throw new WalletError("Statement not found");
    if (statement.status === "PAID") return null;

    if (statement.totalKwd.lte(0)) {
      await tx.fleetPayoutStatement.update({
        where: { id: statementId },
        data: { status: "PAID" },
      });
      return null;
    }

    if (statement.status !== "CONFIRMED") {
      throw new WalletError(
        statement.status === "DISPUTED"
          ? "The delivery company has disputed this statement. Settle the query before paying it."
          : "The delivery company has not confirmed this statement yet.",
      );
    }

    const revenue = await ensureAccount(tx, tenantId, "PLATFORM_REVENUE");
    const clearing = await ensureAccount(tx, tenantId, "PLATFORM_CLEARING");

    const posted = await postLedgerTransaction(tx, {
      tenantId,
      type: "FLEET_PAYOUT",
      idempotencyKey: `fleet-payout:${statementId}`,
      memo: `Fleet payout ${statementId}: ${statement.deliveredOrders} orders x ${statement.feePerOrderKwd.toFixed(3)} KWD`,
      createdById: actorId,
      legs: [
        {
          accountId: revenue.id,
          ownerType: "PLATFORM_REVENUE",
          direction: "DEBIT", // fleet cost against fee income
          amountKwd: statement.totalKwd,
        },
        {
          accountId: clearing.id,
          ownerType: "PLATFORM_CLEARING",
          direction: "CREDIT", // cash out
          amountKwd: statement.totalKwd,
        },
      ],
    });
    if (!posted) return null;

    await tx.fleetPayoutStatement.update({
      where: { id: statementId },
      data: { status: "PAID", payoutTxId: posted.transactionId },
    });
    return posted;
  });
}
