/**
 * Revision 24 (#8 to #11) — private shifts.
 *
 * The life of one:
 *
 *   PROPOSED     the system placed it on a plan (admin or shop asked for N
 *                shifts at a branch on a day); the asker adjusts the times.
 *   OPEN         the plan was confirmed; eligible drivers with the right
 *                vehicle can book it in the app.
 *   BOOKED       a driver holds it. From its start time dispatch keeps that
 *                driver off every other shop's orders.
 *   IN_PROGRESS  the driver pressed Start standing at the shop (geofenced).
 *                Dispatch puts them first for that branch's orders.
 *   COMPLETED    ended by the driver, or by the sweep at its end time. The
 *                settlement (billable minutes, shop charge, company pay) is
 *                snapshotted on the row with one deduction row per reason.
 *   CANCELLED    withdrawn before it started, or never booked by its end.
 *
 * Every status move is a status-guarded updateMany, count 0 = 409, the same
 * discipline as the order FSM. The settlement maths is in
 * privateShiftBilling.ts and is pure; this file loads rows and writes them.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import {
  GEOFENCE_METERS,
  computePrivateShiftSettlement,
  liveStateOf,
  type LocationPing,
  type Settlement,
  type ShiftOrder,
} from "./privateShiftBilling";
import { haversineMeters } from "../../utils/geo";
import {
  MAX_SHIFTS_PER_PLAN,
  MAX_SHIFT_HOURS,
  MIN_SHIFT_HOURS,
  isIsoDate,
  kuwaitDateOf,
  kuwaitDayOfWeek,
  kuwaitHourOf,
  kuwaitInstant,
  proposeShiftStarts,
} from "./privateShiftProposal";

export const VEHICLE_TYPES = ["MOTORCYCLE", "CAR"] as const;
export type VehicleTypeValue = (typeof VEHICLE_TYPES)[number];
export function isVehicleType(v: unknown): v is VehicleTypeValue {
  return typeof v === "string" && (VEHICLE_TYPES as readonly string[]).includes(v);
}

/** Past weeks the proposal reads. */
export const LOOKBACK_WEEKS = 4;
/** How far ahead a private shift can be planned. */
export const PLAN_HORIZON_DAYS = 14;
/** A driver may press Start this early. */
export const EARLY_START_MIN = 15;

const MIN = 60_000;

export class PrivateShiftError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  new PrivateShiftError(status, code, message, extra);

const money = (v: Prisma.Decimal | null | undefined) => (v == null ? null : Number(v).toFixed(3));
const num = (v: unknown) => (v == null ? null : Number(v));

function minutesOfHhmm(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v)) return null;
  const [h, m] = v.split(":").map(Number) as [number, number];
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
function todayKuwait(now = new Date()): string {
  return kuwaitDateOf(now);
}

// ─── Scope: who is asking ───────────────────────────────────────────────────

export type Scope =
  | { kind: "STAFF" }
  | { kind: "VENDOR"; vendorId: string; branchId?: string | null }
  | { kind: "FLEET"; fleetPartnerId: string };

function scopeWhere(scope: Scope): Prisma.PrivateShiftWhereInput {
  if (scope.kind === "VENDOR") {
    return { vendorId: scope.vendorId, ...(scope.branchId ? { branchId: scope.branchId } : {}) };
  }
  if (scope.kind === "FLEET") return { fleetPartnerId: scope.fleetPartnerId };
  return {};
}

// ─── Demand and the proposal ────────────────────────────────────────────────

/**
 * Orders by Kuwait hour at one branch, averaged per day. The same weekday
 * over the lookback when there is enough of it (a Friday is not a Tuesday),
 * every day of the lookback when there is not.
 */
export async function loadHourlyDemand(tenantId: string, branchId: string, date: string) {
  const dayStart = kuwaitInstant(date, 0);
  const from = new Date(dayStart.getTime() - LOOKBACK_WEEKS * 7 * 1440 * MIN);
  const rows = await prisma.deliveryOrder.findMany({
    where: { tenantId, branchId, isTraining: false, createdAt: { gte: from, lt: dayStart } },
    select: { createdAt: true },
  });
  const weekday = kuwaitDayOfWeek(dayStart);
  const sameDay = rows.filter((r) => kuwaitDayOfWeek(r.createdAt) === weekday);
  const useSameDay = sameDay.length >= 10;
  const sample = useSameDay ? sameDay : rows;
  const days = useSameDay ? LOOKBACK_WEEKS : LOOKBACK_WEEKS * 7;
  const hourly = new Array<number>(24).fill(0);
  for (const r of sample) hourly[kuwaitHourOf(r.createdAt)]! += 1;
  return {
    hourly: hourly.map((n) => Math.round((n / days) * 100) / 100),
    ordersSampled: sample.length,
    sameWeekday: useSameDay,
    lookbackWeeks: LOOKBACK_WEEKS,
  };
}

async function assertBranch(tenantId: string, vendorId: string, branchId: string) {
  const branch = await prisma.vendorBranch.findFirst({
    where: { id: branchId, tenantId, vendorId },
    select: { id: true, name: true, lat: true, lng: true },
  });
  if (!branch) throw fail(404, "BRANCH_NOT_FOUND", "Branch not found for this shop");
  return branch;
}

export async function createPrivateShiftPlan(params: {
  tenantId: string;
  vendorId: string;
  branchId: string;
  vehicleType: unknown;
  date: unknown;
  count: unknown;
  hours: unknown;
  source: "ADMIN" | "VENDOR";
  createdById?: string | null;
  now?: Date;
}) {
  const { tenantId, vendorId, branchId } = params;
  if (!isVehicleType(params.vehicleType)) throw fail(400, "BAD_VEHICLE", "Choose a vehicle type");
  if (!isIsoDate(params.date)) throw fail(400, "BAD_DATE", "A date is required, as YYYY-MM-DD");
  const count = Math.trunc(Number(params.count));
  if (!Number.isFinite(count) || count < 1 || count > MAX_SHIFTS_PER_PLAN) {
    throw fail(400, "BAD_COUNT", `Ask for 1 to ${MAX_SHIFTS_PER_PLAN} shifts`);
  }
  const hours = Math.trunc(Number(params.hours ?? 4));
  if (!Number.isFinite(hours) || hours < MIN_SHIFT_HOURS || hours > MAX_SHIFT_HOURS) {
    throw fail(400, "BAD_HOURS", `A private shift is ${MIN_SHIFT_HOURS} to ${MAX_SHIFT_HOURS} hours`);
  }
  const date = params.date;
  const today = todayKuwait(params.now);
  if (date < today) throw fail(400, "DATE_PAST", "That day has already passed");
  const horizon = kuwaitDateOf(new Date((params.now ?? new Date()).getTime() + PLAN_HORIZON_DAYS * 1440 * MIN));
  if (date > horizon) throw fail(400, "DATE_TOO_FAR", `Private shifts can be planned ${PLAN_HORIZON_DAYS} days ahead`);

  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, tenantId },
    select: { id: true, suitableVehicleTypes: true },
  });
  if (!vendor) throw fail(404, "VENDOR_NOT_FOUND", "Shop not found");
  if (!vendor.suitableVehicleTypes.includes(params.vehicleType)) {
    throw fail(409, "VEHICLE_NOT_SUITABLE", "That vehicle type is not ticked as suitable for this shop");
  }
  await assertBranch(tenantId, vendorId, branchId);

  const demand = await loadHourlyDemand(tenantId, branchId, date);
  const starts = proposeShiftStarts({ hourlyDemand: demand.hourly, count, hours });
  const basis = {
    ...demand,
    method: "each shift placed where the most uncovered orders are, from this branch's own orders by hour",
    usedDefaultProfile: demand.ordersSampled === 0,
  };

  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.privateShiftPlan.create({
      data: {
        tenantId,
        vendorId,
        branchId,
        vehicleType: params.vehicleType as VehicleTypeValue,
        date,
        requestedShifts: count,
        shiftHours: hours,
        source: params.source,
        status: "DRAFT",
        basis,
        createdById: params.createdById ?? null,
      },
    });
    await tx.privateShift.createMany({
      data: starts.map((h) => ({
        tenantId,
        planId: created.id,
        vendorId,
        branchId,
        vehicleType: params.vehicleType as VehicleTypeValue,
        date,
        startAt: kuwaitInstant(date, h * 60),
        endAt: kuwaitInstant(date, (h + hours) * 60),
        status: "PROPOSED" as const,
        source: params.source,
      })),
    });
    return created;
  });
  return getPrivateShiftPlan(tenantId, plan.id, params.source === "VENDOR" ? { kind: "VENDOR", vendorId } : { kind: "STAFF" });
}

export async function getPrivateShiftPlan(tenantId: string, planId: string, scope: Scope) {
  const plan = await prisma.privateShiftPlan.findFirst({
    where: {
      id: planId,
      tenantId,
      ...(scope.kind === "VENDOR" ? { vendorId: scope.vendorId } : {}),
    },
    include: { shifts: { orderBy: { startAt: "asc" } } },
  });
  if (!plan) throw fail(404, "PLAN_NOT_FOUND", "Plan not found");
  const shifts = await decorate(tenantId, plan.shifts.filter((s) => s.status !== "CANCELLED"));
  return { ...plan, shifts };
}

/**
 * The asker's adjustments: the whole set of proposed shifts, replaced
 * wholesale, the same discipline as the rate grids. Times are Kuwait "HH:mm"
 * on the plan's day; a shift may run past midnight.
 */
export async function updatePrivateShiftPlan(params: {
  tenantId: string;
  planId: string;
  scope: Scope;
  shifts: Array<{ startTime: unknown; hours: unknown }>;
}) {
  const plan = await prisma.privateShiftPlan.findFirst({
    where: {
      id: params.planId,
      tenantId: params.tenantId,
      ...(params.scope.kind === "VENDOR" ? { vendorId: params.scope.vendorId } : {}),
    },
  });
  if (!plan) throw fail(404, "PLAN_NOT_FOUND", "Plan not found");
  if (plan.status !== "DRAFT") throw fail(409, "PLAN_NOT_DRAFT", "Only a plan that is not confirmed yet can be adjusted");
  if (!Array.isArray(params.shifts) || params.shifts.length < 1 || params.shifts.length > MAX_SHIFTS_PER_PLAN) {
    throw fail(400, "BAD_COUNT", `A plan has 1 to ${MAX_SHIFTS_PER_PLAN} shifts`);
  }
  const rows = params.shifts.map((s) => {
    const start = minutesOfHhmm(s.startTime);
    const hours = Math.trunc(Number(s.hours));
    if (start == null) throw fail(400, "BAD_TIME", "Each shift needs a start time, as HH:MM");
    if (!Number.isFinite(hours) || hours < MIN_SHIFT_HOURS || hours > MAX_SHIFT_HOURS) {
      throw fail(400, "BAD_HOURS", `A private shift is ${MIN_SHIFT_HOURS} to ${MAX_SHIFT_HOURS} hours`);
    }
    return { startAt: kuwaitInstant(plan.date, start), endAt: kuwaitInstant(plan.date, start + hours * 60) };
  });

  await prisma.$transaction(async (tx) => {
    await tx.privateShift.deleteMany({ where: { tenantId: params.tenantId, planId: plan.id, status: "PROPOSED" } });
    await tx.privateShift.createMany({
      data: rows.map((r) => ({
        tenantId: params.tenantId,
        planId: plan.id,
        vendorId: plan.vendorId,
        branchId: plan.branchId,
        vehicleType: plan.vehicleType,
        date: plan.date,
        startAt: r.startAt,
        endAt: r.endAt,
        status: "PROPOSED" as const,
        source: plan.source,
      })),
    });
    await tx.privateShiftPlan.update({ where: { id: plan.id }, data: { requestedShifts: rows.length } });
  });
  return getPrivateShiftPlan(params.tenantId, plan.id, params.scope);
}

/** Confirming opens the shifts to drivers. */
export async function confirmPrivateShiftPlan(tenantId: string, planId: string, scope: Scope) {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.privateShiftPlan.updateMany({
      where: {
        id: planId,
        tenantId,
        status: "DRAFT",
        ...(scope.kind === "VENDOR" ? { vendorId: scope.vendorId } : {}),
      },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    if (claimed.count === 0) throw fail(409, "PLAN_NOT_DRAFT", "Only a plan that is not confirmed yet can be confirmed");
    await tx.privateShift.updateMany({
      where: { tenantId, planId, status: "PROPOSED" },
      data: { status: "OPEN" },
    });
  });
  return getPrivateShiftPlan(tenantId, planId, scope);
}

export async function discardPrivateShiftPlan(tenantId: string, planId: string, scope: Scope) {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.privateShiftPlan.updateMany({
      where: {
        id: planId,
        tenantId,
        status: "DRAFT",
        ...(scope.kind === "VENDOR" ? { vendorId: scope.vendorId } : {}),
      },
      data: { status: "CANCELLED" },
    });
    if (claimed.count === 0) throw fail(409, "PLAN_NOT_DRAFT", "Only a plan that is not confirmed yet can be discarded");
    await tx.privateShift.updateMany({
      where: { tenantId, planId, status: "PROPOSED" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "PLAN_DISCARDED" },
    });
  });
  return { ok: true };
}

// ─── Reading shifts ─────────────────────────────────────────────────────────

type ShiftRow = Prisma.PrivateShiftGetPayload<Record<string, never>>;

/** Names for the ids the table stores as plain columns. */
async function decorate(tenantId: string, shifts: ShiftRow[]) {
  const ids = (key: "vendorId" | "branchId" | "driverId" | "fleetPartnerId") =>
    [...new Set(shifts.map((s) => s[key]).filter((v): v is string => !!v))];
  const [vendors, branches, drivers, fleets] = await Promise.all([
    ids("vendorId").length
      ? prisma.vendor.findMany({ where: { tenantId, id: { in: ids("vendorId") } }, select: { id: true, name: true, nameAr: true } })
      : [],
    ids("branchId").length
      ? prisma.vendorBranch.findMany({ where: { tenantId, id: { in: ids("branchId") } }, select: { id: true, name: true, nameAr: true } })
      : [],
    ids("driverId").length
      ? prisma.driver.findMany({ where: { tenantId, id: { in: ids("driverId") } }, select: { id: true, name: true, driverCode: true, phone: true } })
      : [],
    ids("fleetPartnerId").length
      ? prisma.fleetPartner.findMany({ where: { tenantId, id: { in: ids("fleetPartnerId") } }, select: { id: true, name: true } })
      : [],
  ]);
  const by = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const v = by(vendors), b = by(branches), d = by(drivers), f = by(fleets);
  return shifts.map((s) => serializeShift(s, {
    vendor: v.get(s.vendorId) ?? null,
    branch: b.get(s.branchId) ?? null,
    driver: s.driverId ? (d.get(s.driverId) ?? null) : null,
    fleetPartner: s.fleetPartnerId ? (f.get(s.fleetPartnerId) ?? null) : null,
  }));
}

export function serializeShift(s: ShiftRow, joins: Record<string, unknown> = {}) {
  return {
    id: s.id,
    planId: s.planId,
    vendorId: s.vendorId,
    branchId: s.branchId,
    vehicleType: s.vehicleType,
    date: s.date,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    status: s.status,
    source: s.source,
    driverId: s.driverId,
    fleetPartnerId: s.fleetPartnerId,
    bookedAt: s.bookedAt?.toISOString() ?? null,
    startedAt: s.startedAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
    cancelledAt: s.cancelledAt?.toISOString() ?? null,
    cancelReason: s.cancelReason,
    scheduledMinutes: s.scheduledMinutes,
    lateDeductionMinutes: s.lateDeductionMinutes,
    awayDeductionMinutes: s.awayDeductionMinutes,
    billableMinutes: s.billableMinutes,
    vendorHourlyKwd: money(s.vendorHourlyKwd),
    fleetHourlyKwd: money(s.fleetHourlyKwd),
    vendorChargeKwd: money(s.vendorChargeKwd),
    fleetPayKwd: money(s.fleetPayKwd),
    settledAt: s.settledAt?.toISOString() ?? null,
    vendor: null as unknown,
    branch: null as unknown,
    driver: null as unknown,
    fleetPartner: null as unknown,
    ...joins,
  };
}

export async function listPrivateShifts(params: {
  tenantId: string;
  scope: Scope;
  from?: string;
  to?: string;
  vendorId?: string;
  status?: string;
}) {
  const where: Prisma.PrivateShiftWhereInput = {
    tenantId: params.tenantId,
    ...scopeWhere(params.scope),
    status: { not: "PROPOSED" },
  };
  if (params.vendorId && params.scope.kind === "STAFF") where.vendorId = params.vendorId;
  if (params.from || params.to) {
    where.date = {
      ...(params.from && isIsoDate(params.from) ? { gte: params.from } : {}),
      ...(params.to && isIsoDate(params.to) ? { lte: params.to } : {}),
    };
  }
  if (params.status && params.status !== "ALL") where.status = params.status as never;
  const rows = await prisma.privateShift.findMany({ where, orderBy: { startAt: "asc" }, take: 500 });
  const data = await decorate(params.tenantId, rows);

  // Draft plans waiting on their asker, so neither side loses one.
  const drafts = await prisma.privateShiftPlan.findMany({
    where: {
      tenantId: params.tenantId,
      status: "DRAFT",
      ...(params.scope.kind === "VENDOR" ? { vendorId: params.scope.vendorId } : {}),
      ...(params.scope.kind === "FLEET" ? { id: "__none__" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, vendorId: true, branchId: true, date: true, vehicleType: true, requestedShifts: true, source: true, createdAt: true },
  });
  return { data, drafts };
}

/** One shift with its money: the snapshot once settled, a live preview before. */
export async function getPrivateShiftDetail(tenantId: string, id: string, scope: Scope, now = new Date()) {
  const shift = await prisma.privateShift.findFirst({
    where: { id, tenantId, ...scopeWhere(scope) },
    include: { deductions: { orderBy: { createdAt: "asc" } } },
  });
  if (!shift) throw fail(404, "SHIFT_NOT_FOUND", "Private shift not found");
  const [decorated] = await decorate(tenantId, [shift]);
  const live = shift.status === "COMPLETED" ? null : await computeForShift(shift, now).catch(() => null);
  const orders = shift.driverId && shift.startedAt
    ? await prisma.deliveryOrder.findMany({
        where: {
          tenantId,
          driverId: shift.driverId,
          branchId: shift.branchId,
          assignedAt: { gte: shift.startedAt, lt: shift.endedAt ?? shift.endAt },
        },
        select: { id: true, orderNumber: true, status: true, assignedAt: true, deliveredAt: true, slaDeadline: true },
        orderBy: { assignedAt: "asc" },
      })
    : [];
  const delivered = orders.filter((o) => o.deliveredAt);
  const onTime = delivered.filter((o) => !o.slaDeadline || o.deliveredAt! <= o.slaDeadline);
  return {
    ...decorated,
    deductions: shift.deductions.map((d) => ({
      id: d.id,
      kind: d.kind,
      minutes: d.minutes,
      orderId: d.orderId,
      fromAt: d.fromAt?.toISOString() ?? null,
      toAt: d.toAt?.toISOString() ?? null,
    })),
    preview: live ? previewOf(live.settlement, live.rates) : null,
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      assignedAt: o.assignedAt?.toISOString() ?? null,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      slaDeadline: o.slaDeadline?.toISOString() ?? null,
    })),
    kpis: {
      delivered: delivered.length,
      onTime: onTime.length,
      onTimeRate: delivered.length ? Math.round((onTime.length / delivered.length) * 100) : null,
    },
  };
}

function previewOf(s: Settlement, rates: { vendorHourlyKwd: Prisma.Decimal | null; fleetHourlyKwd: Prisma.Decimal | null }) {
  return {
    scheduledMinutes: s.scheduledMinutes,
    lateStartMinutes: s.lateStartMinutes,
    lateOrderMinutes: s.lateOrderMinutes,
    awayMinutes: s.awayMinutes,
    earlyEndMinutes: s.earlyEndMinutes,
    deductedMinutes: s.deductedMinutes,
    billableMinutes: s.billableMinutes,
    vendorHourlyKwd: money(rates.vendorHourlyKwd),
    fleetHourlyKwd: money(rates.fleetHourlyKwd),
    vendorChargeKwd: s.vendorChargeKwd,
    fleetPayKwd: s.fleetPayKwd,
    deductions: s.deductions.map((d) => ({
      kind: d.kind,
      minutes: d.minutes,
      orderId: d.orderId ?? null,
      fromAt: d.fromAt?.toISOString() ?? null,
      toAt: d.toAt?.toISOString() ?? null,
    })),
  };
}

export async function cancelPrivateShift(tenantId: string, id: string, scope: Scope, reason?: string | null) {
  const claimed = await prisma.privateShift.updateMany({
    where: { id, tenantId, ...scopeWhere(scope), status: { in: ["PROPOSED", "OPEN", "BOOKED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason?.trim() || "CANCELLED" },
  });
  if (claimed.count === 0) throw fail(409, "NOT_CANCELLABLE", "Only a shift that has not started can be cancelled");
  return { ok: true };
}

// ─── Rates ──────────────────────────────────────────────────────────────────

async function ratesFor(shift: { tenantId: string; vendorId: string; vehicleType: VehicleTypeValue; fleetPartnerId: string | null }) {
  const [vendorPlan, fleetRate] = await Promise.all([
    prisma.vendorVehiclePlan.findFirst({
      where: { tenantId: shift.tenantId, vendorId: shift.vendorId, vehicleType: shift.vehicleType },
      select: { perHourKwd: true },
    }),
    shift.fleetPartnerId
      ? prisma.fleetVehicleRate.findFirst({
          where: { tenantId: shift.tenantId, fleetPartnerId: shift.fleetPartnerId, vehicleType: shift.vehicleType },
          select: { perHourKwd: true },
        })
      : null,
  ]);
  return { vendorHourlyKwd: vendorPlan?.perHourKwd ?? null, fleetHourlyKwd: fleetRate?.perHourKwd ?? null };
}

// ─── Settlement ─────────────────────────────────────────────────────────────

async function inputsFor(shift: ShiftRow, until: Date) {
  const branch = await prisma.vendorBranch.findFirst({
    where: { id: shift.branchId, tenantId: shift.tenantId },
    select: { lat: true, lng: true },
  });
  const vendor = branch?.lat != null && branch?.lng != null ? { lat: Number(branch.lat), lng: Number(branch.lng) } : null;
  if (!shift.driverId || !shift.startedAt) return { vendor, orders: [], others: [], pings: [] as LocationPing[] };

  const windowEnd = new Date(Math.min(until.getTime(), (shift.endedAt ?? shift.endAt).getTime()));
  const [orderRows, pingRows] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where: {
        tenantId: shift.tenantId,
        driverId: shift.driverId,
        isTraining: false,
        assignedAt: { gte: shift.startedAt, lt: windowEnd },
      },
      select: {
        id: true,
        branchId: true,
        assignedAt: true,
        pickedUpAt: true,
        deliveredAt: true,
        returnedAt: true,
        cancelledAt: true,
        slaDeadline: true,
        dropoffLat: true,
        dropoffLng: true,
      },
    }),
    prisma.locationLog.findMany({
      where: { driverId: shift.driverId, capturedAt: { gte: shift.startedAt, lte: windowEnd } },
      select: { latitude: true, longitude: true, capturedAt: true },
      orderBy: { capturedAt: "asc" },
      take: 5000,
    }),
  ]);
  const toOrder = (o: (typeof orderRows)[number]): ShiftOrder => ({
    id: o.id,
    assignedAt: o.assignedAt,
    pickedUpAt: o.pickedUpAt,
    deliveredAt: o.deliveredAt,
    closedAt: o.returnedAt ?? o.cancelledAt,
    slaDeadline: o.slaDeadline,
    dropoffLat: num(o.dropoffLat),
    dropoffLng: num(o.dropoffLng),
  });
  return {
    vendor,
    orders: orderRows.filter((o) => o.branchId === shift.branchId).map(toOrder),
    others: orderRows.filter((o) => o.branchId !== shift.branchId).map(toOrder),
    pings: pingRows.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude), at: p.capturedAt })),
  };
}

async function computeForShift(shift: ShiftRow, now: Date) {
  const asOf = new Date(Math.min(now.getTime(), shift.endAt.getTime()));
  const [inputs, rates] = await Promise.all([inputsFor(shift, asOf), ratesFor(shift)]);
  const settlement = computePrivateShiftSettlement({
    startAt: shift.startAt,
    endAt: shift.endAt,
    startedAt: shift.startedAt,
    endedAt: shift.endedAt,
    asOf,
    // A branch with no pin cannot be measured against, so nobody is AWAY
    // from it: fail open, like every other location rule in this app.
    vendor: inputs.vendor ?? { lat: 0, lng: 0 },
    orders: inputs.orders,
    excuseOnlyOrders: inputs.others,
    pings: inputs.vendor ? inputs.pings : [],
    vendorHourlyKwd: rates.vendorHourlyKwd,
    fleetHourlyKwd: rates.fleetHourlyKwd,
  });
  return { settlement, rates, inputs };
}

/**
 * Snapshot the money on a finished shift. Idempotent: the deduction rows are
 * replaced wholesale, so running it twice writes the same answer once.
 */
export async function settlePrivateShift(tenantId: string, id: string, now = new Date()) {
  const shift = await prisma.privateShift.findFirst({ where: { id, tenantId } });
  if (!shift) throw fail(404, "SHIFT_NOT_FOUND", "Private shift not found");
  const { settlement, rates } = await computeForShift(shift, new Date(Math.max(now.getTime(), shift.endAt.getTime())));
  await prisma.$transaction(async (tx) => {
    await tx.privateShiftDeduction.deleteMany({ where: { tenantId, shiftId: id } });
    if (settlement.deductions.length) {
      await tx.privateShiftDeduction.createMany({
        data: settlement.deductions.map((d) => ({
          tenantId,
          shiftId: id,
          kind: d.kind,
          minutes: d.minutes,
          orderId: d.orderId ?? null,
          fromAt: d.fromAt ?? null,
          toAt: d.toAt ?? null,
        })),
      });
    }
    await tx.privateShift.update({
      where: { id },
      data: {
        scheduledMinutes: settlement.scheduledMinutes,
        lateDeductionMinutes: settlement.lateOrderMinutes + settlement.lateStartMinutes,
        awayDeductionMinutes: settlement.awayMinutes + settlement.earlyEndMinutes,
        billableMinutes: settlement.billableMinutes,
        vendorHourlyKwd: rates.vendorHourlyKwd,
        fleetHourlyKwd: rates.fleetHourlyKwd,
        vendorChargeKwd: settlement.vendorChargeKwd == null ? null : new Prisma.Decimal(settlement.vendorChargeKwd),
        fleetPayKwd: settlement.fleetPayKwd == null ? null : new Prisma.Decimal(settlement.fleetPayKwd),
        settledAt: now,
      },
    });
  });
  return settlement;
}

/**
 * The sweep: finish what has run out. Called from the minute cron, across
 * tenants on purpose (cron-internal, like the dispatch sweep).
 */
export async function completeDuePrivateShifts(now = new Date()): Promise<{ completed: number; expired: number }> {
  // eslint-disable-next-line no-prisma-without-tenant -- cron-internal: cross-tenant by design; every write re-filters on the row's own id and status.
  const due = await prisma.privateShift.findMany({
    where: { status: { in: ["BOOKED", "IN_PROGRESS"] }, endAt: { lte: now } },
    select: { id: true, tenantId: true, status: true },
    take: 200,
  });
  let completed = 0;
  for (const s of due) {
    const claimed = await prisma.privateShift.updateMany({
      where: { id: s.id, status: s.status },
      data: { status: "COMPLETED", ...(s.status === "BOOKED" ? { cancelReason: "NO_SHOW" } : {}) },
    });
    if (claimed.count === 0) continue;
    await settlePrivateShift(s.tenantId, s.id, now);
    completed += 1;
  }
  // eslint-disable-next-line no-prisma-without-tenant -- cron-internal: cross-tenant by design; every write re-filters on the row's own id and status.
  const expired = await prisma.privateShift.updateMany({
    where: { status: { in: ["OPEN", "PROPOSED"] }, endAt: { lte: now } },
    data: { status: "CANCELLED", cancelledAt: now, cancelReason: "NOT_BOOKED" },
  });
  return { completed, expired: expired.count };
}

// ─── The driver's side ──────────────────────────────────────────────────────

export interface DriverLike {
  id: string;
  tenantId: string;
  vehicleType: string;
  status: string;
  privateShiftEligible: boolean;
  fleetPartnerId: string | null;
}

export async function listForDriver(driver: DriverLike, now = new Date()) {
  const mine = await prisma.privateShift.findMany({
    where: {
      tenantId: driver.tenantId,
      driverId: driver.id,
      OR: [
        { status: { in: ["BOOKED", "IN_PROGRESS"] } },
        { status: "COMPLETED", endAt: { gte: new Date(now.getTime() - 7 * 1440 * MIN) } },
      ],
    },
    orderBy: { startAt: "asc" },
  });
  if (!driver.privateShiftEligible) {
    return { eligible: false, open: [], mine: await decorate(driver.tenantId, mine) };
  }
  const open = await prisma.privateShift.findMany({
    where: {
      tenantId: driver.tenantId,
      status: "OPEN",
      driverId: null,
      vehicleType: driver.vehicleType as VehicleTypeValue,
      startAt: { gt: now, lt: new Date(now.getTime() + 7 * 1440 * MIN) },
    },
    orderBy: { startAt: "asc" },
    take: 100,
  });
  const held = mine.filter((m) => m.status === "BOOKED" || m.status === "IN_PROGRESS");
  const free = open.filter((o) => !held.some((m) => m.startAt < o.endAt && o.startAt < m.endAt));
  return {
    eligible: true,
    open: await decorate(driver.tenantId, free),
    mine: await decorate(driver.tenantId, mine),
  };
}

export async function bookPrivateShift(driver: DriverLike, id: string, now = new Date()) {
  if (!driver.privateShiftEligible) throw fail(403, "NOT_ELIGIBLE", "You are not cleared for private shifts. Ask your supervisor.");
  if (driver.status !== "ACTIVE") throw fail(409, "DRIVER_INACTIVE", "This driver is not active");
  const shift = await prisma.privateShift.findFirst({ where: { id, tenantId: driver.tenantId } });
  if (!shift || shift.status !== "OPEN") throw fail(409, "NOT_OPEN", "That private shift is no longer open");
  if (shift.vehicleType !== driver.vehicleType) throw fail(409, "WRONG_VEHICLE", "That shift needs a different vehicle");
  if (shift.startAt <= now) throw fail(409, "ALREADY_STARTED", "That shift has already started");

  const clash = await prisma.privateShift.findFirst({
    where: {
      tenantId: driver.tenantId,
      driverId: driver.id,
      status: { in: ["BOOKED", "IN_PROGRESS"] },
      startAt: { lt: shift.endAt },
      endAt: { gt: shift.startAt },
    },
    select: { id: true },
  });
  if (clash) throw fail(409, "CLASHES", "You already have a private shift at that time");
  const regular = await prisma.shift.findFirst({
    where: {
      tenantId: driver.tenantId,
      driverId: driver.id,
      status: { in: ["BOOKED", "IN_PROGRESS"] },
      scheduledStart: { lt: shift.endAt },
      scheduledEnd: { gt: shift.startAt },
    },
    select: { id: true },
  });
  if (regular) throw fail(409, "CLASHES_WITH_SHIFT", "You have a regular shift at that time. Cancel it first.");

  // The guard is the claim: two drivers tapping the same shift, one wins.
  const claimed = await prisma.privateShift.updateMany({
    where: { id, tenantId: driver.tenantId, status: "OPEN", driverId: null },
    data: { status: "BOOKED", driverId: driver.id, fleetPartnerId: driver.fleetPartnerId, bookedAt: now },
  });
  if (claimed.count === 0) throw fail(409, "NOT_OPEN", "That private shift is no longer open");
  return { ok: true };
}

export async function releasePrivateShift(driver: DriverLike, id: string, now = new Date()) {
  const claimed = await prisma.privateShift.updateMany({
    where: { id, tenantId: driver.tenantId, driverId: driver.id, status: "BOOKED", startAt: { gt: now } },
    data: { status: "OPEN", driverId: null, fleetPartnerId: null, bookedAt: null },
  });
  if (claimed.count === 0) throw fail(409, "NOT_RELEASABLE", "Only a booked shift that has not started can be given back");
  return { ok: true };
}

/**
 * Start, standing at the shop. "He must start the shift at the vendor's
 * location": a fix more than GEOFENCE_METERS from the branch is refused with
 * the distance, so the driver knows how far off they are. A branch with no
 * pin, or a phone with no fix, cannot be checked: the start goes through and
 * says so, the same fail-open stance as the go-online zone gate.
 */
export async function startPrivateShift(
  driver: DriverLike,
  id: string,
  fix: { lat?: unknown; lng?: unknown },
  now = new Date(),
) {
  const shift = await prisma.privateShift.findFirst({ where: { id, tenantId: driver.tenantId, driverId: driver.id } });
  if (!shift || shift.status !== "BOOKED") throw fail(409, "NOT_BOOKED", "That shift is not booked by you");
  if (now.getTime() < shift.startAt.getTime() - EARLY_START_MIN * MIN) {
    throw fail(409, "TOO_EARLY", `You can start ${EARLY_START_MIN} minutes before the shift`);
  }
  if (now >= shift.endAt) throw fail(409, "SHIFT_OVER", "That shift has ended");

  const branch = await prisma.vendorBranch.findFirst({
    where: { id: shift.branchId, tenantId: driver.tenantId },
    select: { lat: true, lng: true },
  });
  const lat = Number(fix.lat);
  const lng = Number(fix.lng);
  const hasFix = fix.lat != null && fix.lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  let warning: string | null = null;
  if (branch?.lat != null && branch?.lng != null && hasFix) {
    const distanceM = Math.round(haversineMeters(lat, lng, Number(branch.lat), Number(branch.lng)));
    if (distanceM > GEOFENCE_METERS) {
      throw fail(409, "NOT_AT_VENDOR", "Go to the shop to start this shift", { distanceM, radiusM: GEOFENCE_METERS });
    }
  } else {
    warning = hasFix ? "BRANCH_HAS_NO_LOCATION" : "NO_LOCATION";
  }

  const claimed = await prisma.privateShift.updateMany({
    where: { id, tenantId: driver.tenantId, driverId: driver.id, status: "BOOKED" },
    data: {
      status: "IN_PROGRESS",
      startedAt: now,
      ...(hasFix ? { startLat: new Prisma.Decimal(lat), startLng: new Prisma.Decimal(lng) } : {}),
    },
  });
  if (claimed.count === 0) throw fail(409, "NOT_BOOKED", "That shift is not booked by you");

  // On duty means on the dispatch board: starting a private shift puts the
  // driver online, so the shop's orders can reach them at once.
  await goOnline(driver, hasFix ? { lat, lng } : null, now);
  return { ok: true, ...(warning ? { warning } : {}) };
}

async function goOnline(driver: DriverLike, fix: { lat: number; lng: number } | null, now: Date) {
  const existing = await prisma.courierOnlineSession.findFirst({
    where: { tenantId: driver.tenantId, driverId: driver.id, isOnline: true },
    orderBy: { startTime: "desc" },
  });
  const gps = fix ? { lastGpsAt: now, lastGpsLat: fix.lat, lastGpsLng: fix.lng } : {};
  if (existing) {
    if (existing.availability === "OFFLINE") {
      await prisma.courierOnlineSession.update({ where: { id: existing.id }, data: { availability: "ONLINE", ...gps } });
    } else if (fix) {
      await prisma.courierOnlineSession.update({ where: { id: existing.id }, data: gps });
    }
    return;
  }
  await prisma.courierOnlineSession.create({
    data: { tenantId: driver.tenantId, driverId: driver.id, isOnline: true, availability: "ONLINE", startTime: now, ...gps },
  });
}

export async function endPrivateShift(driver: DriverLike, id: string, now = new Date()) {
  const claimed = await prisma.privateShift.updateMany({
    where: { id, tenantId: driver.tenantId, driverId: driver.id, status: "IN_PROGRESS" },
    data: { status: "COMPLETED", endedAt: now },
  });
  if (claimed.count === 0) throw fail(409, "NOT_IN_PROGRESS", "That shift is not running");
  const settlement = await settlePrivateShift(driver.tenantId, id, now);
  return { ok: true, billableMinutes: settlement.billableMinutes, deductedMinutes: settlement.deductedMinutes };
}

/**
 * The driver's live card: the running or next shift, where they stand
 * against the rules right now, and the minutes deducted so far.
 */
export async function currentForDriver(driver: DriverLike, now = new Date()) {
  const shift =
    (await prisma.privateShift.findFirst({
      where: { tenantId: driver.tenantId, driverId: driver.id, status: "IN_PROGRESS" },
      orderBy: { startAt: "asc" },
    })) ??
    (await prisma.privateShift.findFirst({
      where: {
        tenantId: driver.tenantId,
        driverId: driver.id,
        status: "BOOKED",
        endAt: { gt: now },
        startAt: { lt: new Date(now.getTime() + 12 * 60 * MIN) },
      },
      orderBy: { startAt: "asc" },
    }));
  if (!shift) return { shift: null };
  const [decorated] = await decorate(driver.tenantId, [shift]);
  const branch = await prisma.vendorBranch.findFirst({
    where: { id: shift.branchId, tenantId: driver.tenantId },
    select: { lat: true, lng: true, address: true },
  });
  const vendorPoint = branch?.lat != null && branch?.lng != null ? { lat: Number(branch.lat), lng: Number(branch.lng) } : null;
  const base = {
    ...decorated,
    branchLocation: vendorPoint ? { ...vendorPoint, address: branch?.address ?? null } : null,
    canStartAt: new Date(shift.startAt.getTime() - EARLY_START_MIN * MIN).toISOString(),
    radiusM: GEOFENCE_METERS,
  };
  if (shift.status !== "IN_PROGRESS") return { shift: base, live: null };

  const { settlement, inputs } = await computeForShift(shift, now);
  const last = inputs.pings[inputs.pings.length - 1] ?? null;
  const live = vendorPoint
    ? liveStateOf({ now, vendor: vendorPoint, lastPing: last, orders: [...inputs.orders, ...inputs.others], pings: inputs.pings })
    : { state: "UNKNOWN" as const, returnByAt: null, distanceM: null };
  return {
    shift: base,
    live: {
      state: live.state,
      returnByAt: live.returnByAt?.toISOString() ?? null,
      distanceM: live.distanceM,
      deductedMinutes: settlement.deductedMinutes,
      awayMinutes: settlement.awayMinutes,
      lateOrderMinutes: settlement.lateOrderMinutes,
      lateStartMinutes: settlement.lateStartMinutes,
    },
  };
}

// ─── Plans and rates by vehicle ─────────────────────────────────────────────

export async function getVendorVehiclePlans(tenantId: string, vendorId: string) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, tenantId },
    select: { id: true, suitableVehicleTypes: true, deliveryPlanId: true, requiresCarOnly: true },
  });
  if (!vendor) throw fail(404, "VENDOR_NOT_FOUND", "Shop not found");
  const rows = await prisma.vendorVehiclePlan.findMany({ where: { tenantId, vendorId } });
  return {
    vehicleTypes: [...VEHICLE_TYPES],
    suitableVehicleTypes: vendor.suitableVehicleTypes,
    defaultDeliveryPlanId: vendor.deliveryPlanId,
    plans: VEHICLE_TYPES.map((vehicleType) => {
      const row = rows.find((r) => r.vehicleType === vehicleType);
      return {
        vehicleType,
        deliveryPlanId: row?.deliveryPlanId ?? null,
        perHourKwd: money(row?.perHourKwd),
      };
    }),
  };
}

function readMoney(v: unknown, label: string, max: number): Prisma.Decimal | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw fail(400, "BAD_RATE", `Enter ${label} of zero or more`);
  if (n > max) throw fail(400, "BAD_RATE", `That ${label} looks wrong. Check the amount.`);
  return new Prisma.Decimal(n.toFixed(3));
}

/**
 * Save the vehicle checkboxes and each vehicle's two plans. The vehicle list
 * also drives the existing car-only switch: a shop that suits cars alone is
 * a car-only shop for every order, which is what that switch always meant.
 */
export async function saveVendorVehiclePlans(params: {
  tenantId: string;
  vendorId: string;
  suitableVehicleTypes: unknown;
  plans: unknown;
}) {
  const { tenantId, vendorId } = params;
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId }, select: { id: true } });
  if (!vendor) throw fail(404, "VENDOR_NOT_FOUND", "Shop not found");
  if (!Array.isArray(params.suitableVehicleTypes) || !params.suitableVehicleTypes.every(isVehicleType)) {
    throw fail(400, "BAD_VEHICLE", "Choose vehicle types from the list");
  }
  const types = VEHICLE_TYPES.filter((t) => (params.suitableVehicleTypes as string[]).includes(t));
  const plans = Array.isArray(params.plans) ? (params.plans as Array<Record<string, unknown>>) : [];
  const planIds = plans.map((p) => p.deliveryPlanId).filter((v): v is string => typeof v === "string" && v.length > 0);
  if (planIds.length) {
    const found = await prisma.deliveryPlan.count({ where: { tenantId, id: { in: [...new Set(planIds)] } } });
    if (found !== new Set(planIds).size) throw fail(400, "BAD_PLAN", "A chosen delivery plan does not exist");
  }
  const parsed = plans
    .filter((p) => isVehicleType(p.vehicleType))
    .map((p) => ({
      vehicleType: p.vehicleType as VehicleTypeValue,
      deliveryPlanId: typeof p.deliveryPlanId === "string" && p.deliveryPlanId ? p.deliveryPlanId : null,
      perHourKwd: readMoney(p.perHourKwd, "an hourly rate", 100),
    }));

  await prisma.$transaction(async (tx) => {
    await tx.vendor.update({
      where: { id: vendorId },
      data: {
        suitableVehicleTypes: types,
        ...(types.length ? { requiresCarOnly: types.length === 1 && types[0] === "CAR" } : {}),
      },
    });
    for (const p of parsed) {
      await tx.vendorVehiclePlan.upsert({
        where: { vendorId_vehicleType: { vendorId, vehicleType: p.vehicleType } },
        create: { tenantId, vendorId, vehicleType: p.vehicleType, deliveryPlanId: p.deliveryPlanId, perHourKwd: p.perHourKwd },
        update: { deliveryPlanId: p.deliveryPlanId, perHourKwd: p.perHourKwd },
      });
    }
  });
  return getVendorVehiclePlans(tenantId, vendorId);
}

export async function getFleetVehicleRates(tenantId: string, fleetPartnerId: string) {
  const fleet = await prisma.fleetPartner.findFirst({
    where: { id: fleetPartnerId, tenantId },
    select: { id: true, flatFeePerOrderKwd: true, perKmFeeKwd: true, commercialModel: true },
  });
  if (!fleet) throw fail(404, "FLEET_NOT_FOUND", "Delivery company not found");
  const rows = await prisma.fleetVehicleRate.findMany({ where: { tenantId, fleetPartnerId } });
  return {
    vehicleTypes: [...VEHICLE_TYPES],
    commercialModel: fleet.commercialModel,
    baseFeePerOrderKwd: money(fleet.flatFeePerOrderKwd),
    perKmFeeKwd: money(fleet.perKmFeeKwd),
    rates: VEHICLE_TYPES.map((vehicleType) => {
      const row = rows.find((r) => r.vehicleType === vehicleType);
      return { vehicleType, perOrderKwd: money(row?.perOrderKwd), perHourKwd: money(row?.perHourKwd) };
    }),
  };
}

/** Parse and validate what a rates form posted. Shared by staff save and the portal's proposal. */
export function parseFleetVehicleRates(raw: unknown) {
  if (!Array.isArray(raw)) throw fail(400, "BAD_RATES", "Send a rate for each vehicle type");
  return (raw as Array<Record<string, unknown>>)
    .filter((r) => isVehicleType(r.vehicleType))
    .map((r) => ({
      vehicleType: r.vehicleType as VehicleTypeValue,
      perOrderKwd: readMoney(r.perOrderKwd, "a price per order", 50),
      perHourKwd: readMoney(r.perHourKwd, "an hourly rate", 100),
    }));
}

export async function writeFleetVehicleRates(
  tx: Prisma.TransactionClient,
  tenantId: string,
  fleetPartnerId: string,
  rates: ReturnType<typeof parseFleetVehicleRates>,
) {
  for (const r of rates) {
    await tx.fleetVehicleRate.upsert({
      where: { fleetPartnerId_vehicleType: { fleetPartnerId, vehicleType: r.vehicleType } },
      create: { tenantId, fleetPartnerId, vehicleType: r.vehicleType, perOrderKwd: r.perOrderKwd, perHourKwd: r.perHourKwd },
      update: { perOrderKwd: r.perOrderKwd, perHourKwd: r.perHourKwd },
    });
  }
}

export async function saveFleetVehicleRates(tenantId: string, fleetPartnerId: string, raw: unknown) {
  const fleet = await prisma.fleetPartner.findFirst({ where: { id: fleetPartnerId, tenantId }, select: { id: true } });
  if (!fleet) throw fail(404, "FLEET_NOT_FOUND", "Delivery company not found");
  const rates = parseFleetVehicleRates(raw);
  await prisma.$transaction((tx) => writeFleetVehicleRates(tx, tenantId, fleetPartnerId, rates));
  return getFleetVehicleRates(tenantId, fleetPartnerId);
}

/** Booked or running a private shift that covers this moment (with the early-start margin). */
export async function isOnPrivateShiftNow(tenantId: string, driverId: string, now = new Date()): Promise<boolean> {
  const row = await prisma.privateShift.findFirst({
    where: {
      tenantId,
      driverId,
      status: { in: ["BOOKED", "IN_PROGRESS"] },
      startAt: { lte: new Date(now.getTime() + EARLY_START_MIN * MIN) },
      endAt: { gt: now },
    },
    select: { id: true },
  });
  return !!row;
}
