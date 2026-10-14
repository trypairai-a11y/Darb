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
 * same hour over the trailing weeks, divided by what one driver gets through
 * in an hour, and floored at the cover the zone needs to be open at all.
 * Revision 24 (#3) turned that hourly need into 2, 3 and 4-hour slots placed
 * on the peaks (see `layoutSlots` in services/shiftSlots.ts).
 */
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import {
  DEFAULT_SLOT_MINUTES,
  DUTY_TARGET_MINUTES,
  LEGACY_WINDOW_STARTS,
  SLOT_DURATIONS_MINUTES,
  coverageOf,
  isSlotDuration,
  isSlotStart,
  layoutSlots,
  needPerHour,
  normaliseStart,
  timeOfMinutes,
} from "./shiftSlots";

/** How many past weeks the proposal reads. Four is a month of the same weekday. */
export const DEFAULT_LOOKBACK_WEEKS = 4;

/**
 * Orders one driver completes in an hour. Deliberately a constant rather than
 * a measured average: the measured number is dominated by how busy the hour
 * was, so feeding it back in makes a quiet zone look efficient and proposes
 * fewer drivers for it, week after week. Two an hour is the six per
 * three-hour window the planner has always used.
 */
export const ORDERS_PER_DRIVER_PER_HOUR = 2;

/**
 * The floor for a zone Darb serves at all. An hour whose demand rounds to
 * zero still needs somebody on, or the zone is closed and no order ever
 * arrives to prove it should not have been. Client note of 2026-10-05: "we
 * are trying to put enough drivers 24/7".
 */
export const MIN_COVER = 1;

/** The ceiling, so one freak hour cannot propose the whole fleet into a zone. */
export const MAX_COVER = 20;

/**
 * Revision 24 (#3): a driver's duty is still 12 hours a day, but it is no
 * longer one block. It is several 2, 3 or 4-hour slots stacked (4+4+4,
 * 3+3+2+4 ...). The plan no longer sizes two fixed duties for their busiest
 * window; it lays slots out against the hour-by-hour demand curve so the
 * peaks get more drivers. 12 hours is what turns a day's driver-hours into
 * the number of people an area needs.
 */
export const DUTY_HOURS = DUTY_TARGET_MINUTES / 60;

/** Kuwait is UTC+3 all year. */
const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Weekday and hour of an instant in Kuwait. The driver app's slots are Kuwait
 * times, so demand has to be bucketed in that frame: on a UTC host the server
 * clock puts a 13:00 lunch order in the 10:00 hour.
 */
function kuwaitDayHour(at: Date): { day: number; hour: number } {
  const k = new Date(at.getTime() + KUWAIT_OFFSET_MS);
  return { day: k.getUTCDay(), hour: k.getUTCHours() };
}

/** Sunday 00:00 of the week containing `date`, in the server's own frame. */
export function weekStartOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // 0 = Sunday
  return d;
}

export interface GenerateResult {
  planId: string;
  weekStart: Date;
  entries: number;
  basis: Record<string, unknown>;
}

interface PlanRow {
  zoneId: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  proposedDrivers: number;
  approvedDrivers: number;
  suggestedDriverIds: string[];
  demandOrders: number;
}

/**
 * Suggest who could work each slot of one zone's day, stacking them into
 * duties: a driver already suggested for the slot that ends where this one
 * starts is offered first (that is how 4+4+4 reads as one person's day), no
 * driver is offered two slots that overlap, and nobody is offered more than
 * the 12-hour duty. History breaks ties. Advisory only, as before.
 */
function suggestForDay(
  slots: Array<{ startHour: number; durationHours: number; count: number }>,
  zoneDrivers: string[],
  historyByHour: Array<Map<string, number>>,
): string[][] {
  const held = new Map<string, Array<[number, number]>>();
  const minutes = new Map<string, number>();
  return slots.map((slot) => {
    const from = slot.startHour;
    const to = slot.startHour + slot.durationHours;
    const history = new Map<string, number>();
    for (let h = from; h < to && h < 24; h++) {
      for (const [id, n] of historyByHour[h] ?? []) history.set(id, (history.get(id) ?? 0) + n);
    }
    const free = zoneDrivers.filter((id) => {
      if ((minutes.get(id) ?? 0) + slot.durationHours * 60 > DUTY_TARGET_MINUTES) return false;
      return !(held.get(id) ?? []).some(([a, b]) => a < to && from < b);
    });
    const continues = (id: string) => (held.get(id) ?? []).some(([, b]) => b === from);
    const picked = free
      .sort(
        (a, b) =>
          Number(continues(b)) - Number(continues(a)) ||
          (history.get(b) ?? 0) - (history.get(a) ?? 0),
      )
      .slice(0, slot.count);
    for (const id of picked) {
      held.set(id, [...(held.get(id) ?? []), [from, to]]);
      minutes.set(id, (minutes.get(id) ?? 0) + slot.durationHours * 60);
    }
    return picked;
  });
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
 *
 * Revision 24 (#3): the method. Past deliveries are counted per zone, per
 * weekday, per HOUR (Kuwait time) over the lookback, averaged per week, and
 * turned into drivers needed each hour. `layoutSlots` then places 2, 3 and
 * 4-hour slots so every hour is covered and the busy hours get the extra
 * drivers. The hour-by-hour demand and need travel on `basis` so the planning
 * screen can draw the curve against the planned cover.
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

  // zoneId -> day -> hour -> delivered orders over the lookback
  const counts = new Map<string, number[][]>();
  // zoneId -> day -> hour -> driver -> deliveries, for the suggestions.
  const worked = new Map<string, Array<Array<Map<string, number>>>>();
  const grid = <T,>(make: () => T) => Array.from({ length: 7 }, () => Array.from({ length: 24 }, make));
  for (const o of orders) {
    if (!o.pickupZoneId || !o.deliveredAt) continue;
    const { day, hour } = kuwaitDayHour(o.deliveredAt);
    const c = counts.get(o.pickupZoneId) ?? grid(() => 0);
    c[day]![hour]! += 1;
    counts.set(o.pickupZoneId, c);
    if (o.driverId) {
      const w = worked.get(o.pickupZoneId) ?? grid(() => new Map<string, number>());
      const cell = w[day]![hour]!;
      cell.set(o.driverId, (cell.get(o.driverId) ?? 0) + 1);
      worked.set(o.pickupZoneId, w);
    }
  }

  // Drivers Darb has actually rostered to each zone. The suggestion list is
  // drawn from these: a driver assigned to Salmiya is who Salmiya can be
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

  // Per-week averages and the drivers they call for, kept on the plan so the
  // screen can draw demand against cover without re-reading the orders.
  const demandByHour: Record<string, number[][]> = {};
  const needByHour: Record<string, number[][]> = {};
  const rows: PlanRow[] = [];
  for (const zone of zones) {
    const zoneCounts = counts.get(zone.id) ?? grid(() => 0);
    const zoneWorked = worked.get(zone.id) ?? grid(() => new Map<string, number>());
    demandByHour[zone.id] = [];
    needByHour[zone.id] = [];
    for (let day = 0; day < 7; day++) {
      const avg = zoneCounts[day]!.map((n) => Math.round((n / lookbackWeeks) * 10) / 10);
      const need = needPerHour(
        zoneCounts[day]!.map((n) => n / lookbackWeeks),
        ORDERS_PER_DRIVER_PER_HOUR,
        MIN_COVER,
        MAX_COVER,
      );
      demandByHour[zone.id]!.push(avg);
      needByHour[zone.id]!.push(need);

      const slots = layoutSlots(need);
      const suggestions = suggestForDay(slots, byZone.get(zone.id) ?? [], zoneWorked[day]!);
      slots.forEach((slot, i) => {
        let demandOrders = 0;
        for (let h = slot.startHour; h < slot.startHour + slot.durationHours && h < 24; h++) {
          demandOrders += zoneCounts[day]![h]!;
        }
        rows.push({
          zoneId: zone.id,
          dayOfWeek: day,
          startTime: timeOfMinutes(slot.startHour * 60),
          durationMinutes: slot.durationHours * 60,
          proposedDrivers: slot.count,
          approvedDrivers: slot.count,
          suggestedDriverIds: suggestions[i] ?? [],
          demandOrders,
        });
      });
    }
  }

  const basis = {
    lookbackWeeks,
    ordersSampled: orders.length,
    driversAvailable: drivers.length,
    zones: zones.length,
    ordersPerDriverPerHour: ORDERS_PER_DRIVER_PER_HOUR,
    minCover: MIN_COVER,
    maxCover: MAX_COVER,
    dutyHours: DUTY_HOURS,
    slotHours: SLOT_DURATIONS_MINUTES.map((m) => m / 60),
    method:
      "2, 3 and 4-hour slots laid against the hourly demand of the same weekday over the trailing weeks, so the busy hours get more drivers; every area covered around the clock",
    demandByHour,
    needByHour,
    generatedAt: new Date().toISOString(),
  };

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

/** Drivers on each hour of one zone/day, from a plan's (or the grid's) slots. */
export function plannedCoverage(
  entries: Array<{ startTime: string; durationMinutes?: number | null; approvedDrivers: number }>,
): number[] {
  return coverageOf(
    entries.map((e) => ({
      startHour: Number(e.startTime.slice(0, 2)),
      durationHours: Math.round((e.durationMinutes ?? DEFAULT_SLOT_MINUTES) / 60),
      count: e.approvedDrivers,
    })),
  );
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
    windows: [...LEGACY_WINDOW_STARTS],
    hours: DEFAULT_SLOT_MINUTES / 60,
    dutyHours: DUTY_HOURS,
    // Revision 24 (#3): the lengths a slot may be, for the add-a-slot control.
    slotDurations: [...SLOT_DURATIONS_MINUTES],
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
    approvedDrivers?: number;
    suggestedDriverIds?: string[];
    /** Revision 24 (#3): change a slot's length, or give a new slot one. */
    durationMinutes?: number;
    /** Revision 24 (#3): take the slot out of the plan altogether. */
    remove?: boolean;
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

  const clean = params.entries.map((e) => {
    const startTime = normaliseStart(String(e.startTime ?? ""));
    if (!startTime || !isSlotStart(startTime)) {
      throw Object.assign(new Error("A slot starts on the hour, as HH:00"), { statusCode: 400 });
    }
    const dayOfWeek = Math.trunc(Number(e.dayOfWeek));
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw Object.assign(new Error("dayOfWeek is 0 (Sunday) to 6"), { statusCode: 400 });
    }
    if (e.durationMinutes !== undefined && !isSlotDuration(e.durationMinutes)) {
      throw Object.assign(new Error("A slot is 2, 3 or 4 hours"), { statusCode: 400 });
    }
    let approved: number | undefined;
    if (!e.remove && e.approvedDrivers !== undefined) {
      approved = Math.trunc(Number(e.approvedDrivers));
      if (!Number.isFinite(approved) || approved < 0 || approved > MAX_COVER) {
        throw Object.assign(new Error(`A slot takes 0 to ${MAX_COVER} drivers`), { statusCode: 400 });
      }
    }
    return { ...e, startTime, dayOfWeek, approved };
  });

  await prisma.$transaction(async (tx) => {
    for (const e of clean) {
      const where = {
        tenantId: params.tenantId,
        planId: params.planId,
        zoneId: e.zoneId,
        dayOfWeek: e.dayOfWeek,
        startTime: e.startTime,
      };
      if (e.remove) {
        await tx.shiftPlanEntry.deleteMany({ where });
        continue;
      }
      const updated = await tx.shiftPlanEntry.updateMany({
        where,
        data: {
          ...(e.approved !== undefined ? { approvedDrivers: e.approved } : {}),
          ...(e.durationMinutes !== undefined ? { durationMinutes: Number(e.durationMinutes) } : {}),
          ...(e.suggestedDriverIds ? { suggestedDriverIds: e.suggestedDriverIds } : {}),
        },
      });
      // A slot the planner added by hand. The machine proposed nothing for
      // it, and proposedDrivers 0 says so on screen.
      if (updated.count === 0) {
        await tx.shiftPlanEntry.create({
          data: {
            ...where,
            durationMinutes: e.durationMinutes !== undefined ? Number(e.durationMinutes) : DEFAULT_SLOT_MINUTES,
            proposedDrivers: 0,
            approvedDrivers: e.approved ?? 0,
            suggestedDriverIds: e.suggestedDriverIds ?? [],
            demandOrders: 0,
          },
        });
      }
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
    select: { zoneId: true, dayOfWeek: true, startTime: true, approvedDrivers: true, durationMinutes: true },
  });

  await tx.shiftCapacity.deleteMany({ where: { tenantId } });
  if (entries.length) {
    await tx.shiftCapacity.createMany({
      data: entries.map((e) => ({
        tenantId,
        zoneId: e.zoneId,
        dayOfWeek: e.dayOfWeek,
        startTime: e.startTime,
        // Revision 24 (#3): the slot's length travels with its cap. An entry
        // from before slots came in has none and is the 3h window it was.
        durationMinutes: e.durationMinutes ?? DEFAULT_SLOT_MINUTES,
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
