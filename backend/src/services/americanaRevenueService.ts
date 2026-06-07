import { prisma } from "../config";

// Helpers for computing Americana revenue against the chain-rate table.

export function vehicleTypeOf(position: string | null | undefined): "CAR" | "BIKE" {
  return (position || "").toLowerCase().includes("bike") ? "BIKE" : "CAR";
}

/**
 * Return the rate for a (chainId, vehicleType) at a given date. The caller
 * typically uses the first day of the month — rates with effectiveFrom ≤ day
 * and (effectiveTo is null OR effectiveTo > day).
 */
export async function getRate(
  tenantId: string,
  chainId: string,
  vehicleType: "CAR" | "BIKE",
  date: Date
): Promise<number | null> {
  const rate = await prisma.americanaChainRate.findFirst({
    where: {
      tenantId,
      chainId,
      vehicleType,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!rate) return null;
  return Number(rate.ratePerOrder);
}

/**
 * Pre-load the rate table for a month and return a Map keyed by
 * "<chainId>:<vehicleType>".  Used to avoid N+1 lookups in overview / export.
 */
export async function resolveRatesForMonth(tenantId: string, firstOfMonth: Date): Promise<Map<string, number>> {
  const rates = await prisma.americanaChainRate.findMany({
    where: {
      tenantId,
      effectiveFrom: { lte: firstOfMonth },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: firstOfMonth } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  const map = new Map<string, number>();
  for (const r of rates) {
    const key = `${r.chainId}:${r.vehicleType}`;
    if (!map.has(key)) map.set(key, Number(r.ratePerOrder));
  }
  return map;
}

export interface StoreRevenueRow {
  storeId: string | null;
  storeName: string;
  chainId: string | null;
  chainName: string;
  area: string | null;
  orders: number;
  ordersLM: number;
  rate: number | null;
  vehicleType: "CAR" | "BIKE";
  revenue: number | null;
  revenueLM: number | null;
  deltaPct: number | null;
  trend: number[]; // daily orders MTD
  drivers: number;
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function nextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

/**
 * Aggregate revenue by store for a given month + the month before it.
 */
export async function buildRevenueByStore(tenantId: string, month: Date): Promise<StoreRevenueRow[]> {
  const from = firstOfMonth(month);
  const prev = firstOfMonth(new Date(from.getFullYear(), from.getMonth() - 1, 1));

  const [orders, prevOrders, chains, stores, rateMap] = await Promise.all([
    prisma.americanaDailyOrders.findMany({ where: { tenantId, month: from } }),
    prisma.americanaDailyOrders.findMany({ where: { tenantId, month: prev } }),
    prisma.americanaChain.findMany({ where: { tenantId } }),
    prisma.americanaStore.findMany({ where: { tenantId } }),
    resolveRatesForMonth(tenantId, from),
  ]);

  const chainById = new Map(chains.map((c) => [c.id, c]));
  const storeById = new Map(stores.map((s) => [s.id, s]));

  const groups = new Map<string, StoreRevenueRow & { trendDays: Record<string, number>; driverSet: Set<string> }>();
  for (const o of orders) {
    const key = o.storeId || `name:${o.storeName || "Unknown"}`;
    const existing = groups.get(key);
    const chain = o.chainId ? chainById.get(o.chainId) : null;
    const store = o.storeId ? storeById.get(o.storeId) : null;
    const vt = vehicleTypeOf(o.position);
    if (!existing) {
      groups.set(key, {
        storeId: o.storeId,
        storeName: store?.name ?? o.storeName ?? "Unknown",
        chainId: o.chainId,
        chainName: chain?.name ?? o.chain ?? "Unknown",
        area: store?.area ?? null,
        orders: o.totalOrders,
        ordersLM: 0,
        rate: o.chainId ? rateMap.get(`${o.chainId}:${vt}`) ?? null : null,
        vehicleType: vt,
        revenue: null,
        revenueLM: null,
        deltaPct: null,
        trend: [],
        drivers: 0,
        trendDays: { ...(o.dailyOrders as Record<string, number> | null ?? {}) },
        driverSet: new Set<string>([o.driverId]),
      });
    } else {
      existing.orders += o.totalOrders;
      existing.driverSet.add(o.driverId);
      const daily = o.dailyOrders as Record<string, number> | null;
      if (daily) {
        for (const [day, v] of Object.entries(daily)) {
          existing.trendDays[day] = (existing.trendDays[day] ?? 0) + (v || 0);
        }
      }
    }
  }

  for (const o of prevOrders) {
    const key = o.storeId || `name:${o.storeName || "Unknown"}`;
    const existing = groups.get(key);
    if (existing) existing.ordersLM += o.totalOrders;
  }

  const out: StoreRevenueRow[] = [];
  for (const [, g] of groups) {
    const revenue = g.rate != null ? g.orders * g.rate : null;
    const revenueLM = g.rate != null ? g.ordersLM * g.rate : null;
    const deltaPct =
      revenue != null && revenueLM != null && revenueLM > 0
        ? ((revenue - revenueLM) / revenueLM) * 100
        : null;
    const days = Object.keys(g.trendDays).sort();
    const trend = days.map((d) => g.trendDays[d] || 0);
    out.push({
      storeId: g.storeId,
      storeName: g.storeName,
      chainId: g.chainId,
      chainName: g.chainName,
      area: g.area,
      orders: g.orders,
      ordersLM: g.ordersLM,
      rate: g.rate,
      vehicleType: g.vehicleType,
      revenue,
      revenueLM,
      deltaPct,
      trend,
      drivers: g.driverSet.size,
    });
  }
  out.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
  return out;
}

export interface ChainMixPoint {
  chainId: string | null;
  chainName: string;
  revenue: number;
  orders: number;
  share: number;
}

export async function buildChainMix(tenantId: string, month: Date): Promise<{
  current: ChainMixPoint[];
  trend: { month: string; revenue: number }[];
  concentrationAlert: boolean;
  topChain: ChainMixPoint | null;
}> {
  const rows = await buildRevenueByStore(tenantId, month);
  const byChain = new Map<string, ChainMixPoint>();
  for (const r of rows) {
    const key = r.chainId || `name:${r.chainName}`;
    const existing = byChain.get(key) ?? { chainId: r.chainId, chainName: r.chainName, revenue: 0, orders: 0, share: 0 };
    existing.revenue += r.revenue ?? 0;
    existing.orders += r.orders;
    byChain.set(key, existing);
  }
  const total = Array.from(byChain.values()).reduce((s, v) => s + v.revenue, 0);
  const current = Array.from(byChain.values()).map((c) => ({
    ...c,
    share: total > 0 ? c.revenue / total : 0,
  })).sort((a, b) => b.revenue - a.revenue);

  // 6-month revenue trend
  const trend: { month: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(month.getFullYear(), month.getMonth() - i, 1);
    const monthRows = await prisma.americanaDailyOrders.findMany({
      where: { tenantId, month: m },
      select: { totalOrders: true, chainId: true, position: true },
    });
    const rateMap = await resolveRatesForMonth(tenantId, m);
    let rev = 0;
    for (const o of monthRows) {
      const vt = vehicleTypeOf(o.position);
      const rate = o.chainId ? rateMap.get(`${o.chainId}:${vt}`) ?? 0 : 0;
      rev += (o.totalOrders || 0) * rate;
    }
    trend.push({ month: m.toISOString().slice(0, 7), revenue: rev });
  }

  const topChain = current[0] ?? null;
  const concentrationAlert = topChain != null && topChain.share > 0.6;
  return { current, trend, concentrationAlert, topChain };
}

export interface HeadcountGapRow {
  storeId: string | null;
  storeName: string;
  chainName: string;
  area: string | null;
  trailing30Orders: number;
  targetPerDriverPerDay: number;
  neededDrivers: number;
  currentDrivers: number;
  gap: number;
  vehicleType: "CAR" | "BIKE";
  recommendation: string;
}

export async function buildHeadcountGap(tenantId: string, month: Date): Promise<HeadcountGapRow[]> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const s = (tenant?.settings as any)?.americana?.demandTargetPerDriverPerDay ?? {};
  const targets = { car: s.car ?? 30, bike: s.bike ?? 25 };

  const from = firstOfMonth(month);
  const to = nextMonth(from);
  const trailing30Start = new Date(from.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [orders, stores, assignments] = await Promise.all([
    prisma.americanaDailyOrders.findMany({
      where: { tenantId, month: { gte: trailing30Start, lt: to } },
    }),
    prisma.americanaStore.findMany({ where: { tenantId, active: true }, include: { chain: true } }),
    prisma.americanaStoreAssignment.findMany({
      where: { tenantId, month: from },
    }),
  ]);

  // aggregate orders per store across the trailing 30 days
  const storeOrders = new Map<string, { orders: number; vt: "CAR" | "BIKE" }>();
  for (const o of orders) {
    const key = o.storeId || `name:${o.storeName || "Unknown"}`;
    const vt = vehicleTypeOf(o.position);
    const existing = storeOrders.get(key) ?? { orders: 0, vt };
    existing.orders += o.totalOrders;
    storeOrders.set(key, existing);
  }

  const assignmentCount = new Map<string, number>();
  for (const a of assignments) {
    assignmentCount.set(a.storeId, (assignmentCount.get(a.storeId) ?? 0) + 1);
  }

  const rows: HeadcountGapRow[] = stores.map((s) => {
    const key = s.id;
    const ordersAgg = storeOrders.get(key) ?? { orders: 0, vt: "CAR" as const };
    const vt = ordersAgg.vt;
    const storeTarget = vt === "BIKE" ? s.bikeDailyTarget : s.carDailyTarget;
    const fallback = vt === "BIKE" ? targets.bike : targets.car;
    const target = storeTarget != null && storeTarget > 0 ? storeTarget : fallback;
    const needed = Math.round((ordersAgg.orders / 30) / Math.max(1, target));
    const current = assignmentCount.get(s.id) ?? 0;
    const gap = needed - current;
    let recommendation = "";
    if (gap >= 2) recommendation = `Add ${gap} ${vt === "BIKE" ? "Bike" : "Car"} drivers`;
    else if (gap === 1) recommendation = `Add 1 ${vt === "BIKE" ? "Bike" : "Car"} driver`;
    else if (gap === 0) recommendation = "Balanced";
    else recommendation = `Overstaffed by ${-gap}, consider reassignment`;

    return {
      storeId: s.id,
      storeName: s.name,
      chainName: s.chain.name,
      area: s.area,
      trailing30Orders: ordersAgg.orders,
      targetPerDriverPerDay: target,
      neededDrivers: needed,
      currentDrivers: current,
      gap,
      vehicleType: vt,
      recommendation,
    };
  });
  rows.sort((a, b) => b.gap - a.gap);
  return rows;
}
