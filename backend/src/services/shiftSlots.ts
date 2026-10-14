/**
 * Revision 24 (#3) — bookable shifts are 2, 3 or 4-hour slots.
 *
 * Client note: "Shifts must be either 2, 3, or 4-hour slots, and the driver
 * duty is 12 hours, so the driver must book more than one shift, not 12 hours
 * straight. ... the system should optimize the shifts to handle the peak
 * hours, so more drivers would be online at these times."
 *
 * One module owns what a slot is, so the plan generator, the capacity grid,
 * the driver app's slot list and the booking guard cannot disagree about it.
 *
 * A slot is a start time plus a length. `ShiftCapacity` rows carry both now
 * (`durationMinutes`, default 180), and the rules that make old data keep
 * working live in `slotsForDay`:
 *
 *  - A zone/weekday whose rows all sit on the eight legacy three-hour windows
 *    (or that has no rows at all) is read exactly as before: the eight
 *    windows are offered, a row caps its window, and a MISSING row means no
 *    cap. Nothing written before revision 24 changes meaning.
 *  - A zone/weekday the new planner laid out (any row off that grid: a 2h or
 *    4h slot, or a start like 08:00) offers exactly its rows. The default
 *    windows are not mixed in, or a driver could book an uncapped 07:00 window
 *    straight across the peak the plan was built to staff.
 *
 * `0` stays a real answer in both: a slot with maxDrivers 0 is closed.
 */

/** The lengths a bookable slot may have, in minutes. */
export const SLOT_DURATIONS_MINUTES = [120, 180, 240] as const;

/** What every row written before revision 24 was. */
export const DEFAULT_SLOT_MINUTES = 180;

/**
 * A driver's duty is 12 hours a day, made of several slots stacked. It is
 * also the cap: a driver cannot book more than this on one day.
 */
export const DUTY_TARGET_MINUTES = 720;

/** The eight three-hour windows the day was cut into before revision 24. */
export const LEGACY_WINDOW_STARTS = [
  "01:00",
  "04:00",
  "07:00",
  "10:00",
  "13:00",
  "16:00",
  "19:00",
  "22:00",
] as const;

export function isSlotDuration(n: unknown): n is 120 | 180 | 240 {
  return (SLOT_DURATIONS_MINUTES as readonly number[]).includes(Number(n));
}

/** "16:00" → 960. null when it is not a time. */
export function minutesOfDay(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 960 → "16:00", wrapping past midnight so a 22:00 start plus 4h ends 02:00. */
export function timeOfMinutes(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** A slot starts on the hour. "07:00" yes, "07:30" no. */
export function isSlotStart(value: string): boolean {
  const m = minutesOfDay(value);
  return m !== null && m % 60 === 0;
}

/** "07:00" → "07:00" normalised (zero-padded), or null. */
export function normaliseStart(value: string): string | null {
  const m = minutesOfDay(value);
  return m === null ? null : timeOfMinutes(m);
}

/** Minutes between two "HH:mm" texts, wrapping past midnight. 0 when unreadable. */
export function minutesBetween(start: string, end: string): number {
  const a = minutesOfDay(start);
  const b = minutesOfDay(end);
  if (a === null || b === null) return 0;
  const d = b - a;
  return d > 0 ? d : d + 1440;
}

export interface CapacityRowLike {
  startTime: string;
  durationMinutes?: number | null;
  maxDrivers: number;
}

export interface DaySlot {
  start: string;
  end: string;
  durationMinutes: number;
  /** null = no cap (a legacy window with no row). */
  capacity: number | null;
}

/** True when a zone/weekday's rows are anything but the legacy 3h grid. */
export function isPlannedLayout(rows: CapacityRowLike[]): boolean {
  return rows.some(
    (r) =>
      (r.durationMinutes ?? DEFAULT_SLOT_MINUTES) !== DEFAULT_SLOT_MINUTES ||
      !(LEGACY_WINDOW_STARTS as readonly string[]).includes(r.startTime),
  );
}

/**
 * The slots a zone offers on one weekday, given that zone/weekday's capacity
 * rows. See the module comment for the two modes.
 */
export function slotsForDay(rows: CapacityRowLike[]): DaySlot[] {
  if (!isPlannedLayout(rows)) {
    const capByStart = new Map(rows.map((r) => [r.startTime, r.maxDrivers]));
    return LEGACY_WINDOW_STARTS.map((start) => ({
      start,
      end: timeOfMinutes((minutesOfDay(start) ?? 0) + DEFAULT_SLOT_MINUTES),
      durationMinutes: DEFAULT_SLOT_MINUTES,
      capacity: capByStart.has(start) ? capByStart.get(start)! : null,
    }));
  }
  return [...rows]
    .sort((a, b) => (minutesOfDay(a.startTime) ?? 0) - (minutesOfDay(b.startTime) ?? 0))
    .map((r) => {
      const duration = r.durationMinutes ?? DEFAULT_SLOT_MINUTES;
      return {
        start: r.startTime,
        end: timeOfMinutes((minutesOfDay(r.startTime) ?? 0) + duration),
        durationMinutes: duration,
        capacity: r.maxDrivers,
      };
    });
}

/** Half-open interval overlap on epoch milliseconds. */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ─── The peak-coverage layout ─────────────────────────────────────────────

/**
 * Drivers each hour needs, from the average orders delivered in that hour.
 * Floored at `min` so a zone Darb serves is never dark, capped at `max` so
 * one freak hour cannot propose the whole fleet into it.
 */
export function needPerHour(
  ordersPerHour: number[],
  ordersPerDriverPerHour: number,
  min: number,
  max: number,
): number[] {
  return Array.from({ length: 24 }, (_, h) => {
    const avg = ordersPerHour[h] ?? 0;
    return Math.min(max, Math.max(min, Math.ceil(avg / ordersPerDriverPerHour)));
  });
}

/**
 * The slot length to start for a run of `run` consecutive hours that all
 * still need the drivers being placed. Picks the length that tiles the run
 * with the least spare: 5 hours is 3 + 2, not 4 + a 2h slot with an idle hour.
 */
function lengthForRun(run: number): number {
  if (run <= 2) return 2;
  if (run === 3) return 3;
  if (run === 4) return 4;
  if (run === 5 || run === 6) return 3;
  return 4;
}

export interface LaidSlot {
  startHour: number;
  durationHours: number;
  count: number;
}

/**
 * Place 2/3/4-hour slots so that every hour has at least `need[h]` drivers on.
 *
 * Walks the day hour by hour and, wherever cover falls short, starts as many
 * slots as are missing. All of them share one length (a zone has one slot per
 * start time), chosen from how long the shortfall lasts at that height. The
 * effect is a staircase that follows the demand curve: a quiet morning is a
 * couple of long slots, and the lunch and dinner peaks get extra short slots
 * stacked on top, which is "more drivers online at these times" rather than
 * the same number spread across twelve hours.
 *
 * Slots stay inside the day (a 23:00 shortfall starts a 22:00 two-hour slot),
 * so a plan's day never spills into the next one.
 */
export function layoutSlots(need: number[]): LaidSlot[] {
  const residual = Array.from({ length: 24 }, (_, h) => Math.max(0, Math.trunc(need[h] ?? 0)));
  const byStart = new Map<number, LaidSlot>();

  for (let h = 0; h < 24; h++) {
    const k = residual[h]!;
    if (k <= 0) continue;
    let run = 0;
    while (h + run < 24 && residual[h + run]! >= k) run++;
    let start = h;
    let length = lengthForRun(run);
    if (start + length > 24) {
      length = Math.max(2, 24 - start);
      start = 24 - length;
    }
    const existing = byStart.get(start);
    if (existing) {
      // Only reachable for the last hour of the day, whose slot was pulled
      // back to 22:00. Whatever already starts there covers 23:00 too.
      existing.count += k;
      length = existing.durationHours;
    } else {
      byStart.set(start, { startHour: start, durationHours: length, count: k });
    }
    for (let j = start; j < start + length && j < 24; j++) {
      residual[j] = Math.max(0, residual[j]! - k);
    }
  }

  return [...byStart.values()].sort((a, b) => a.startHour - b.startHour);
}

/** Drivers on per hour for a set of slots on one day (spill past 24:00 ignored). */
export function coverageOf(
  slots: Array<{ startHour: number; durationHours: number; count: number }>,
): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  for (const s of slots) {
    for (let j = s.startHour; j < s.startHour + s.durationHours && j < 24; j++) {
      out[j] = out[j]! + s.count;
    }
  }
  return out;
}
