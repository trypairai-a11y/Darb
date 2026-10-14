/**
 * Revision 24 (#8, #9) — where to put N private shifts in a day.
 *
 * Client note: "we should be able to enter the number of private shifts
 * needed, after that the system allocates which time to propose the shifts",
 * and for the shop: "put the number of shifts needed for each branch, after
 * which the allocating function would propose a plan for him and he can
 * adjust it".
 *
 * Same idea as the weekly roster (services/shiftPlanService.ts): read the
 * branch's own past orders, by hour, and put the drivers where the orders
 * are. Greedy and written down: each shift goes where the most uncovered
 * demand is, then that demand is marked covered by what one driver gets
 * through in an hour, and the next shift goes where the most is left. Two
 * shifts asked for at a branch with one dinner peak therefore land on the
 * peak together only when the peak is big enough to need both.
 *
 * Pure, so it is tested directly. Hours are Kuwait hours of the day, 0..23.
 */

/** Orders one private-shift driver gets through in an hour at one shop. */
export const ORDERS_PER_DRIVER_HOUR = 2;

export const MIN_SHIFT_HOURS = 2;
export const MAX_SHIFT_HOURS = 12;
export const MAX_SHIFTS_PER_PLAN = 20;

/**
 * Used when the branch has no history yet: a lunch and a dinner peak, which
 * is how a Kuwait restaurant or pharmacy day is shaped, so a new shop is not
 * proposed a 00:00 shift because every hour tied at zero.
 */
export const DEFAULT_HOURLY_PROFILE: readonly number[] = [
  0.5, 0.2, 0.1, 0, 0, 0, 0.1, 0.3, 0.6, 1, 1.5, 2.5,
  3.5, 3.5, 2.5, 1.5, 1.5, 2, 3, 4, 4.5, 4, 3, 1.5,
];

export function proposeShiftStarts(params: {
  hourlyDemand: readonly number[];
  count: number;
  hours: number;
  ordersPerDriverHour?: number;
}): number[] {
  const hours = Math.min(MAX_SHIFT_HOURS, Math.max(MIN_SHIFT_HOURS, Math.trunc(params.hours)));
  const count = Math.max(0, Math.min(MAX_SHIFTS_PER_PLAN, Math.trunc(params.count)));
  const perHour = params.ordersPerDriverHour ?? ORDERS_PER_DRIVER_HOUR;
  const source = params.hourlyDemand.length === 24 && params.hourlyDemand.some((n) => n > 0)
    ? params.hourlyDemand
    : DEFAULT_HOURLY_PROFILE;
  const residual = [...source];

  const starts: number[] = [];
  for (let i = 0; i < count; i++) {
    let best = 0;
    let bestScore = -Infinity;
    for (let s = 0; s + hours <= 24; s++) {
      let score = 0;
      for (let h = s; h < s + hours; h++) score += Math.max(0, residual[h]!);
      // Ties go to the earlier window, so the answer is stable for the
      // same input.
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = s;
      }
    }
    // Nothing left to cover: line the remaining shifts up on the busiest
    // window of the raw curve rather than at midnight.
    if (bestScore <= 0) best = starts.length ? starts[0]! : busiestWindow(source, hours);
    starts.push(best);
    for (let h = best; h < best + hours; h++) residual[h] = Math.max(0, residual[h]! - perHour);
  }
  return starts.sort((a, b) => a - b);
}

function busiestWindow(curve: readonly number[], hours: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let s = 0; s + hours <= 24; s++) {
    let score = 0;
    for (let h = s; h < s + hours; h++) score += curve[h] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

// ─── Kuwait time, UTC+3 all year (no daylight saving) ───────────────────────

export const KUWAIT_OFFSET_MIN = 180;

/** "2026-10-14" + minutes of the Kuwait day → the instant. */
export function kuwaitInstant(date: string, minutesOfDay: number): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + (minutesOfDay - KUWAIT_OFFSET_MIN) * 60_000);
}

export function kuwaitHourOf(at: Date): number {
  return new Date(at.getTime() + KUWAIT_OFFSET_MIN * 60_000).getUTCHours();
}

export function kuwaitDayOfWeek(at: Date): number {
  return new Date(at.getTime() + KUWAIT_OFFSET_MIN * 60_000).getUTCDay();
}

export function kuwaitDateOf(at: Date): string {
  return new Date(at.getTime() + KUWAIT_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
