/**
 * Revision 20 — the proposed weekly roster.
 *
 * Client note, 2026-09-15: "system should give a proposed plan for each shift
 * weekly, the system should read the past data and arrange the driver shifts
 * accordingly and the ops team should be able to modify and approve the plan".
 *
 * The load-bearing word is "approve". The grid the driver app actually books
 * against is `ShiftCapacity`, and it is written by ONE thing: a human pressing
 * Approve on a plan. A generator that wrote through would have meant bookable
 * capacity moving under drivers' feet every time it ran, which is precisely
 * what asking for an approval step was trying to prevent. So a proposal is a
 * DRAFT that touches nothing, and `approvedDrivers` — the number a planner
 * left in the cell, not the number the machine suggested — is what lands.
 *
 * The method is deliberately simple and deliberately written down on the plan
 * itself (`basis`), because a planner who cannot see why a cell says 4 will
 * overwrite it with a guess. Demand is counted from the same weekday and the
 * same three-hour window over the trailing weeks, divided by what one driver
 * gets through in that window, and floored at the cover the zone needs to be
 * open at all.
 */
import { prisma } from "../config";
import { SHIFT_HOURS, SHIFT_WINDOW_STARTS } from "../routes/agent";

/** How many past weeks the proposal reads. Four is a month of the same weekday. */
export const DEFAULT_LOOKBACK_WEEKS = 4;

/**
 * Orders one driver completes in a three-hour window. Deliberately a constant
 * rather than a measured average: the measured number is dominated by how busy
 * the window was, so feeding it back in makes a quiet zone look efficient and
 * proposes fewer drivers for it, week after week.
 */
export const ORDERS_PER_DRIVER_PER_WINDOW = 6;

/**
 * The floor for a zone Darb serves at all. A window whose demand rounds to
 * zero still needs somebody in it, or the zone is closed and no order ever
 * arrives to prove it should not have been.
 */
export const MIN_COVER = 1;

/** The ceiling, so one freak hour cannot propose the whole fleet into a zone. */
export const MAX_COVER = 20;

/** Sunday 00:00 of the week containing `date`, in the server's own frame. */
export function weekStartOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // 0 = Sunday
  return d;
}

/** "13:00" → 13. */
function hourOf(start: string): number {
  return Number(start.slice(0, 2));
}

/**
 * Which of the eight windows an hour of the day falls in.
 *
 * The windows tile the full 24 hours starting at 01:00, so 00:xx belongs to
 * the 22:00 window that began the previous evening. Getting this wrong loses
 * an hour of demand a night, every night, which is a whole window's worth over
 * a lookback period.
 */
function windowStartForHour(hour: number): string {
  const starts = SHIFT_WINDOW_STARTS.map(hourOf);
  let best = starts[starts.length - 1]!; // 22:00 covers 22, 23, 00
  for (const s of starts) {
    if (hour >= s && hour < s + SHIFT_HOURS) {
      best = s;
      break;
    }
  }
  return `${String(best).padStart(2, "0")}:00`;
}

export interface GenerateResult {
  planId: string;
  weekStart: Date;
  entries: number;
  basis: Record<string, unknown>;
}

/**
 * Build (or rebuild) the DRAFT proposal for a week.
 *
 * Rebuilding replaces the draft wholesale, the same discipline the capacity
 * grid and the delivery-plan rate grids use: a half-written grid is one nothing
 * on screen can describe. An APPROVED plan is never overwritten — regenerating
 * over a week somebody already signed off would silently un-approve it.
 */
export async function generateShiftPlan(params: {
  tenantId: string;
  weekStart: Date;
  lookbackWeeks?: number;
}): Promise<GenerateResult> {
  const { tenantId } = params;
  const weekStart = weekStartOf(params.weekStart);
  const lookbackWeeks = params.lookbackWeeks ?? DEFAULT_LOOKBACK_WEEKS;

  const existing = await prisma.shiftPlan.findFirst({
    where: { tenantId, weekStart },
    select: { id: true, status: true },
  });
  if (existing?.status === "APPROVED") {
    throw Object.assign(new Error("That week has already been approved"), { statusCode: 409 });
  }

  const zones = await prisma.deliveryZone.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
  if (!zones.length) {
    throw Object.assign(new Error("No active zones to plan for"), { statusCode: 400 });
  }

  // ── Past demand ──────────────────────────────────────────────────────────
  const from = new Date(weekStart.getTime() - lookbackWeeks * 7 * 86_400_000);
  const orders = await prisma.deliveryOrder.findMany({
    where: {
      tenantId,
      status: "DELIVERED",
      deliveredAt: { gte: from, lt: weekStart },
      pickupZoneId: { not: null },
      // A practice run is not demand.
      isTraining: false,
    },
    select: { pickupZoneId: true, deliveredAt: true, driverId: true },
  });

  // zoneId|dayOfWeek|startTime -> count
  const demand = new Map<string, number>();
  // The same key -> which drivers actually worked it, and how often.
  const worked = new Map<string, Map<string, number>>();
  for (const o of orders) {
    if (!o.pickupZoneId || !o.deliveredAt) continue;
    const day = o.deliveredAt.getDay();
    const win = windowStartForHour(o.deliveredAt.getHours());
    const key = `${o.pickupZoneId}|${day}|${win}`;
    demand.set(key, (demand.get(key) ?? 0) + 1);
    if (o.driverId) {
      const byDriver = worked.get(key) ?? new Map<string, number>();
      byDriver.set(o.driverId, (byDriver.get(o.driverId) ?? 0) + 1);
      worked.set(key, byDriver);
    }
  }

  // Drivers Darb has actually rostered to each zone. The suggestion list is
  // drawn from these first: a driver assigned to Salmiya is who Salmiya can be
  // staffed with, whatever the history says about a shift they covered once.
  const drivers = await prisma.driver.findMany({
    where: { tenantId, status: "ACTIVE", assignedZoneId: { not: null } },
    select: { id: true, assignedZoneId: true },
  });
  const byZone = new Map<string, string[]>();
  for (const d of drivers) {
    const list = byZone.get(d.assignedZoneId!) ?? [];
    list.push(d.id);
    byZone.set(d.assignedZoneId!, list);
  }

  const basis = {
    lookbackWeeks,
    ordersSampled: orders.length,
    driversAvailable: drivers.length,
    zones: zones.length,
    ordersPerDriverPerWindow: ORDERS_PER_DRIVER_PER_WINDOW,
    method: "same weekday and window over the trailing weeks, averaged, divided by throughput",
    generatedAt: new Date().toISOString(),
  };

  const rows: Array<{
    zoneId: string;
    dayOfWeek: number;
    startTime: string;
    proposedDrivers: number;
    approvedDrivers: number;
    suggestedDriverIds: string[];
    demandOrders: number;
  }> = [];

  for (const zone of zones) {
    const zoneDrivers = byZone.get(zone.id) ?? [];
    for (let day = 0; day < 7; day++) {
      for (const start of SHIFT_WINDOW_STARTS) {
        const key = `${zone.id}|${day}|${start}`;
        const total = demand.get(key) ?? 0;
        const perWeek = total / lookbackWeeks;
        const need = Math.ceil(perWeek / ORDERS_PER_DRIVER_PER_WINDOW);
        const proposed = Math.min(MAX_COVER, Math.max(MIN_COVER, need));

        // Rank the zone's own drivers by how often they have worked THIS
        // window, longest-serving first, and keep as many as the cell needs.
        const history = worked.get(key) ?? new Map<string, number>();
        const suggested = [...zoneDrivers]
          .sort((a, b) => (history.get(b) ?? 0) - (history.get(a) ?? 0))
          .slice(0, proposed);

        rows.push({
          zoneId: zone.id,
          dayOfWeek: day,
          startTime: start,
          proposedDrivers: proposed,
          approvedDrivers: proposed,
          suggestedDriverIds: suggested,
          demandOrders: total,
        });
      }
    }
  }

  const plan = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.shiftPlanEntry.deleteMany({ where: { planId: existing.id } });
      const updated = await tx.shiftPlan.update({
        where: { id: existing.id },
        data: { status: "DRAFT", basis, generatedAt: new Date(), approvedAt: null, approvedById: null },
      });
      await tx.shiftPlanEntry.createMany({
        data: rows.map((r) => ({ ...r, tenantId, planId: updated.id })),
      });
      return updated;
    }
    const created = await tx.shiftPlan.create({
      data: { tenantId, weekStart, status: "DRAFT", basis },
    });
    await tx.shiftPlanEntry.createMany({
      data: rows.map((r) => ({ ...r, tenantId, planId: created.id })),
    });
    return created;
  });

  return { planId: plan.id, weekStart, entries: rows.length, basis };
}

/** One plan with its grid, the zones it covers and the drivers it names. */
export async function getShiftPlan(tenantId: string, weekStart: Date) {
  const plan = await prisma.shiftPlan.findFirst({
    where: { tenantId, weekStart: weekStartOf(weekStart) },
    include: {
      entries: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!plan) return null;

  const [zones, drivers] = await Promise.all([
    prisma.deliveryZone.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, nameAr: true },
      orderBy: { name: "asc" },
    }),
    prisma.driver.findMany({
      where: { tenantId, status: { not: "TERMINATED" } },
      select: { id: true, name: true, driverCode: true, assignedZoneId: true },
    }),
  ]);

  return { plan, zones, drivers, windows: [...SHIFT_WINDOW_STARTS], hours: SHIFT_HOURS };
}

/**
 * Save the planner's edits.
 *
 * Only `approvedDrivers` and `suggestedDriverIds` move: `proposedDrivers` and
 * `demandOrders` are what the machine said, and a grid that lets a human
 * rewrite the machine's own working cannot later explain the difference
 * between the two — which is the only reason to show both.
 */
export async function updateShiftPlanEntries(params: {
  tenantId: string;
  planId: string;
  entries: Array<{
    zoneId: string;
    dayOfWeek: number;
    startTime: string;
    approvedDrivers: number;
    suggestedDriverIds?: string[];
  }>;
}) {
  const plan = await prisma.shiftPlan.findFirst({
    where: { id: params.planId, tenantId: params.tenantId },
    select: { id: true, status: true },
  });
  if (!plan) throw Object.assign(new Error("Plan not found"), { statusCode: 404 });
  if (plan.status !== "DRAFT") {
    throw Object.assign(new Error("Only a draft plan can be edited"), { statusCode: 409 });
  }

  for (const e of params.entries) {
    const n = Math.trunc(e.approvedDrivers);
    if (!Number.isFinite(n) || n < 0 || n > MAX_COVER) {
      throw Object.assign(new Error(`A window takes 0 to ${MAX_COVER} drivers`), { statusCode: 400 });
    }
  }

  await prisma.$transaction(
    params.entries.map((e) =>
      prisma.shiftPlanEntry.updateMany({
        where: {
          tenantId: params.tenantId,
          planId: params.planId,
          zoneId: e.zoneId,
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
        },
        data: {
          approvedDrivers: Math.trunc(e.approvedDrivers),
          ...(e.suggestedDriverIds ? { suggestedDriverIds: e.suggestedDriverIds } : {}),
        },
      }),
    ),
  );
  return getShiftPlanById(params.tenantId, params.planId);
}

export async function getShiftPlanById(tenantId: string, planId: string) {
  return prisma.shiftPlan.findFirst({
    where: { id: planId, tenantId },
    include: { entries: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
  });
}

/**
 * Approve a plan, and write the capacity grid from it.
 *
 * This is the only path that touches `ShiftCapacity`, and it replaces the grid
 * wholesale rather than upserting cell by cell: a per-cell write can drop
 * halfway and leave a week half on the new plan and half on the old, with
 * nothing on screen able to say which half.
 *
 * `0` is written as a real answer and closes a window. That is deliberate and
 * it is the difference between this and a MISSING row, which means "no cap" —
 * an ops team that wants a zone dark on Friday morning must be able to say so.
 */
export async function approveShiftPlan(params: {
  tenantId: string;
  planId: string;
  approvedById: string;
  note?: string | null;
}) {
  const { tenantId, planId } = params;

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.shiftPlan.updateMany({
      where: { id: planId, tenantId, status: "DRAFT" },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedById: params.approvedById,
        note: params.note ?? null,
      },
    });
    if (claimed.count === 0) {
      throw Object.assign(new Error("Only a draft plan can be approved"), { statusCode: 409 });
    }

    const entries = await tx.shiftPlanEntry.findMany({
      where: { tenantId, planId },
      select: { zoneId: true, dayOfWeek: true, startTime: true, approvedDrivers: true },
    });

    await tx.shiftCapacity.deleteMany({ where: { tenantId } });
    if (entries.length) {
      await tx.shiftCapacity.createMany({
        data: entries.map((e) => ({
          tenantId,
          zoneId: e.zoneId,
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          maxDrivers: e.approvedDrivers,
        })),
      });
    }

    return { planId, windows: entries.length };
  });
}

/** Throw the draft away without approving it. */
export async function discardShiftPlan(tenantId: string, planId: string) {
  const claimed = await prisma.shiftPlan.updateMany({
    where: { id: planId, tenantId, status: "DRAFT" },
    data: { status: "DISCARDED" },
  });
  if (claimed.count === 0) {
    throw Object.assign(new Error("Only a draft plan can be discarded"), { statusCode: 409 });
  }
  return { ok: true };
}
