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
import { Prisma } from "../generated/prisma";
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

/**
 * Client note of 2026-10-05: "the drivers are working 12 hours per day so it
 * is not only about orders, also the available number of drivers. We are
 * trying to put enough drivers 24/7, it is managing the timing of duty."
 *
 * So the proposal is built per DUTY, not per window. A driver works one
 * 12-hour duty a day: day duty 07:00 to 19:00, night duty 19:00 to 07:00.
 * Each is four of the three-hour windows, and the night duty that starts on a
 * day runs into the next day's 01:00 and 04:00 windows. A duty is sized for
 * its busiest window and the same number holds across all four, because the
 * people on duty at 07:00 are the people still there at 18:59; sizing window
 * by window had proposed cover that rose and fell every three hours, which no
 * 12-hour roster can staff.
 */
export const DUTY_HOURS = 12;

export const DUTIES = [
  { key: "DAY", starts: ["07:00", "10:00", "13:00", "16:00"], nextDay: [] as string[] },
  { key: "NIGHT", starts: ["19:00", "22:00"], nextDay: ["01:00", "04:00"] },
] as const;

/**
 * The (day, window) cells a duty starting on `day` covers. The night duty's
 * last two windows fall on the following day, and Saturday night wraps to the
 * plan's own Sunday, because the plan is a repeating weekly template.
 */
export function dutyCells(duty: (typeof DUTIES)[number], day: number): Array<{ day: number; start: string }> {
  return [
    ...duty.starts.map((start) => ({ day, start })),
    ...duty.nextDay.map((start) => ({ day: (day + 1) % 7, start })),
  ];
}

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
 * on screen can describe.
 *
 * An APPROVED week is rebuilt only when the caller says so (`replaceApproved`,
 * revision 21c, client note 2026-09-21: "still I can't change the plan, need to
 * be able to reset the plan"). Without the flag it still answers 409, so an
 * older client or a double-click cannot silently un-approve a week somebody
 * signed off. With it, the plan goes back to DRAFT and the proposal is built
 * fresh, and `ShiftCapacity` is NOT touched: the driver app keeps booking
 * against the last approved grid until the new draft is approved in turn.
 * A rebuild that wrote through would be the generator moving bookable
 * capacity under drivers' feet, which is what the approval step exists to
 * prevent.
 */
export async function generateShiftPlan(params: {
  tenantId: string;
  weekStart: Date;
  lookbackWeeks?: number;
  replaceApproved?: boolean;
}): Promise<GenerateResult> {
  const { tenantId } = params;
  const weekStart = weekStartOf(params.weekStart);
  const lookbackWeeks = params.lookbackWeeks ?? DEFAULT_LOOKBACK_WEEKS;

  const existing = await prisma.shiftPlan.findFirst({
    where: { tenantId, weekStart },
    select: { id: true, status: true },
  });
  if (existing?.status === "APPROVED" && !params.replaceApproved) {
    throw Object.assign(new Error("That week has already been approved"), {
      statusCode: 409,
      code: "WEEK_APPROVED",
    });
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
    dutyHours: DUTY_HOURS,
    method:
      "two 12-hour duties a day (07:00 to 19:00 and 19:00 to 07:00), every area covered around the clock, each duty sized for its busiest window over the trailing weeks",
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
      // One duty a day per driver: whoever is suggested for the day duty is
      // offered for the night only once nobody else in the area is left.
      const onDayDuty = new Set<string>();
      for (const duty of DUTIES) {
        const cells = dutyCells(duty, day);
        const needs = cells.map(({ day: d, start }) => {
          const perWeek = (demand.get(`${zone.id}|${d}|${start}`) ?? 0) / lookbackWeeks;
          return Math.ceil(perWeek / ORDERS_PER_DRIVER_PER_WINDOW);
        });
        const proposed = Math.min(MAX_COVER, Math.max(MIN_COVER, ...needs));

        // Rank the area's own drivers by how often they have worked any of
        // this duty's windows, and keep the same people for all twelve hours.
        const history = new Map<string, number>();
        for (const { day: d, start } of cells) {
          for (const [id, n] of worked.get(`${zone.id}|${d}|${start}`) ?? []) {
            history.set(id, (history.get(id) ?? 0) + n);
          }
        }
        const suggested = [...zoneDrivers]
          .sort(
            (a, b) =>
              Number(onDayDuty.has(a)) - Number(onDayDuty.has(b)) ||
              (history.get(b) ?? 0) - (history.get(a) ?? 0),
          )
          .slice(0, proposed);
        if (duty.key === "DAY") suggested.forEach((id) => onDayDuty.add(id));

        for (const { day: d, start } of cells) {
          rows.push({
            zoneId: zone.id,
            dayOfWeek: d,
            startTime: start,
            proposedDrivers: proposed,
            approvedDrivers: proposed,
            suggestedDriverIds: suggested,
            demandOrders: demand.get(`${zone.id}|${d}|${start}`) ?? 0,
          });
        }
      }
    }
  }

  const plan = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.shiftPlanEntry.deleteMany({ where: { planId: existing.id } });
      // Back to DRAFT with the approval cleared: a rebuilt approved week is a
      // proposal again and has to be signed off again before it lands.
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
      select: {
        id: true,
        name: true,
        driverCode: true,
        assignedZoneId: true,
        status: true,
        isFrozen: true,
        inTraining: true,
      },
    }),
  ]);

  // Revision 21 (#2): "put the total number of drivers available". A driver
  // is available to a plan when dispatch would offer to them: ACTIVE, not
  // frozen, not in training. The per-area figure is what a planner compares a
  // cell against; a window asking for four drivers in an area that has two
  // is a window the app can never fill, and nothing on the grid said so.
  const availability = { total: 0, unassigned: 0, byZone: {} as Record<string, number> };
  for (const d of drivers) {
    if (d.status !== "ACTIVE" || d.isFrozen || d.inTraining) continue;
    availability.total += 1;
    if (!d.assignedZoneId) {
      availability.unassigned += 1;
      continue;
    }
    availability.byZone[d.assignedZoneId] = (availability.byZone[d.assignedZoneId] ?? 0) + 1;
  }

  return {
    plan,
    zones,
    drivers,
    availability,
    windows: [...SHIFT_WINDOW_STARTS],
    hours: SHIFT_HOURS,
    dutyHours: DUTY_HOURS,
    duties: DUTIES.map((d) => ({ key: d.key, starts: [...d.starts], nextDay: [...d.nextDay] })),
  };
}

/**
 * Save the planner's edits.
 *
 * Only `approvedDrivers` and `suggestedDriverIds` move: `proposedDrivers` and
 * `demandOrders` are what the machine said, and a grid that lets a human
 * rewrite the machine's own working cannot later explain the difference
 * between the two — which is the only reason to show both.
 *
 * Revision 21b (client note, 2026-09-21): "must give the option to adjust the
 * plan after approving". An APPROVED plan takes edits too, and saving them
 * rewrites the capacity grid in the same transaction, through the same
 * wholesale write approval uses. A DISCARDED plan stays closed. The invariant
 * is unchanged in spirit: the grid is still written only from a plan's
 * `approvedDrivers`, only by a human pressing a button on that plan.
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
  if (plan.status !== "DRAFT" && plan.status !== "APPROVED") {
    throw Object.assign(new Error("A discarded plan cannot be edited"), { statusCode: 409 });
  }

  for (const e of params.entries) {
    const n = Math.trunc(e.approvedDrivers);
    if (!Number.isFinite(n) || n < 0 || n > MAX_COVER) {
      throw Object.assign(new Error(`A window takes 0 to ${MAX_COVER} drivers`), { statusCode: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const e of params.entries) {
      await tx.shiftPlanEntry.updateMany({
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
      });
    }
    // An amended approved week lands on the driver app at once, or the
    // planner has changed a number nobody books against.
    if (plan.status === "APPROVED") {
      await writeCapacityFromPlan(tx, params.tenantId, params.planId);
    }
  });
  return getShiftPlanById(params.tenantId, params.planId);
}

/**
 * The ONE write to `ShiftCapacity`: the grid is replaced wholesale from the
 * plan's `approvedDrivers`. Used by approval and by amending an approved
 * week, so the two can never disagree about what a plan means.
 */
async function writeCapacityFromPlan(
  tx: Prisma.TransactionClient,
  tenantId: string,
  planId: string,
): Promise<number> {
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
  return entries.length;
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

    const windows = await writeCapacityFromPlan(tx, tenantId, planId);
    return { planId, windows };
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
