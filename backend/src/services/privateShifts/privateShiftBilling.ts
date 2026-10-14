/**
 * Revision 24 (#8, #11) — what a private shift is worth.
 *
 * Client note: "it is based on the on-time rate, so if the driver takes 75
 * minutes to deliver a 45-minute order, the 30 minutes will be deducted from
 * shift time; if the driver is waiting without an order, the driver would be
 * paid without deduction." And for the driver: "he must start the shift at
 * the vendor's location, and after delivering any order he must come back
 * directly to the vendor's location, or time will be deducted ... he must
 * remain at the vendor's location while not having orders, until the shift
 * finishes, or time will be deducted from him."
 *
 * Everything here is PURE: it takes the shift, its orders and the driver's
 * location pings, and returns minutes and money. The service loads the rows
 * and snapshots the answer; the tests drive this file directly.
 *
 * The deductions, all in whole minutes:
 *
 *   LATE_START   the shift began after its start time (or never began).
 *   LATE_ORDER   an order delivered after its deadline: the overage is
 *                deducted. The deadline is the order's own `slaDeadline`,
 *                which is the promise the on-time KPI already measures; an
 *                order without one is held to DEFAULT_ORDER_ESTIMATE_MIN from
 *                assignment.
 *   AWAY         away from the shop (beyond GEOFENCE_METERS) with no order in
 *                hand, outside the return allowance after a delivery.
 *   EARLY_END    the driver ended the shift before its end time.
 *
 * A gap in the pings is NOT deducted past MAX_PING_GAP_MIN: a phone that
 * stopped reporting is not proof the driver left, the same fail-open stance
 * the go-online zone gate takes.
 */
import { Prisma } from "../../generated/prisma";
import { haversineMeters } from "../../utils/geo";

/** How close counts as "at the shop". Also the start-of-shift check. */
export const GEOFENCE_METERS = 150;
/** Added to the estimated drive back from a drop-off before AWAY starts counting. */
export const RETURN_GRACE_MIN = 10;
/** City driving speed used to estimate the drive back, same as dispatch's ETA. */
export const RETURN_SPEED_KMH = 30;
/** A ping vouches for at most this long after it; beyond, the time is unknown. */
export const MAX_PING_GAP_MIN = 5;
/** A stretch away shorter than this is GPS drift, not a trip. */
export const MIN_AWAY_STRETCH_MIN = 2;
/** The deadline for an order that carries none of its own. */
export const DEFAULT_ORDER_ESTIMATE_MIN = 45;

const MIN = 60_000;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocationPing extends LatLng {
  at: Date;
}

export interface ShiftOrder {
  id: string;
  assignedAt: Date | null;
  pickedUpAt?: Date | null;
  deliveredAt: Date | null;
  /** When the driver stopped carrying it for any other reason (returned, cancelled). */
  closedAt?: Date | null;
  slaDeadline: Date | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
}

export interface DeductionLine {
  kind: "LATE_START" | "LATE_ORDER" | "AWAY" | "EARLY_END";
  minutes: number;
  orderId?: string;
  fromAt?: Date;
  toAt?: Date;
}

export function isAtVendor(point: LatLng, vendor: LatLng, radiusM = GEOFENCE_METERS): boolean {
  return haversineMeters(point.lat, point.lng, vendor.lat, vendor.lng) <= radiusM;
}

/** Minutes an order ran past its deadline. 0 when on time or not delivered. */
export function lateMinutesForOrder(order: ShiftOrder): number {
  if (!order.deliveredAt) return 0;
  const deadline =
    order.slaDeadline ??
    (order.assignedAt ? new Date(order.assignedAt.getTime() + DEFAULT_ORDER_ESTIMATE_MIN * MIN) : null);
  if (!deadline) return 0;
  return Math.max(0, Math.floor((order.deliveredAt.getTime() - deadline.getTime()) / MIN));
}

/** Estimated minutes to drive from a drop-off back to the shop, plus the grace. */
export function returnAllowanceMinutes(order: ShiftOrder, vendor: LatLng): number {
  if (order.dropoffLat == null || order.dropoffLng == null) return RETURN_GRACE_MIN;
  const km = haversineMeters(order.dropoffLat, order.dropoffLng, vendor.lat, vendor.lng) / 1000;
  return Math.ceil((km / RETURN_SPEED_KMH) * 60) + RETURN_GRACE_MIN;
}

type Interval = { from: number; to: number };

function subtract(segment: Interval, cuts: Interval[]): Interval[] {
  let pieces: Interval[] = [segment];
  for (const cut of cuts) {
    const next: Interval[] = [];
    for (const p of pieces) {
      if (cut.to <= p.from || cut.from >= p.to) {
        next.push(p);
        continue;
      }
      if (cut.from > p.from) next.push({ from: p.from, to: cut.from });
      if (cut.to < p.to) next.push({ from: cut.to, to: p.to });
    }
    pieces = next;
  }
  return pieces;
}

/**
 * The windows in which being away from the shop is expected: carrying an
 * order, and driving back from the drop-off. A return window closes early the
 * moment a ping puts the driver back at the shop, so the allowance cannot be
 * banked and spent on a detour after checking in.
 */
export function excusedIntervals(params: {
  orders: ShiftOrder[];
  pings: LocationPing[];
  vendor: LatLng;
  until: Date;
}): Interval[] {
  const out: Interval[] = [];
  for (const o of params.orders) {
    const begin = o.assignedAt ?? o.pickedUpAt ?? null;
    if (!begin) continue;
    const end = o.deliveredAt ?? o.closedAt ?? params.until;
    out.push({ from: begin.getTime(), to: end.getTime() });
    if (!o.deliveredAt && !o.closedAt) continue;
    let returnTo = end.getTime() + returnAllowanceMinutes(o, params.vendor) * MIN;
    const back = params.pings.find(
      (p) => p.at.getTime() > end.getTime() && p.at.getTime() < returnTo && isAtVendor(p, params.vendor),
    );
    if (back) returnTo = back.at.getTime();
    out.push({ from: end.getTime(), to: returnTo });
  }
  return out;
}

/**
 * Stretches the driver was away from the shop with no excuse, between `from`
 * and `until`. Each ping vouches for its own position until the next ping, or
 * for MAX_PING_GAP_MIN, whichever comes first.
 */
export function awayStretches(params: {
  from: Date;
  until: Date;
  vendor: LatLng;
  pings: LocationPing[];
  orders: ShiftOrder[];
}): Array<{ fromAt: Date; toAt: Date; minutes: number }> {
  const from = params.from.getTime();
  const until = params.until.getTime();
  if (until <= from) return [];
  const pings = [...params.pings]
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const excused = excusedIntervals({ orders: params.orders, pings, vendor: params.vendor, until: params.until });

  const raw: Interval[] = [];
  for (let i = 0; i < pings.length; i++) {
    const p = pings[i]!;
    const t = p.at.getTime();
    const nextT = i + 1 < pings.length ? pings[i + 1]!.at.getTime() : Infinity;
    const segFrom = Math.max(t, from);
    const segTo = Math.min(nextT, t + MAX_PING_GAP_MIN * MIN, until);
    if (segTo <= segFrom) continue;
    if (isAtVendor(p, params.vendor)) continue;
    raw.push(...subtract({ from: segFrom, to: segTo }, excused));
  }

  // Merge touching pieces into stretches, then drop the GPS wobble.
  raw.sort((a, b) => a.from - b.from);
  const merged: Interval[] = [];
  for (const piece of raw) {
    const last = merged[merged.length - 1];
    if (last && piece.from <= last.to) last.to = Math.max(last.to, piece.to);
    else merged.push({ ...piece });
  }
  return merged
    .map((m) => ({ fromAt: new Date(m.from), toAt: new Date(m.to), minutes: Math.floor((m.to - m.from) / MIN) }))
    .filter((m) => m.minutes >= MIN_AWAY_STRETCH_MIN);
}

export interface SettlementInput {
  startAt: Date;
  endAt: Date;
  /** When the driver started at the shop. NULL = never started. */
  startedAt: Date | null;
  /** When the driver ended it. NULL = ran to the end (or is still running). */
  endedAt: Date | null;
  /** Evaluate up to this instant (now, for a live shift). Defaults to endAt. */
  asOf?: Date;
  vendor: LatLng;
  /** This branch's orders the driver carried: late ones are deducted. */
  orders: ShiftOrder[];
  /**
   * Anything else the driver was given in the window (ops can still assign by
   * hand). Carrying it excuses being away, but its lateness is not this shop's.
   */
  excuseOnlyOrders?: ShiftOrder[];
  pings: LocationPing[];
  vendorHourlyKwd: Prisma.Decimal.Value | null;
  fleetHourlyKwd: Prisma.Decimal.Value | null;
}

export interface Settlement {
  scheduledMinutes: number;
  lateStartMinutes: number;
  lateOrderMinutes: number;
  awayMinutes: number;
  earlyEndMinutes: number;
  deductedMinutes: number;
  billableMinutes: number;
  vendorChargeKwd: string | null;
  fleetPayKwd: string | null;
  deductions: DeductionLine[];
}

function money(minutes: number, hourly: Prisma.Decimal.Value | null): string | null {
  if (hourly == null) return null;
  return new Prisma.Decimal(hourly).mul(minutes).div(60).toDecimalPlaces(3).toFixed(3);
}

/**
 * The whole calculation. Deductions never take billable time below zero, and
 * a shift that never started bills nothing.
 */
export function computePrivateShiftSettlement(input: SettlementInput): Settlement {
  const start = input.startAt.getTime();
  const end = input.endAt.getTime();
  const scheduledMinutes = Math.max(0, Math.round((end - start) / MIN));
  const asOf = Math.min(input.asOf?.getTime() ?? end, end);
  const deductions: DeductionLine[] = [];

  if (!input.startedAt) {
    const missed = Math.max(0, Math.round((Math.min(asOf, end) - start) / MIN));
    if (missed > 0) {
      deductions.push({ kind: "LATE_START", minutes: missed, fromAt: input.startAt, toAt: new Date(Math.min(asOf, end)) });
    }
    return finish(scheduledMinutes, deductions, input);
  }

  const startedAt = Math.max(input.startedAt.getTime(), start);
  const lateStart = Math.max(0, Math.floor((startedAt - start) / MIN));
  if (lateStart > 0) {
    deductions.push({ kind: "LATE_START", minutes: lateStart, fromAt: input.startAt, toAt: new Date(startedAt) });
  }

  const workedUntil = Math.min(input.endedAt?.getTime() ?? end, end, asOf);

  for (const o of input.orders) {
    const late = lateMinutesForOrder(o);
    if (late > 0) deductions.push({ kind: "LATE_ORDER", minutes: late, orderId: o.id });
  }

  for (const s of awayStretches({
    from: new Date(startedAt),
    until: new Date(workedUntil),
    vendor: input.vendor,
    pings: input.pings,
    orders: [...input.orders, ...(input.excuseOnlyOrders ?? [])],
  })) {
    deductions.push({ kind: "AWAY", minutes: s.minutes, fromAt: s.fromAt, toAt: s.toAt });
  }

  if (input.endedAt && input.endedAt.getTime() < end) {
    const early = Math.max(0, Math.floor((end - Math.max(input.endedAt.getTime(), startedAt)) / MIN));
    if (early > 0) {
      deductions.push({ kind: "EARLY_END", minutes: early, fromAt: input.endedAt, toAt: input.endAt });
    }
  }

  return finish(scheduledMinutes, deductions, input);
}

function finish(scheduledMinutes: number, deductions: DeductionLine[], input: SettlementInput): Settlement {
  const sum = (kind: DeductionLine["kind"]) =>
    deductions.filter((d) => d.kind === kind).reduce((a, d) => a + d.minutes, 0);
  const deductedMinutes = Math.min(
    scheduledMinutes,
    deductions.reduce((a, d) => a + d.minutes, 0),
  );
  const billableMinutes = scheduledMinutes - deductedMinutes;
  return {
    scheduledMinutes,
    lateStartMinutes: sum("LATE_START"),
    lateOrderMinutes: sum("LATE_ORDER"),
    awayMinutes: sum("AWAY"),
    earlyEndMinutes: sum("EARLY_END"),
    deductedMinutes,
    billableMinutes,
    vendorChargeKwd: money(billableMinutes, input.vendorHourlyKwd),
    fleetPayKwd: money(billableMinutes, input.fleetHourlyKwd),
    deductions,
  };
}

export type LiveState = "AT_VENDOR" | "ON_ORDER" | "RETURNING" | "AWAY" | "UNKNOWN";

/**
 * What the driver app shows during the shift: where the driver stands against
 * the rules right now, and how long the return allowance has left.
 */
export function liveStateOf(params: {
  now: Date;
  vendor: LatLng;
  lastPing: LocationPing | null;
  orders: ShiftOrder[];
  pings: LocationPing[];
}): { state: LiveState; returnByAt: Date | null; distanceM: number | null } {
  const now = params.now.getTime();
  const ended = (d: Date | null | undefined) => !!d && d.getTime() <= now;
  const active = params.orders.find((o) => {
    const begin = o.assignedAt ?? o.pickedUpAt;
    return !!begin && begin.getTime() <= now && !ended(o.deliveredAt) && !ended(o.closedAt);
  });
  const distanceM = params.lastPing
    ? Math.round(haversineMeters(params.lastPing.lat, params.lastPing.lng, params.vendor.lat, params.vendor.lng))
    : null;
  if (active) return { state: "ON_ORDER", returnByAt: null, distanceM };
  if (!params.lastPing || now - params.lastPing.at.getTime() > MAX_PING_GAP_MIN * MIN) {
    return { state: "UNKNOWN", returnByAt: null, distanceM };
  }
  if (isAtVendor(params.lastPing, params.vendor)) return { state: "AT_VENDOR", returnByAt: null, distanceM };

  const excused = excusedIntervals({
    orders: params.orders,
    pings: params.pings,
    vendor: params.vendor,
    until: params.now,
  });
  const returning = excused.find((w) => w.from <= now && now < w.to);
  if (returning) return { state: "RETURNING", returnByAt: new Date(returning.to), distanceM };
  return { state: "AWAY", returnByAt: null, distanceM };
}
