// Revision 24 (#8, #9) — where the system proposes N private shifts.

import {
  DEFAULT_HOURLY_PROFILE,
  kuwaitDateOf,
  kuwaitHourOf,
  kuwaitInstant,
  proposeShiftStarts,
} from "../../services/privateShifts/privateShiftProposal";

function curve(peaks: Record<number, number>): number[] {
  return Array.from({ length: 24 }, (_, h) => peaks[h] ?? 0);
}

describe("proposeShiftStarts", () => {
  test("one shift goes on the busiest stretch", () => {
    const demand = curve({ 19: 6, 20: 8, 21: 6, 22: 2, 12: 3 });
    expect(proposeShiftStarts({ hourlyDemand: demand, count: 1, hours: 4 })).toEqual([19]);
  });

  test("a peak big enough for two gets both; a small one gets the second shift elsewhere", () => {
    const big = curve({ 19: 6, 20: 6, 21: 6, 22: 6, 12: 2, 13: 2 });
    expect(proposeShiftStarts({ hourlyDemand: big, count: 2, hours: 4 })).toEqual([19, 19]);

    const small = curve({ 19: 2, 20: 2, 21: 2, 22: 2, 12: 2, 13: 2 });
    const starts = proposeShiftStarts({ hourlyDemand: small, count: 2, hours: 4 });
    expect(starts).toContain(19);
    expect(starts.some((s) => s <= 13 && s + 4 > 12)).toBe(true);
  });

  test("no history falls back to the lunch and dinner profile, never a midnight shift", () => {
    const starts = proposeShiftStarts({ hourlyDemand: new Array(24).fill(0), count: 2, hours: 4 });
    expect(starts.every((s) => s >= 10)).toBe(true);
    expect(DEFAULT_HOURLY_PROFILE).toHaveLength(24);
  });

  test("shifts stay inside the day and the count and hours are clamped", () => {
    const starts = proposeShiftStarts({ hourlyDemand: curve({ 23: 9 }), count: 50, hours: 99 });
    expect(starts).toHaveLength(20);
    expect(starts.every((s) => s + 12 <= 24)).toBe(true);
  });
});

describe("Kuwait time", () => {
  test("a Kuwait wall-clock time round-trips through the instant", () => {
    const i = kuwaitInstant("2026-10-14", 19 * 60);
    expect(i.toISOString()).toBe("2026-10-14T16:00:00.000Z");
    expect(kuwaitHourOf(i)).toBe(19);
    expect(kuwaitDateOf(kuwaitInstant("2026-10-14", 23 * 60 + 30))).toBe("2026-10-14");
    // Past midnight lands on the next day.
    expect(kuwaitDateOf(kuwaitInstant("2026-10-14", 25 * 60))).toBe("2026-10-15");
  });
});
