// Phase 2 Wave 4 — billing service.
//
// REQ-pricing-model + CON-pricing-model.
//
// Three exports:
//   - computeMonthlyBill({tenantId, yearMonth}) -> MonthlyBill
//   - listMonthlyBillsAcrossTenants(yearMonth) -> MonthlyBill[]
//   - isCourierActiveThisMonth(tenantId, driverId, yearMonth) -> boolean
//
// Math (per orchestrator decision #7 + Wave 0 RED tests):
//   - "Active courier" = a Driver who worked at least 240 minutes (4h) on one
//     day of the billing month, summed over that day's shifts (revision 24
//     #3: a day is several 2, 3 or 4-hour slots now).
//   - Standard amount = activeCouriers × KD 2.000
//   - Floor = KD 200.000 (max(standard, floor))
//   - Override = Tenant.monthlyOverrideKd (when set, beats both — design
//     partner pricing). Override is per-tenant; never leaks across tenants
//     (overrideIsolation.test.ts pins this — the Tenant.findFirst lookup
//     uses where:{id:tenantId} so each call only ever sees one tenant's row).
//
// Tenant lookup uses prisma.tenant.findFirst (not findUnique) so the Wave 0
// test mock — which spreads `(prisma as any).tenant = { findFirst: jest.fn()
// .mockResolvedValue({...}) }` — exercises this code path. The Wave 0
// shift mock uses prisma.shift.findMany; we group rows in memory rather
// than calling groupBy to keep the mock surface small.

import { prisma } from "../../config";

const PRICE_PER_COURIER_KD = 2.0;
const FLOOR_KD = 200.0;
const ACTIVE_HOURS_THRESHOLD_MINUTES = 240; // 4 hours

export interface MonthlyBill {
  tenantId: string;
  tenantName?: string;
  yearMonth: string; // "YYYY-MM"
  activeCouriers: number;
  computedKd: number; // max(activeCouriers × 2, 200)
  override: number | null; // monthlyOverrideKd, or null
  netKd: number; // override ?? computedKd
  designPartner: boolean;
  trialEndsAt: Date | null;
}

interface ComputeArgs {
  tenantId: string;
  yearMonth: string; // "YYYY-MM"
}

/** Kuwait is UTC+3 all year (no DST). */
const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Parse "YYYY-MM" into a {start, end} range (start inclusive, end exclusive)
 * on Kuwait month boundaries. Shift.date is stored as Kuwait midnight
 * (21:00 UTC the day before), so a UTC range dropped the 1st of the month
 * into the previous month's bill.
 */
function monthBounds(yearMonth: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    throw new Error(
      `computeMonthlyBill: yearMonth must be "YYYY-MM" (got "${yearMonth}")`,
    );
  }
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1; // 0..11
  const start = new Date(Date.UTC(year, monthIdx, 1) - KUWAIT_OFFSET_MS);
  const end = new Date(Date.UTC(year, monthIdx + 1, 1) - KUWAIT_OFFSET_MS);
  return { start, end };
}

/**
 * Returns true if the driver had at least one shift with
 * actualHoursMinutes >= 240 in the given month.
 */
export async function isCourierActiveThisMonth(
  tenantId: string,
  driverId: string,
  yearMonth: string,
): Promise<boolean> {
  const { start, end } = monthBounds(yearMonth);
  // Revision 24 (#3): a day is several 2, 3 or 4-hour slots, so "a shift of
  // four hours" became "four hours worked on one day". A driver on 3+3+2+4
  // never has a single slot past the threshold and would otherwise never
  // count as active at all.
  const rows = await prisma.shift.findMany({
    where: {
      tenantId,
      driverId,
      date: { gte: start, lt: end },
      actualHoursMinutes: { gt: 0 },
    },
    select: { date: true, actualHoursMinutes: true },
  });
  const byDay = new Map<string, number>();
  for (const r of rows ?? []) {
    const key = r.date ? new Date(r.date).toISOString().slice(0, 10) : "";
    byDay.set(key, (byDay.get(key) ?? 0) + (r.actualHoursMinutes ?? 0));
  }
  return [...byDay.values()].some((m) => m >= ACTIVE_HOURS_THRESHOLD_MINUTES);
}

/**
 * Compute the monthly bill for one tenant. Override always wins.
 */
export async function computeMonthlyBill(args: ComputeArgs): Promise<MonthlyBill> {
  const { tenantId, yearMonth } = args;
  const { start, end } = monthBounds(yearMonth);

  // Tenant lookup. Override + designPartner + trialEndsAt all live here.
  const tenant = await (prisma as unknown as {
    tenant: {
      findFirst: (args: unknown) => Promise<{
        id: string;
        name?: string;
        designPartner?: boolean | null;
        monthlyOverrideKd?: number | string | { toNumber?: () => number } | null;
        trialEndsAt?: Date | null;
      } | null>;
    };
  }).tenant.findFirst({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      designPartner: true,
      monthlyOverrideKd: true,
      trialEndsAt: true,
    },
  });

  if (!tenant) {
    throw new Error(`computeMonthlyBill: tenant not found (${tenantId})`);
  }

  // Active-courier count. We pull the qualifying shifts and unique-driver
  // them in memory — keeps the Wave 0 mock pattern (`shift.findMany.mock
  // ResolvedValue([rows])`) working without forcing the test to also stub
  // a groupBy delegate.
  //
  // NB: we also re-filter in memory by actualHoursMinutes >= 240 + tenantId.
  // The Prisma where clause already filters at the DB layer in production;
  // the in-memory pass is a belt-and-suspenders guard for the test mocks
  // (which return the seeded rows regardless of the where arg) and is also
  // a useful defence against accidental cross-tenant leakage if a future
  // refactor weakens the where clause.
  const shifts = (await prisma.shift.findMany({
    where: {
      tenantId,
      date: { gte: start, lt: end },
      // Revision 24 (#3): every worked slot is read and the threshold is
      // applied to a driver's DAY, because a 12-hour duty is now several
      // 2, 3 or 4-hour slots and one of them alone may sit under four hours.
      actualHoursMinutes: { gt: 0 },
    },
    select: { driverId: true, actualHoursMinutes: true, tenantId: true, date: true },
  })) as Array<{
    driverId: string | null;
    actualHoursMinutes?: number | null;
    tenantId?: string | null;
    date?: Date | string | null;
  }>;

  const minutesByDriverDay = new Map<string, { driverId: string; minutes: number }>();
  for (const s of shifts) {
    if (!s.driverId) continue;
    if (s.tenantId != null && s.tenantId !== tenantId) continue;
    const day = s.date ? new Date(s.date).toISOString().slice(0, 10) : "";
    const key = `${s.driverId}|${day}`;
    const entry = minutesByDriverDay.get(key) ?? { driverId: s.driverId, minutes: 0 };
    entry.minutes += s.actualHoursMinutes ?? 0;
    minutesByDriverDay.set(key, entry);
  }
  const driverIds = new Set<string>();
  for (const { driverId, minutes } of minutesByDriverDay.values()) {
    if (minutes >= ACTIVE_HOURS_THRESHOLD_MINUTES) driverIds.add(driverId);
  }
  const activeCouriers = driverIds.size;

  const standardKd = activeCouriers * PRICE_PER_COURIER_KD;
  const computedKd = Math.max(standardKd, FLOOR_KD);

  // monthlyOverrideKd may arrive as a Decimal (real Prisma) or a plain
  // number (test mocks). Decimal carries `.toNumber()`; plain numbers
  // pass through `Number(...)` cleanly. null/undefined → no override.
  const overrideRaw = tenant.monthlyOverrideKd;
  let override: number | null;
  if (overrideRaw == null) {
    override = null;
  } else if (typeof overrideRaw === "object" && typeof (overrideRaw as { toNumber?: () => number }).toNumber === "function") {
    override = (overrideRaw as { toNumber: () => number }).toNumber();
  } else {
    const n = Number(overrideRaw);
    override = Number.isFinite(n) ? n : null;
  }

  const netKd = override ?? computedKd;

  return {
    tenantId,
    tenantName: tenant.name,
    yearMonth,
    activeCouriers,
    computedKd,
    override,
    netKd,
    designPartner: tenant.designPartner === true,
    trialEndsAt: tenant.trialEndsAt ?? null,
  };
}

/**
 * Compute monthly bills for every tenant. Used by the admin /tenants list
 * (founder dashboard).
 */
export async function listMonthlyBillsAcrossTenants(
  yearMonth: string,
): Promise<MonthlyBill[]> {
  const tenants = await (prisma as unknown as {
    tenant: {
      findMany: (args: unknown) => Promise<Array<{ id: string }>>;
    };
  }).tenant.findMany({
    select: { id: true },
  });

  const bills = await Promise.all(
    tenants.map((t) => computeMonthlyBill({ tenantId: t.id, yearMonth })),
  );
  return bills;
}

/**
 * Sum the net amounts across a list of bills. Convenience for the founder
 * dashboard's MRR tile.
 */
export function sumNetKd(bills: MonthlyBill[]): number {
  return bills.reduce((acc, b) => acc + b.netKd, 0);
}

export const billingConstants = {
  PRICE_PER_COURIER_KD,
  FLOOR_KD,
  ACTIVE_HOURS_THRESHOLD_MINUTES,
};
