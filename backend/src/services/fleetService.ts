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
}

export async function getFleetScorecard(
  tenantId: string,
  fleetPartnerId: string,
  range: { from: Date; to: Date },
): Promise<FleetScorecard> {
  const fleet = await prisma.fleetPartner.findFirst({
    where: { id: fleetPartnerId, tenantId },
    select: { id: true, minOnlineHoursPerDay: true },
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
      select: { startTime: true, endTime: true },
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
    select: { deliveredAt: true, slaDeadline: true },
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
 * Pay a FINAL statement: post FLEET_PAYOUT (idempotent per statement) and
 * mark PAID atomically. Zero-order statements flip to PAID with no posting.
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
