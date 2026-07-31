/**
 * Revision 12 — "how many orders did this driver do, per day".
 *
 * Two shapes, both one query each:
 *   - `rosterActivity`  today + last 7 days for every driver in the fleet, so
 *     the roster table can carry the columns without N+1.
 *   - `driverMonthActivity`  day by day for one driver and one month.
 *
 * Kuwait is UTC+3 all year with no DST, so the day boundary is a fixed offset.
 * Bucketing on UTC would push a driver's evening orders onto tomorrow, which is
 * exactly the number a supervisor would query first.
 */
import { prisma } from "../../config";

/** Kuwait is UTC+3, no daylight saving, ever. */
const KWT_OFFSET_MS = 3 * 3_600_000;

/** Midnight Kuwait time, as an instant. */
export function kuwaitDayStart(d: Date): Date {
  const shifted = new Date(d.getTime() + KWT_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KWT_OFFSET_MS);
}

/** The YYYY-MM-DD a given instant falls on in Kuwait. */
export function kuwaitDateKey(d: Date): string {
  return new Date(d.getTime() + KWT_OFFSET_MS).toISOString().slice(0, 10);
}

export interface DriverActivityCounts {
  ordersToday: number;
  ordersLast7d: number;
}

/**
 * Delivered-order counts for every driver in one fleet. One groupBy over the
 * 7-day window, then today is counted from the same rows rather than a second
 * round trip.
 */
export async function rosterActivity(
  tenantId: string,
  fleetPartnerId: string,
  now = new Date(),
): Promise<Map<string, DriverActivityCounts>> {
  const todayStart = kuwaitDayStart(now);
  const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000);

  const rows = await prisma.deliveryOrder.findMany({
    where: {
      tenantId,
      status: "DELIVERED",
      deliveredAt: { gte: weekStart },
      driver: { fleetPartnerId },
    },
    select: { driverId: true, deliveredAt: true },
  });

  const out = new Map<string, DriverActivityCounts>();
  for (const r of rows) {
    if (!r.driverId || !r.deliveredAt) continue;
    const entry = out.get(r.driverId) ?? { ordersToday: 0, ordersLast7d: 0 };
    entry.ordersLast7d += 1;
    if (r.deliveredAt >= todayStart) entry.ordersToday += 1;
    out.set(r.driverId, entry);
  }
  return out;
}

export interface DayCount {
  date: string;
  orders: number;
}

export interface MonthActivity {
  month: string;
  days: DayCount[];
  totalOrders: number;
  activeDays: number;
  avgPerActiveDay: number | null;
}

/**
 * Day-by-day delivered counts for one driver across one month. Every day in
 * the month is present, including the zeroes: a gap in a table reads as "no
 * data", and a driver who did nothing on Tuesday is the thing a supervisor is
 * looking for.
 */
export async function driverMonthActivity(
  tenantId: string,
  driverId: string,
  month: string,
  now = new Date(),
): Promise<MonthActivity> {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const monthIdx = m ? Number(m[2]) - 1 : now.getUTCMonth();

  // Month boundaries in Kuwait time, expressed as instants.
  const start = new Date(Date.UTC(year, monthIdx, 1) - KWT_OFFSET_MS);
  const end = new Date(Date.UTC(year, monthIdx + 1, 1) - KWT_OFFSET_MS);

  const rows = await prisma.deliveryOrder.findMany({
    where: {
      tenantId,
      driverId,
      status: "DELIVERED",
      deliveredAt: { gte: start, lt: end },
    },
    select: { deliveredAt: true },
  });

  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.deliveredAt) continue;
    const key = kuwaitDateKey(r.deliveredAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const todayKey = kuwaitDateKey(now);
  const days: DayCount[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    // Do not print future days of the current month as zeroes.
    if (key > todayKey) break;
    days.push({ date: key, orders: counts.get(key) ?? 0 });
  }

  const totalOrders = days.reduce((s, d) => s + d.orders, 0);
  const activeDays = days.filter((d) => d.orders > 0).length;
  return {
    month: `${year}-${String(monthIdx + 1).padStart(2, "0")}`,
    days,
    totalOrders,
    activeDays,
    avgPerActiveDay: activeDays ? Number((totalOrders / activeDays).toFixed(1)) : null,
  };
}
