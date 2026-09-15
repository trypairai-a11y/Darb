/**
 * Revision 20 — "where are we now and what to expect later in numbers".
 *
 * That is the whole brief for the Admin tab's first subtab, and it is two
 * halves. "Where are we now" is the cockpit, which already exists. This file
 * is the second half.
 *
 * A forecast that cannot say how confident it is, is a guess with a decimal
 * point on it. So every projection here carries the sample it was built from
 * and a plain-language basis string, and a series with too little history
 * returns null rather than a number. An owner shown "KD 4,210 next month" with
 * eleven days of data behind it will make a decision on it.
 *
 * The method: trailing daily actuals, a weekday profile so a Friday is
 * forecast as a Friday, and a growth factor taken from the two most recent
 * equal-length windows. No external library, nothing to schedule, and every
 * step is arithmetic a founder can check by hand — which matters more here
 * than accuracy, because the number is going into a decision either way.
 */
import { prisma } from "../config";

/** The trailing window the projection reads. Eight weeks covers a pay cycle. */
export const LOOKBACK_DAYS = 56;
/** Below this there is not enough history to say anything honest. */
export const MIN_DAYS_FOR_FORECAST = 14;
/** How far the projection runs. */
export const HORIZON_DAYS = 30;

/** Growth is clamped: one exceptional fortnight must not compound for a month. */
const MAX_GROWTH = 1.5;
const MIN_GROWTH = 0.6;

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  orders: number;
  revenueKwd: number;
}

export interface ForecastSeries {
  /** Actuals, oldest first. */
  history: DailyPoint[];
  /** Projections, one row per day of the horizon. Empty when unforecastable. */
  projection: DailyPoint[];
  /** Totals over the horizon. Null when there is not enough history. */
  projectedOrders: number | null;
  projectedRevenueKwd: number | null;
  /** Week-on-week growth the projection applied, as a multiplier. */
  growthFactor: number | null;
  /** How many days of actuals the projection was built from. */
  sampleDays: number;
  /** Why the numbers are what they are, in words the screen prints verbatim. */
  basis: string;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Orders and delivery revenue per day over the trailing window, plus a
 * projection over the horizon.
 */
export async function buildForecast(params: {
  tenantId: string;
  lookbackDays?: number;
  horizonDays?: number;
  now?: Date;
}): Promise<ForecastSeries> {
  const tenantId = params.tenantId;
  const now = params.now ?? new Date();
  const lookbackDays = params.lookbackDays ?? LOOKBACK_DAYS;
  const horizonDays = params.horizonDays ?? HORIZON_DAYS;

  const today = startOfDay(now);
  const from = new Date(today.getTime() - lookbackDays * 86_400_000);

  const orders = await prisma.deliveryOrder.findMany({
    where: {
      tenantId,
      status: "DELIVERED",
      deliveredAt: { gte: from, lt: today },
      // A practice order earns nothing and forecasts nothing.
      isTraining: false,
    },
    select: { deliveredAt: true, deliveryFeeKwd: true },
  });

  // ── Actuals, with every day present even when it saw nothing ────────────
  const byDay = new Map<string, { orders: number; revenueKwd: number }>();
  for (let i = 0; i < lookbackDays; i++) {
    byDay.set(isoDay(new Date(from.getTime() + i * 86_400_000)), { orders: 0, revenueKwd: 0 });
  }
  for (const o of orders) {
    if (!o.deliveredAt) continue;
    const key = isoDay(startOfDay(o.deliveredAt));
    const row = byDay.get(key);
    if (!row) continue;
    row.orders += 1;
    row.revenueKwd += Number(o.deliveryFeeKwd ?? 0);
  }
  const history: DailyPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      orders: v.orders,
      revenueKwd: Math.round(v.revenueKwd * 1000) / 1000,
    }));

  // Days before the first order ever are not a quiet day, they are no data.
  const firstActive = history.findIndex((h) => h.orders > 0);
  const live = firstActive === -1 ? [] : history.slice(firstActive);

  if (live.length < MIN_DAYS_FOR_FORECAST) {
    return {
      history,
      projection: [],
      projectedOrders: null,
      projectedRevenueKwd: null,
      growthFactor: null,
      sampleDays: live.length,
      basis: `Not enough history to project: ${live.length} day${live.length === 1 ? "" : "s"} of deliveries, ${MIN_DAYS_FOR_FORECAST} needed.`,
    };
  }

  // ── Weekday profile ────────────────────────────────────────────────────
  // A Friday is forecast as a Friday. Without this the projection is a flat
  // average and every weekend reads as a miss.
  const weekdayOrders: number[][] = Array.from({ length: 7 }, () => []);
  const weekdayRevenue: number[][] = Array.from({ length: 7 }, () => []);
  for (const point of live) {
    const day = new Date(`${point.date}T00:00:00`).getDay();
    weekdayOrders[day]!.push(point.orders);
    weekdayRevenue[day]!.push(point.revenueKwd);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const overallOrders = mean(live.map((p) => p.orders));
  const overallRevenue = mean(live.map((p) => p.revenueKwd));

  // ── Growth, from the two most recent equal windows ──────────────────────
  const half = Math.floor(live.length / 2);
  const recent = live.slice(live.length - half);
  const prior = live.slice(live.length - 2 * half, live.length - half);
  const recentMean = mean(recent.map((p) => p.orders));
  const priorMean = mean(prior.map((p) => p.orders));
  let growthFactor = priorMean > 0 ? recentMean / priorMean : 1;
  if (!Number.isFinite(growthFactor) || growthFactor <= 0) growthFactor = 1;
  growthFactor = Math.min(MAX_GROWTH, Math.max(MIN_GROWTH, growthFactor));
  // Spread the window-over-window factor across the days of one window, so it
  // compounds at the rate it was measured at rather than all at once.
  const dailyGrowth = half > 0 ? Math.pow(growthFactor, 1 / half) : 1;

  const projection: DailyPoint[] = [];
  for (let i = 0; i < horizonDays; i++) {
    const date = new Date(today.getTime() + i * 86_400_000);
    const day = date.getDay();
    const baseOrders = weekdayOrders[day]!.length ? mean(weekdayOrders[day]!) : overallOrders;
    const baseRevenue = weekdayRevenue[day]!.length ? mean(weekdayRevenue[day]!) : overallRevenue;
    const factor = Math.pow(dailyGrowth, i + 1);
    projection.push({
      date: isoDay(date),
      orders: Math.round(baseOrders * factor),
      revenueKwd: Math.round(baseRevenue * factor * 1000) / 1000,
    });
  }

  const pct = Math.round((growthFactor - 1) * 100);
  return {
    history,
    projection,
    projectedOrders: projection.reduce((a, p) => a + p.orders, 0),
    projectedRevenueKwd:
      Math.round(projection.reduce((a, p) => a + p.revenueKwd, 0) * 1000) / 1000,
    growthFactor: Math.round(growthFactor * 1000) / 1000,
    sampleDays: live.length,
    basis:
      `${live.length} days of deliveries, forecast by weekday average with ` +
      `${pct >= 0 ? "+" : ""}${pct}% week-on-week growth carried forward.`,
  };
}

export interface AdminSnapshot {
  /** Where we are, as of now. */
  now: {
    activeVendors: number;
    activeFleets: number;
    activeDrivers: number;
    driversInTraining: number;
    ordersToday: number;
    deliveredToday: number;
    revenueTodayKwd: number;
    openDisputes: number;
    documentsWaiting: number;
    onboardingWaiting: number;
  };
  forecast: ForecastSeries;
  /** Month to date against the same stretch of the previous month. */
  monthToDate: {
    orders: number;
    revenueKwd: number;
    previousOrders: number;
    previousRevenueKwd: number;
  };
}

/** Everything the Admin dashboard draws, in one call. */
export async function adminSnapshot(tenantId: string, now = new Date()): Promise<AdminSnapshot> {
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  // The same stretch of the previous month, so day 9 compares with day 9.
  const prevMonthSameDay = new Date(
    prevMonthStart.getTime() + (today.getTime() - monthStart.getTime()),
  );

  const [
    activeVendors,
    activeFleets,
    activeDrivers,
    driversInTraining,
    ordersToday,
    deliveredToday,
    revenueToday,
    openDisputes,
    documentsWaiting,
    onboardingWaiting,
    mtd,
    prevMtd,
    forecast,
  ] = await Promise.all([
    prisma.vendor.count({ where: { tenantId, isActive: true } }),
    prisma.fleetPartner.count({ where: { tenantId, isActive: true } }),
    prisma.driver.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.driver.count({ where: { tenantId, inTraining: true } }),
    prisma.deliveryOrder.count({
      where: { tenantId, createdAt: { gte: today, lt: tomorrow }, isTraining: false },
    }),
    prisma.deliveryOrder.count({
      where: { tenantId, status: "DELIVERED", deliveredAt: { gte: today, lt: tomorrow }, isTraining: false },
    }),
    prisma.deliveryOrder.aggregate({
      where: { tenantId, status: "DELIVERED", deliveredAt: { gte: today, lt: tomorrow }, isTraining: false },
      _sum: { deliveryFeeKwd: true },
    }),
    prisma.fleetPayoutStatement.count({ where: { tenantId, status: "DISPUTED" } }),
    prisma.fleetDocument.count({ where: { tenantId, status: "PENDING_REVIEW" } }),
    prisma.onboardingRequest.count({ where: { tenantId, status: { in: ["NEW", "IN_REVIEW"] } } }),
    prisma.deliveryOrder.aggregate({
      where: { tenantId, status: "DELIVERED", deliveredAt: { gte: monthStart, lt: tomorrow }, isTraining: false },
      _count: { _all: true },
      _sum: { deliveryFeeKwd: true },
    }),
    prisma.deliveryOrder.aggregate({
      where: {
        tenantId,
        status: "DELIVERED",
        deliveredAt: { gte: prevMonthStart, lt: prevMonthSameDay },
        isTraining: false,
      },
      _count: { _all: true },
      _sum: { deliveryFeeKwd: true },
    }),
    buildForecast({ tenantId, now }),
  ]);

  return {
    now: {
      activeVendors,
      activeFleets,
      activeDrivers,
      driversInTraining,
      ordersToday,
      deliveredToday,
      revenueTodayKwd: Number(revenueToday._sum.deliveryFeeKwd ?? 0),
      openDisputes,
      documentsWaiting,
      onboardingWaiting,
    },
    forecast,
    monthToDate: {
      orders: mtd._count._all,
      revenueKwd: Number(mtd._sum.deliveryFeeKwd ?? 0),
      previousOrders: prevMtd._count._all,
      previousRevenueKwd: Number(prevMtd._sum.deliveryFeeKwd ?? 0),
    },
  };
}
