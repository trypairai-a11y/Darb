/**
 * Revision 13b (client note: "add the worst 3 drivers and compare them with the
 * top 3").
 *
 * The fleet scorecard was five averages about a company. An average is the one
 * thing a supervisor cannot act on: it never names anybody. This ranks the
 * company's own drivers over the same window and hands back the two ends of the
 * list, so the conversation goes from "our on-time is 82%" to "these three are
 * carrying it and these three are not".
 *
 * The score is deliberately simple and stated on screen:
 *
 *   on-time 40 · acceptance 30 · rating 30
 *
 * Weighted that way because on-time is what the merchant feels, acceptance is
 * what the dispatcher feels, and the rating is what the customer says. A
 * component with no data does not count as zero — it is dropped and the rest
 * are re-weighted, so a driver with no ratings yet is not punished for it.
 *
 * A driver under `MIN_ORDERS` deliveries is not ranked at all. Three orders is
 * not a track record, and a bottom-three built from one bad afternoon is how a
 * scorecard gets ignored.
 */
import { prisma } from "../../config";
import type { FleetDriverComparison, FleetDriverScore } from "../fleetService";

/** Deliveries in the window before a driver can be ranked. */
export const MIN_ORDERS = 5;

interface Range {
  from: Date;
  to: Date;
}

export async function getFleetDriverComparison(
  tenantId: string,
  fleetPartnerId: string,
  range: Range,
): Promise<FleetDriverComparison> {
  const drivers = await prisma.driver.findMany({
    where: { tenantId, fleetPartnerId },
    select: { id: true, name: true, driverCode: true, vehicleType: true },
  });
  if (drivers.length === 0) {
    return { top: [], bottom: [], unranked: 0, minOrders: MIN_ORDERS };
  }
  const driverIds = drivers.map((d) => d.id);

  const [deliveredRows, offers, ratings, sessions] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where: {
        tenantId,
        driverId: { in: driverIds },
        status: "DELIVERED",
        deliveredAt: { gte: range.from, lt: range.to },
      },
      select: { driverId: true, deliveredAt: true, slaDeadline: true },
    }),
    prisma.dispatchOffer.groupBy({
      by: ["driverId", "status"],
      where: {
        tenantId,
        driverId: { in: driverIds },
        offeredAt: { gte: range.from, lt: range.to },
        status: { in: ["ACCEPTED", "DECLINED", "EXPIRED"] },
      },
      _count: { _all: true },
    }),
    prisma.orderRating.groupBy({
      by: ["driverId"],
      where: {
        tenantId,
        driverId: { in: driverIds },
        createdAt: { gte: range.from, lt: range.to },
      },
      _avg: { stars: true },
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
  ]);

  const delivered = new Map<string, number>();
  const withSla = new Map<string, number>();
  const onTime = new Map<string, number>();
  for (const r of deliveredRows) {
    if (!r.driverId) continue;
    delivered.set(r.driverId, (delivered.get(r.driverId) ?? 0) + 1);
    if (r.slaDeadline && r.deliveredAt) {
      withSla.set(r.driverId, (withSla.get(r.driverId) ?? 0) + 1);
      if (r.deliveredAt.getTime() <= r.slaDeadline.getTime()) {
        onTime.set(r.driverId, (onTime.get(r.driverId) ?? 0) + 1);
      }
    }
  }

  const offerTotals = new Map<string, { responded: number; accepted: number }>();
  for (const o of offers) {
    const e = offerTotals.get(o.driverId) ?? { responded: 0, accepted: 0 };
    e.responded += o._count._all;
    if (o.status === "ACCEPTED") e.accepted += o._count._all;
    offerTotals.set(o.driverId, e);
  }

  const ratingByDriver = new Map(ratings.map((r) => [r.driverId, r]));

  const onlineMs = new Map<string, number>();
  const rangeEnd = range.to.getTime();
  for (const s of sessions) {
    const end = s.endTime ? s.endTime.getTime() : Math.min(Date.now(), rangeEnd);
    onlineMs.set(
      s.driverId,
      (onlineMs.get(s.driverId) ?? 0) + Math.max(0, end - s.startTime.getTime()),
    );
  }

  const rows: FleetDriverScore[] = drivers.map((d) => {
    const sla = withSla.get(d.id) ?? 0;
    const off = offerTotals.get(d.id);
    const rating = ratingByDriver.get(d.id);

    const onTimeRate = sla > 0 ? Number(((onTime.get(d.id) ?? 0) / sla).toFixed(3)) : null;
    const acceptanceRate =
      off && off.responded > 0 ? Number((off.accepted / off.responded).toFixed(3)) : null;
    const avgRating =
      rating && rating._count._all > 0 && rating._avg.stars != null
        ? Number(rating._avg.stars.toFixed(2))
        : null;

    return {
      driverId: d.id,
      name: d.name,
      driverCode: d.driverCode,
      vehicleType: d.vehicleType,
      deliveredOrders: delivered.get(d.id) ?? 0,
      onTimeRate,
      acceptanceRate,
      avgRating,
      ratingCount: rating?._count._all ?? 0,
      onlineHours: Math.round(((onlineMs.get(d.id) ?? 0) / 3_600_000) * 10) / 10,
      score: composite(onTimeRate, acceptanceRate, avgRating),
    };
  });

  const ranked = rows
    .filter((r) => r.deliveredOrders >= MIN_ORDERS && r.score !== null)
    // Deliveries break a tie: between two drivers scoring the same, the one who
    // did more of the work is the better driver to be short of.
    .sort((a, b) => (b.score! - a.score!) || (b.deliveredOrders - a.deliveredOrders));

  const top = ranked.slice(0, 3);
  // From the other end, worst first, and never a driver already in the top
  // three — a fleet of four must not see the same person in both columns.
  const topIds = new Set(top.map((r) => r.driverId));
  const bottom = ranked
    .filter((r) => !topIds.has(r.driverId))
    .slice(-3)
    .reverse();

  return {
    top,
    bottom,
    unranked: rows.length - ranked.length,
    minOrders: MIN_ORDERS,
  };
}

/**
 * On-time 40, acceptance 30, rating 30, out of 100.
 *
 * Missing components are dropped and the weights re-normalised rather than
 * scored as zero: a new driver with no customer ratings has not earned a
 * penalty, and scoring them 0/30 for it would put every new joiner in the
 * bottom three by construction.
 */
function composite(
  onTimeRate: number | null,
  acceptanceRate: number | null,
  avgRating: number | null,
): number | null {
  const parts: Array<[number, number]> = [];
  if (onTimeRate !== null) parts.push([40, onTimeRate]);
  if (acceptanceRate !== null) parts.push([30, acceptanceRate]);
  // 5 stars is the top of the scale, so a 4.0 average is 0.8 of it.
  if (avgRating !== null) parts.push([30, Math.max(0, Math.min(1, avgRating / 5))]);
  if (parts.length === 0) return null;

  const weight = parts.reduce((sum, [w]) => sum + w, 0);
  const earned = parts.reduce((sum, [w, v]) => sum + w * v, 0);
  return Math.round((earned / weight) * 100 * 10) / 10;
}
